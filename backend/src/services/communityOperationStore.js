import { createHash, randomUUID } from "node:crypto";

const ROOT_PATH = "voxel/v1/communityOperations";
const CLAIM_TTL_MS = 45_000;
const CLAIM_CANDIDATE_LIMIT = 30;
const RECENT_SCAN_LIMIT = 100;
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);
const ALLOWED_TYPES = new Set([
  "community-add-member",
  "community-remove-member",
  "community-set-rank"
]);

function now() {
  return Date.now();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeCommunityName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function operationResourceKey(payload) {
  const community = normalizeCommunityName(payload?.communityName);
  const userId = Number(payload?.targetRobloxUserId ?? 0);
  return createHash("sha256").update(`${community}:${userId}`).digest("hex").slice(0, 40);
}

function normalizeOperation(snapshotValue) {
  if (!snapshotValue || typeof snapshotValue !== "object") return null;
  return {
    ...snapshotValue,
    id: String(snapshotValue.id ?? ""),
    type: String(snapshotValue.type ?? ""),
    status: String(snapshotValue.status ?? "pending"),
    payload: snapshotValue.payload && typeof snapshotValue.payload === "object"
      ? snapshotValue.payload
      : {},
    createdAt: Number(snapshotValue.createdAt ?? 0),
    updatedAt: Number(snapshotValue.updatedAt ?? 0),
    attempts: Math.max(0, Number(snapshotValue.attempts ?? 0))
  };
}

export class CommunityOperationStore {
  constructor({ database }) {
    this.root = database.ref(ROOT_PATH);
    this.operationsRef = this.root.child("operations");
    this.pendingRef = this.root.child("pending");
    this.recentRef = this.root.child("recent");
    this.locksRef = this.root.child("locks");
  }

  async enqueue({ type, payload, createdByDiscordId }) {
    if (!ALLOWED_TYPES.has(type)) {
      throw new Error(`Unsupported community operation type: ${type}`);
    }

    const id = randomUUID();
    const timestamp = now();
    const record = {
      id,
      type,
      payload: clone(payload) ?? {},
      resourceKey: operationResourceKey(payload),
      status: "pending",
      createdByDiscordId: String(createdByDiscordId ?? ""),
      createdAt: timestamp,
      updatedAt: timestamp,
      attempts: 0,
      claimServerId: null,
      claimExpiresAt: 0,
      lastServerId: null,
      completedAt: null,
      result: null,
      error: null
    };

    await this.root.update({
      [`operations/${id}`]: record,
      [`pending/${id}`]: timestamp,
      [`recent/${id}`]: timestamp
    });

    return record;
  }

  async get(id) {
    const snapshot = await this.operationsRef.child(String(id)).get();
    return normalizeOperation(snapshot.val());
  }

  async claimNext(serverId) {
    const timestamp = now();
    const pendingSnapshot = await this.pendingRef
      .orderByValue()
      .limitToFirst(CLAIM_CANDIDATE_LIMIT)
      .get();

    const candidates = [];
    pendingSnapshot.forEach((child) => {
      candidates.push({ id: child.key, createdAt: Number(child.val() ?? 0) });
    });
    candidates.sort((a, b) => a.createdAt - b.createdAt);

    for (const candidate of candidates) {
      const operationRef = this.operationsRef.child(candidate.id);
      const snapshot = await operationRef.get();
      const operation = normalizeOperation(snapshot.val());

      if (!operation || TERMINAL_STATUSES.has(operation.status)) {
        await this.pendingRef.child(candidate.id).remove().catch(() => {});
        continue;
      }

      const resourceKey = operation.resourceKey || operationResourceKey(operation.payload);
      const lockRef = this.locksRef.child(resourceKey);
      const lock = await lockRef.transaction((current) => {
        const currentExpiresAt = Number(current?.expiresAt ?? 0);
        if (current?.operationId && currentExpiresAt > timestamp) return;

        return {
          operationId: candidate.id,
          serverId,
          expiresAt: timestamp + CLAIM_TTL_MS,
          claimedAt: timestamp
        };
      });

      if (!lock.committed) continue;

      const claim = await operationRef.transaction((current) => {
        if (!current || typeof current !== "object") return;
        if (TERMINAL_STATUSES.has(String(current.status ?? ""))) return;

        const activeClaim = String(current.status ?? "") === "processing"
          && Number(current.claimExpiresAt ?? 0) > timestamp;
        if (activeClaim) return;

        return {
          ...current,
          resourceKey,
          status: "processing",
          claimServerId: serverId,
          claimExpiresAt: timestamp + CLAIM_TTL_MS,
          lastServerId: serverId,
          attempts: Math.max(0, Number(current.attempts ?? 0)) + 1,
          updatedAt: timestamp
        };
      });

      if (!claim.committed) {
        await this.releaseLock(resourceKey, candidate.id, serverId);
        continue;
      }

      const claimed = normalizeOperation(claim.snapshot.val());
      if (!claimed) {
        await this.releaseLock(resourceKey, candidate.id, serverId);
        continue;
      }

      return {
        id: claimed.id,
        type: claimed.type,
        payload: clone(claimed.payload)
      };
    }

    return null;
  }

  async complete({ serverId, actionId, success, data = null, error = null }) {
    const operationRef = this.operationsRef.child(String(actionId));
    const timestamp = now();
    let resourceKey = null;

    const result = await operationRef.transaction((current) => {
      if (!current || typeof current !== "object") return;
      if (String(current.status ?? "") !== "processing") return;
      if (String(current.claimServerId ?? "") !== String(serverId)) return;

      resourceKey = String(current.resourceKey || operationResourceKey(current.payload));
      return {
        ...current,
        status: success ? "completed" : "failed",
        claimServerId: null,
        claimExpiresAt: 0,
        updatedAt: timestamp,
        completedAt: timestamp,
        result: success ? clone(data) : null,
        error: success ? null : String(error || "O servidor do jogo recusou a operação.").slice(0, 1000)
      };
    });

    if (!result.committed) return false;

    await this.pendingRef.child(String(actionId)).remove().catch(() => {});
    if (resourceKey) await this.releaseLock(resourceKey, String(actionId), String(serverId));
    return true;
  }

  async cancel(id, cancelledByDiscordId) {
    const operationRef = this.operationsRef.child(String(id));
    const timestamp = now();

    const result = await operationRef.transaction((current) => {
      if (!current || typeof current !== "object") return;
      if (String(current.status ?? "") !== "pending") return;

      return {
        ...current,
        status: "cancelled",
        cancelledByDiscordId: String(cancelledByDiscordId ?? ""),
        cancelledAt: timestamp,
        updatedAt: timestamp,
        completedAt: timestamp,
        claimServerId: null,
        claimExpiresAt: 0
      };
    });

    if (!result.committed) return null;
    await this.pendingRef.child(String(id)).remove().catch(() => {});
    return normalizeOperation(result.snapshot.val());
  }

  async retry(id, retriedByDiscordId) {
    const operationRef = this.operationsRef.child(String(id));
    const timestamp = now();

    const result = await operationRef.transaction((current) => {
      if (!current || typeof current !== "object") return;
      const status = String(current.status ?? "");
      if (status !== "failed" && status !== "cancelled") return;

      return {
        ...current,
        status: "pending",
        retriedByDiscordId: String(retriedByDiscordId ?? ""),
        retriedAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
        claimServerId: null,
        claimExpiresAt: 0,
        result: null,
        error: null
      };
    });

    if (!result.committed) return null;
    await this.pendingRef.child(String(id)).set(timestamp);
    await this.recentRef.child(String(id)).set(timestamp);
    return normalizeOperation(result.snapshot.val());
  }

  async list({ status = "active", limit = 20 } = {}) {
    const boundedLimit = Math.max(1, Math.min(50, Number(limit) || 20));
    const recentSnapshot = await this.recentRef
      .orderByValue()
      .limitToLast(RECENT_SCAN_LIMIT)
      .get();

    const ids = [];
    recentSnapshot.forEach((child) => ids.push({ id: child.key, order: Number(child.val() ?? 0) }));
    ids.sort((a, b) => b.order - a.order);

    const snapshots = await Promise.all(
      ids.map((entry) => this.operationsRef.child(entry.id).get())
    );

    const operations = [];
    for (const snapshot of snapshots) {
      const operation = normalizeOperation(snapshot.val());
      if (!operation) continue;

      const matches = status === "all"
        || (status === "active" && (operation.status === "pending" || operation.status === "processing"))
        || operation.status === status;
      if (!matches) continue;

      operations.push(operation);
      if (operations.length >= boundedLimit) break;
    }

    return operations;
  }

  async waitForTerminal(id, timeoutMs = 6_000) {
    const deadline = now() + Math.max(0, Number(timeoutMs) || 0);
    while (now() <= deadline) {
      const operation = await this.get(id);
      if (!operation || TERMINAL_STATUSES.has(operation.status)) return operation;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return this.get(id);
  }

  async releaseLock(resourceKey, operationId, serverId) {
    const lockRef = this.locksRef.child(String(resourceKey));
    await lockRef.transaction((current) => {
      if (!current || typeof current !== "object") return null;
      if (String(current.operationId ?? "") !== String(operationId)) return;
      if (String(current.serverId ?? "") !== String(serverId)) return;
      return null;
    }).catch(() => {});
  }
}
