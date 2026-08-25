import { createHash, randomUUID } from "node:crypto";

const ROOT_PATH = "voxel/v1/communityOperations";
const CLAIM_TTL_MS = 45_000;
const CLAIM_CANDIDATE_LIMIT = 100;
const RECENT_SCAN_LIMIT = 200;
const REPAIR_SCAN_INTERVAL_MS = 15_000;
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);
const ACTIVE_STATUSES = new Set(["pending", "processing"]);
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
    attempts: Math.max(0, Number(snapshotValue.attempts ?? 0)),
    queueKey: typeof snapshotValue.queueKey === "string" ? snapshotValue.queueKey : null,
    recentKey: typeof snapshotValue.recentKey === "string" ? snapshotValue.recentKey : null
  };
}

function indexTimestamp(value, fallback = now()) {
  const parsed = Math.floor(Number(value));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function makeIndexKey(timestamp, operationId) {
  return `${String(indexTimestamp(timestamp)).padStart(13, "0")}_${String(operationId)}`;
}

function validateOperation(operation) {
  if (!operation?.id) return "Operação sem ID.";
  if (!ALLOWED_TYPES.has(operation.type)) return `Tipo de operação inválido: ${operation.type || "vazio"}.`;

  const communityName = String(operation.payload?.communityName ?? "").trim();
  if (!communityName) return "Comunidade não informada.";

  const userId = Number(operation.payload?.targetRobloxUserId ?? 0);
  if (!Number.isSafeInteger(userId) || userId <= 0) return "Roblox UserId inválido.";

  if (operation.type === "community-set-rank" || operation.type === "community-add-member") {
    const rank = Number(operation.payload?.rank ?? 0);
    if (!Number.isInteger(rank) || rank <= 0 || rank > 255) return "Rank inválido.";
  }

  return null;
}

function errorSummary(error) {
  const message = typeof error?.message === "string" && error.message.trim()
    ? error.message.trim()
    : String(error ?? "Unknown queue error");
  return message.slice(0, 500);
}

export class CommunityOperationStore {
  constructor({ database }) {
    this.root = database.ref(ROOT_PATH);
    this.operationsRef = this.root.child("operations");
    this.pendingRef = this.root.child("pendingV2");
    this.recentRef = this.root.child("recentV2");
    this.legacyPendingRef = this.root.child("pending");
    this.legacyRecentRef = this.root.child("recent");
    this.locksRef = this.root.child("locks");

    this.initPromise = null;
    this.lastError = null;
    this.lastErrorAt = 0;
    this.lastClaimAt = 0;
    this.lastClaimedOperationId = null;
    this.lastRepairScanAt = 0;
    this.lastRepairCount = 0;
  }

  async init() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.migrateLegacyIndexes()
      .then(async (result) => {
        const repaired = await this.repairRecoverableIndexes(CLAIM_CANDIDATE_LIMIT);
        this.clearError();
        return { ...result, repaired: repaired.length };
      })
      .catch((error) => {
        this.recordError(error);
        this.initPromise = null;
        throw error;
      });

    return this.initPromise;
  }

  async migrateLegacyIndexes() {
    const [legacyPendingSnapshot, legacyRecentSnapshot] = await Promise.all([
      this.legacyPendingRef.get(),
      this.legacyRecentRef.get()
    ]);

    const pendingEntries = [];
    legacyPendingSnapshot.forEach((child) => {
      if (!child.key) return;
      pendingEntries.push({
        id: child.key,
        timestamp: indexTimestamp(child.val(), 0)
      });
    });

    const updates = {};
    let migratedPending = 0;
    let migratedRecent = 0;

    if (pendingEntries.length > 0) {
      const operationSnapshots = await Promise.all(
        pendingEntries.map((entry) => this.operationsRef.child(entry.id).get())
      );

      for (let index = 0; index < pendingEntries.length; index += 1) {
        const entry = pendingEntries[index];
        const operation = normalizeOperation(operationSnapshots[index].val());

        if (operation && ACTIVE_STATUSES.has(operation.status)) {
          const queueKey = operation.queueKey
            || makeIndexKey(entry.timestamp || operation.createdAt, entry.id);
          updates[`pendingV2/${queueKey}`] = entry.id;
          updates[`operations/${entry.id}/queueKey`] = queueKey;
          migratedPending += 1;
        }

        updates[`pending/${entry.id}`] = null;
      }
    }

    legacyRecentSnapshot.forEach((child) => {
      if (!child.key) return;
      const timestamp = indexTimestamp(child.val(), 0);
      const recentKey = makeIndexKey(timestamp, child.key);
      updates[`recentV2/${recentKey}`] = child.key;
      updates[`recent/${child.key}`] = null;
      migratedRecent += 1;
    });

    if (Object.keys(updates).length > 0) {
      await this.root.update(updates);
    }

    if (migratedPending > 0 || migratedRecent > 0) {
      console.log(`[community-queue] Migrated legacy indexes: ${migratedPending} pending, ${migratedRecent} recent.`);
    }

    return { migratedPending, migratedRecent };
  }

  recordError(error) {
    this.lastError = errorSummary(error);
    this.lastErrorAt = now();
  }

  clearError() {
    this.lastError = null;
    this.lastErrorAt = 0;
  }

  async enqueue({ type, payload, createdByDiscordId }) {
    await this.init();

    if (!ALLOWED_TYPES.has(type)) {
      throw new Error(`Unsupported community operation type: ${type}`);
    }

    const id = randomUUID();
    const timestamp = now();
    const queueKey = makeIndexKey(timestamp, id);
    const recentKey = queueKey;
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
      error: null,
      queueKey,
      recentKey
    };

    const validationError = validateOperation(record);
    if (validationError) throw new Error(validationError);

    await this.root.update({
      [`operations/${id}`]: record,
      [`pendingV2/${queueKey}`]: id,
      [`recentV2/${recentKey}`]: id
    });

    return record;
  }

  async get(id) {
    await this.init();
    const snapshot = await this.operationsRef.child(String(id)).get();
    return normalizeOperation(snapshot.val());
  }

  async readIndex(reference, { newest = false, limit = 100 } = {}) {
    const boundedLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const query = newest
      ? reference.orderByKey().limitToLast(boundedLimit)
      : reference.orderByKey().limitToFirst(boundedLimit);
    const snapshot = await query.get();
    const entries = [];

    snapshot.forEach((child) => {
      if (!child.key) return;
      const operationId = typeof child.val() === "string" ? child.val() : String(child.val() ?? "");
      if (!operationId) return;
      entries.push({ indexKey: child.key, id: operationId });
    });

    if (newest) entries.reverse();
    return entries;
  }

  async repairRecoverableIndexes(limit = CLAIM_CANDIDATE_LIMIT) {
    const timestamp = now();
    this.lastRepairScanAt = timestamp;

    const snapshot = await this.operationsRef.get();
    const recoverable = [];

    snapshot.forEach((child) => {
      if (!child.key) return;

      const raw = child.val();
      if (!raw || typeof raw !== "object") return;

      const operation = normalizeOperation({
        ...raw,
        id: raw.id || child.key
      });
      if (!operation) return;

      const staleProcessing = operation.status === "processing"
        && Number(operation.claimExpiresAt ?? 0) <= timestamp;
      if (operation.status !== "pending" && !staleProcessing) return;

      recoverable.push(operation);
    });

    recoverable.sort((left, right) => {
      const leftAt = indexTimestamp(left.createdAt || left.updatedAt, 0);
      const rightAt = indexTimestamp(right.createdAt || right.updatedAt, 0);
      return leftAt - rightAt || left.id.localeCompare(right.id);
    });

    const boundedLimit = Math.max(1, Math.min(500, Number(limit) || CLAIM_CANDIDATE_LIMIT));
    const selected = recoverable.slice(0, boundedLimit);
    if (selected.length === 0) return [];

    const updates = {};
    const candidates = [];

    for (const operation of selected) {
      const queueKey = operation.queueKey
        || makeIndexKey(operation.createdAt || operation.updatedAt, operation.id);
      const recentKey = operation.recentKey
        || makeIndexKey(operation.createdAt || operation.updatedAt, operation.id);

      updates[`pendingV2/${queueKey}`] = operation.id;

      if (operation.queueKey !== queueKey) {
        updates[`operations/${operation.id}/queueKey`] = queueKey;
      }

      if (!operation.recentKey) {
        updates[`recentV2/${recentKey}`] = operation.id;
        updates[`operations/${operation.id}/recentKey`] = recentKey;
      }

      candidates.push({
        indexKey: queueKey,
        id: operation.id
      });
    }

    await this.root.update(updates);
    this.lastRepairCount = candidates.length;
    return candidates;
  }

  async claimFromCandidates(serverId, candidates) {
    const timestamp = now();

    for (const candidate of candidates) {
      try {
        const operationRef = this.operationsRef.child(candidate.id);
        const snapshot = await operationRef.get();
        const operation = normalizeOperation(snapshot.val());

        if (!operation || TERMINAL_STATUSES.has(operation.status)) {
          await this.pendingRef.child(candidate.indexKey).remove().catch(() => {});
          continue;
        }

        if (operation.queueKey && operation.queueKey !== candidate.indexKey) {
          await this.root.update({
            [`pendingV2/${candidate.indexKey}`]: null,
            [`pendingV2/${operation.queueKey}`]: candidate.id
          }).catch(() => {});
          continue;
        }

        const validationError = validateOperation(operation);
        if (validationError) {
          await this.failInvalidOperation(operationRef, candidate.indexKey, validationError);
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
            queueKey: candidate.indexKey,
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

        this.lastClaimAt = timestamp;
        this.lastClaimedOperationId = claimed.id;
        this.clearError();

        return {
          id: claimed.id,
          type: claimed.type,
          payload: clone(claimed.payload)
        };
      } catch (error) {
        this.recordError(error);
        console.error(`[community-queue] Failed to inspect/claim ${candidate.id}:`, error);
      }
    }

    return null;
  }

  async claimNext(serverId) {
    await this.init();

    let candidates;
    try {
      candidates = await this.readIndex(this.pendingRef, {
        newest: false,
        limit: CLAIM_CANDIDATE_LIMIT
      });
    } catch (error) {
      this.recordError(error);
      throw error;
    }

    const indexedClaim = await this.claimFromCandidates(serverId, candidates);
    if (indexedClaim) return indexedClaim;

    // operations/ is the source of truth. Repair orphaned/stale indexes on demand.
    if (candidates.length === 0 && now() - this.lastRepairScanAt < REPAIR_SCAN_INTERVAL_MS) {
      return null;
    }

    let recoveredCandidates;
    try {
      recoveredCandidates = await this.repairRecoverableIndexes(CLAIM_CANDIDATE_LIMIT);
    } catch (error) {
      this.recordError(error);
      throw error;
    }

    if (recoveredCandidates.length === 0) return null;
    return this.claimFromCandidates(serverId, recoveredCandidates);
  }

  async failInvalidOperation(operationRef, queueKey, reason) {
    const timestamp = now();
    await operationRef.transaction((current) => {
      if (!current || typeof current !== "object") return;
      if (TERMINAL_STATUSES.has(String(current.status ?? ""))) return;

      return {
        ...current,
        status: "failed",
        claimServerId: null,
        claimExpiresAt: 0,
        updatedAt: timestamp,
        completedAt: timestamp,
        result: null,
        error: `Operação inválida: ${String(reason).slice(0, 800)}`
      };
    });

    await this.pendingRef.child(queueKey).remove().catch(() => {});
  }

  async complete({ serverId, actionId, success, data = null, error = null }) {
    await this.init();

    const operationRef = this.operationsRef.child(String(actionId));
    const timestamp = now();
    let resourceKey = null;
    let queueKey = null;

    const result = await operationRef.transaction((current) => {
      if (!current || typeof current !== "object") return;
      if (String(current.status ?? "") !== "processing") return;
      if (String(current.claimServerId ?? "") !== String(serverId)) return;

      resourceKey = String(current.resourceKey || operationResourceKey(current.payload));
      queueKey = typeof current.queueKey === "string" ? current.queueKey : null;
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

    if (queueKey) await this.pendingRef.child(queueKey).remove().catch(() => {});
    if (resourceKey) await this.releaseLock(resourceKey, String(actionId), String(serverId));
    return true;
  }

  async cancel(id, cancelledByDiscordId) {
    await this.init();

    const operationId = String(id);
    const operationRef = this.operationsRef.child(operationId);
    const timestamp = now();
    let queueKey = null;
    let resourceKey = null;
    let claimServerId = null;

    const result = await operationRef.transaction((current) => {
      if (!current || typeof current !== "object") return;

      const status = String(current.status ?? "");
      if (status === "cancelled") return current;

      const staleProcessing = status === "processing"
        && Number(current.claimExpiresAt ?? 0) <= timestamp;
      if (status !== "pending" && !staleProcessing) return;

      queueKey = typeof current.queueKey === "string" ? current.queueKey : null;
      resourceKey = typeof current.resourceKey === "string"
        ? current.resourceKey
        : operationResourceKey(current.payload);
      claimServerId = typeof current.claimServerId === "string"
        ? current.claimServerId
        : null;

      return {
        ...current,
        status: "cancelled",
        cancelledByDiscordId: String(cancelledByDiscordId ?? ""),
        cancelledAt: timestamp,
        updatedAt: timestamp,
        completedAt: timestamp,
        claimServerId: null,
        claimExpiresAt: 0,
        error: null
      };
    });

    if (!result.committed) {
      const latest = normalizeOperation((await operationRef.get()).val());
      return latest?.status === "cancelled" ? latest : null;
    }

    const cancelled = normalizeOperation(result.snapshot.val());
    if (!cancelled || cancelled.status !== "cancelled") return null;

    if (queueKey) {
      await this.pendingRef.child(queueKey).remove().catch(() => {});
    } else {
      const pendingSnapshot = await this.pendingRef.get().catch(() => null);
      const cleanup = {};

      pendingSnapshot?.forEach((child) => {
        if (String(child.val() ?? "") === operationId && child.key) {
          cleanup[`pendingV2/${child.key}`] = null;
        }
      });

      if (Object.keys(cleanup).length > 0) {
        await this.root.update(cleanup).catch(() => {});
      }
    }

    if (resourceKey && claimServerId) {
      await this.releaseLock(resourceKey, operationId, claimServerId);
    }

    return cancelled;
  }

  async retry(id, retriedByDiscordId) {
    await this.init();

    const operationRef = this.operationsRef.child(String(id));
    const timestamp = now();
    const queueKey = makeIndexKey(timestamp, id);
    const recentKey = queueKey;
    let previousQueueKey = null;
    let previousRecentKey = null;

    const result = await operationRef.transaction((current) => {
      if (!current || typeof current !== "object") return;
      const status = String(current.status ?? "");
      if (status !== "failed" && status !== "cancelled") return;

      previousQueueKey = typeof current.queueKey === "string" ? current.queueKey : null;
      previousRecentKey = typeof current.recentKey === "string" ? current.recentKey : null;

      return {
        ...current,
        status: "pending",
        retriedByDiscordId: String(retriedByDiscordId ?? ""),
        retriedAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
        claimServerId: null,
        claimExpiresAt: 0,
        queueKey,
        recentKey,
        result: null,
        error: null
      };
    });

    if (!result.committed) return null;

    const updates = {
      [`pendingV2/${queueKey}`]: String(id),
      [`recentV2/${recentKey}`]: String(id)
    };
    if (previousQueueKey && previousQueueKey !== queueKey) updates[`pendingV2/${previousQueueKey}`] = null;
    if (previousRecentKey && previousRecentKey !== recentKey) updates[`recentV2/${previousRecentKey}`] = null;
    await this.root.update(updates);

    return normalizeOperation(result.snapshot.val());
  }

  async list({ status = "active", limit = 20 } = {}) {
    await this.init();

    const boundedLimit = Math.max(1, Math.min(50, Number(limit) || 20));
    const entries = await this.readIndex(this.recentRef, {
      newest: true,
      limit: RECENT_SCAN_LIMIT
    });
    const seen = new Set();
    const operations = [];

    for (const entry of entries) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);

      const snapshot = await this.operationsRef.child(entry.id).get();
      const operation = normalizeOperation(snapshot.val());
      if (!operation) {
        await this.recentRef.child(entry.indexKey).remove().catch(() => {});
        continue;
      }

      const matches = status === "all"
        || (status === "active" && ACTIVE_STATUSES.has(operation.status))
        || operation.status === status;
      if (!matches) continue;

      operations.push(operation);
      if (operations.length >= boundedLimit) break;
    }

    return operations;
  }

  async diagnostics() {
    await this.init();

    const [pendingSnapshot, recentSnapshot, operationsSnapshot] = await Promise.all([
      this.pendingRef.get(),
      this.recentRef.get(),
      this.operationsRef.get()
    ]);

    const indexedIds = new Set();
    pendingSnapshot.forEach((child) => {
      const id = String(child.val() ?? "");
      if (id) indexedIds.add(id);
    });

    const timestamp = now();
    let activeOperationCount = 0;
    let orphanedOperationCount = 0;
    let staleProcessingCount = 0;

    operationsSnapshot.forEach((child) => {
      if (!child.key) return;
      const raw = child.val();
      if (!raw || typeof raw !== "object") return;

      const operation = normalizeOperation({
        ...raw,
        id: raw.id || child.key
      });
      if (!operation) return;

      const staleProcessing = operation.status === "processing"
        && Number(operation.claimExpiresAt ?? 0) <= timestamp;
      const active = operation.status === "pending" || staleProcessing;
      if (!active) return;

      activeOperationCount += 1;
      if (staleProcessing) staleProcessingCount += 1;
      if (!indexedIds.has(operation.id)) orphanedOperationCount += 1;
    });

    return {
      queueVersion: 3,
      pendingCount: pendingSnapshot.numChildren(),
      activeOperationCount,
      orphanedOperationCount,
      staleProcessingCount,
      recentIndexCount: recentSnapshot.numChildren(),
      lastRepairScanAt: this.lastRepairScanAt || null,
      lastRepairCount: this.lastRepairCount,
      lastClaimAt: this.lastClaimAt || null,
      lastClaimedOperationId: this.lastClaimedOperationId,
      lastError: this.lastError,
      lastErrorAt: this.lastErrorAt || null
    };
  }

  async waitForTerminal(id, timeoutMs = 6_000) {
    await this.init();

    const deadline = now() + Math.max(0, Number(timeoutMs) || 0);
    while (now() <= deadline) {
      const snapshot = await this.operationsRef.child(String(id)).get();
      const operation = normalizeOperation(snapshot.val());
      if (!operation || TERMINAL_STATUSES.has(operation.status)) return operation;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const snapshot = await this.operationsRef.child(String(id)).get();
    return normalizeOperation(snapshot.val());
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
