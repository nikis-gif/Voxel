import { randomBytes, randomUUID } from "node:crypto";
import { EB_VERIFICATION_CONFIG } from "../config/ebVerificationConfig.js";

const ROOT_PATH = "voxel/v1/verification";
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CLAIM_TTL_MS = 60_000;

function normalizeCode(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function formatCode(rawCode) {
  return `${rawCode.slice(0, 4)}-${rawCode.slice(4)}`;
}

function createRawCode(length) {
  const bytes = randomBytes(length);
  let result = "";

  for (let index = 0; index < length; index += 1) {
    result += CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  }

  return result;
}

export class VerificationCodeStore {
  constructor({
    database,
    ttlSeconds = EB_VERIFICATION_CONFIG.codeTtlSeconds,
    generationCooldownSeconds = EB_VERIFICATION_CONFIG.codeGenerationCooldownSeconds
  }) {
    this.root = database.ref(ROOT_PATH);
    this.codesRef = this.root.child("codes");
    this.codeStateRef = this.root.child("codeState");
    this.codeOwnersRef = this.root.child("codeOwners");
    this.claimsRef = this.root.child("claims");
    this.ttlMs = ttlSeconds * 1000;
    this.generationCooldownMs = generationCooldownSeconds * 1000;
  }

  async generate(profile) {
    const userId = String(profile.userId);
    const stateRef = this.codeStateRef.child(userId);
    const now = Date.now();
    const state = (await stateRef.get()).val() ?? {};
    const lastGeneratedAt = Number(state.lastGeneratedAt ?? 0);
    const retryAfterMs = this.generationCooldownMs - (now - lastGeneratedAt);

    if (retryAfterMs > 0) {
      const error = new Error("Aguarde alguns segundos antes de gerar outro código.");
      error.statusCode = 429;
      error.retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
      throw error;
    }

    const previousCode = typeof state.code === "string" ? normalizeCode(state.code) : null;
    let rawCode = null;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = createRawCode(EB_VERIFICATION_CONFIG.codeLength);
      const snapshot = await this.codesRef.child(candidate).get();
      if (!snapshot.exists()) {
        rawCode = candidate;
        break;
      }
    }

    if (!rawCode) {
      const error = new Error("Não foi possível gerar um código único agora. Tente novamente.");
      error.statusCode = 503;
      throw error;
    }

    const expiresAt = now + this.ttlMs;
    const record = {
      profile: structuredClone(profile),
      createdAt: now,
      expiresAt
    };

    const stateRecord = {
      code: rawCode,
      lastGeneratedAt: now,
      expiresAt,
      profile: structuredClone(profile)
    };

    const updates = {
      [`codes/${rawCode}`]: record,
      [`codeOwners/${rawCode}`]: userId,
      [`claims/${rawCode}`]: null,
      [`codeState/${userId}`]: stateRecord
    };

    if (previousCode && previousCode !== rawCode) {
      updates[`codes/${previousCode}`] = null;
      updates[`codeOwners/${previousCode}`] = null;
      updates[`claims/${previousCode}`] = null;
    }

    await this.root.update(updates);

    // Confirm persistence before exposing the code to Roblox.
    const persisted = await this.codesRef.child(rawCode).get();
    if (!persisted.exists()) {
      const error = new Error("O código não pôde ser confirmado no armazenamento. Tente novamente.");
      error.statusCode = 503;
      throw error;
    }

    console.log(`[verification] Code generated for Roblox ${userId}; expires in ${Math.floor(this.ttlMs / 1000)}s.`);

    return {
      code: formatCode(rawCode),
      expiresAt,
      expiresInSeconds: Math.floor(this.ttlMs / 1000)
    };
  }

  async recoverRecord(code) {
    const ownerSnapshot = await this.codeOwnersRef.child(code).get();
    const ownerId = ownerSnapshot.val();
    if (!ownerId) return null;

    const stateSnapshot = await this.codeStateRef.child(String(ownerId)).get();
    const state = stateSnapshot.val();
    if (!state || normalizeCode(state.code) !== code || !state.profile) return null;

    const expiresAt = Number(state.expiresAt ?? 0);
    if (expiresAt <= Date.now()) return null;

    const record = {
      profile: structuredClone(state.profile),
      createdAt: Number(state.lastGeneratedAt ?? Date.now()),
      expiresAt
    };
    await this.codesRef.child(code).set(record);
    return record;
  }

  async getClaim(code) {
    const snapshot = await this.claimsRef.child(String(code)).get();
    const value = snapshot.val();
    if (!value || typeof value !== "object") return null;

    return {
      claimId: value.claimId ? String(value.claimId) : null,
      claimedAt: Number(value.claimedAt ?? 0),
      expiresAt: Number(value.expiresAt ?? 0)
    };
  }

  async claim(codeInput) {
    const code = normalizeCode(codeInput);
    if (code.length !== EB_VERIFICATION_CONFIG.codeLength) {
      console.info("[verification] Rejected malformed verification code.");
      return null;
    }

    const now = Date.now();
    const codeRef = this.codesRef.child(code);
    let snapshot = await codeRef.get();
    let existing = snapshot.val();

    if (!existing) {
      existing = await this.recoverRecord(code);
      if (!existing) {
        console.info("[verification] Verification code not found in Firebase.");
        return null;
      }
      snapshot = await codeRef.get();
      existing = snapshot.val();
    }

    const expiresAt = Number(existing?.expiresAt ?? 0);
    if (expiresAt <= now) {
      await Promise.all([
        codeRef.remove(),
        this.codeOwnersRef.child(code).remove(),
        this.claimsRef.child(code).remove()
      ]);
      console.info("[verification] Verification code expired before claim.");
      return null;
    }

    const requestedClaimId = randomUUID();
    const claimRef = this.claimsRef.child(code);
    const leaseExpiresAt = now + CLAIM_TTL_MS;

    // Keep the lease separate from the code record. Firebase can initially feed
    // null into a transaction callback even when another node was read first.
    // Here null correctly means that the claim is available and can be created.
    const lockResult = await claimRef.transaction((current) => {
      const lock = current && typeof current === "object" ? current : null;
      const active = Boolean(lock?.claimId && Number(lock?.expiresAt ?? 0) > now);
      if (active) return;

      return {
        claimId: requestedClaimId,
        claimedAt: now,
        expiresAt: leaseExpiresAt
      };
    });

    if (!lockResult.committed) {
      const lock = await this.getClaim(code);
      console.info(
        `[verification] Verification code claim denied: code=${code}, `
        + `claim=${lock?.claimId ?? "none"}, expiresAt=${lock?.expiresAt ?? "none"}.`
      );
      return null;
    }

    // Re-check the code after the lease is acquired in case it was invalidated
    // between the first read and the lock transaction.
    const confirmedSnapshot = await codeRef.get();
    const confirmed = confirmedSnapshot.val();
    const confirmedExpiresAt = Number(confirmed?.expiresAt ?? 0);
    if (!confirmed?.profile || confirmedExpiresAt <= Date.now()) {
      await this.release({ code, claimId: requestedClaimId }).catch(() => {});
      console.info("[verification] Verification code became unavailable after claim.");
      return null;
    }

    console.info(`[verification] Claimed verification code ${code}.`);
    return {
      code,
      claimId: requestedClaimId,
      profile: structuredClone(confirmed.profile),
      expiresAt: confirmedExpiresAt
    };
  }

  async commit(claim) {
    const code = normalizeCode(claim?.code);
    const expectedClaimId = String(claim?.claimId ?? "");
    if (!code || !expectedClaimId) return false;

    const lock = await this.getClaim(code);
    if (!lock?.claimId || lock.claimId !== expectedClaimId) return false;

    const codeRef = this.codesRef.child(code);
    const snapshot = await codeRef.get();
    const record = snapshot.val();
    if (!record?.profile) return false;

    const userId = String(record.profile.userId ?? "");
    const stateSnapshot = userId ? await this.codeStateRef.child(userId).get() : null;
    const updates = {
      [`codes/${code}`]: null,
      [`codeOwners/${code}`]: null,
      [`claims/${code}`]: null
    };

    if (userId && normalizeCode(stateSnapshot?.val()?.code) === code) {
      updates[`codeState/${userId}/code`] = null;
      updates[`codeState/${userId}/profile`] = null;
      updates[`codeState/${userId}/expiresAt`] = null;
    }

    // Re-read the lease before deleting it so an expired claim cannot erase a
    // newer claimant's lock.
    const latestLock = await this.getClaim(code);
    if (!latestLock?.claimId || latestLock.claimId !== expectedClaimId) return false;

    await this.root.update(updates);
    console.info(`[verification] Committed verification code ${code}.`);
    return true;
  }

  async release(claim) {
    const code = normalizeCode(claim?.code);
    const expectedClaimId = String(claim?.claimId ?? "");
    if (!code || !expectedClaimId) return false;

    const lock = await this.getClaim(code);
    if (!lock?.claimId || lock.claimId !== expectedClaimId) return false;

    await this.claimsRef.child(code).remove();
    console.info(`[verification] Released verification code ${code}.`);
    return true;
  }
}
