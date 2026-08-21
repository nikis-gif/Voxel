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
      expiresAt,
      claimId: null,
      claimedAt: null
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
      [`codeState/${userId}`]: stateRecord
    };

    if (previousCode && previousCode !== rawCode) {
      updates[`codes/${previousCode}`] = null;
      updates[`codeOwners/${previousCode}`] = null;
    }

    await this.root.update(updates);

    // Never return a code to Roblox before Firebase confirms that it exists.
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
      expiresAt,
      claimId: null,
      claimedAt: null
    };
    await this.codesRef.child(code).set(record);
    return record;
  }

  async claim(codeInput) {
    const code = normalizeCode(codeInput);
    if (code.length !== EB_VERIFICATION_CONFIG.codeLength) {
      console.info(`[verification] Rejected malformed verification code from Discord.`);
      return null;
    }

    const now = Date.now();
    const ref = this.codesRef.child(code);
    let snapshot = await ref.get();
    let existing = snapshot.val();

    if (!existing) {
      existing = await this.recoverRecord(code);
      if (!existing) {
        console.info(`[verification] Verification code not found in Firebase.`);
        return null;
      }
      snapshot = await ref.get();
    }

    const expiresAt = Number(existing.expiresAt ?? 0);
    if (expiresAt <= now) {
      await Promise.all([
        ref.remove(),
        this.codeOwnersRef.child(code).remove()
      ]);
      console.info(`[verification] Verification code expired before claim.`);
      return null;
    }

    const claimId = randomUUID();
    const result = await ref.transaction((current) => {
      if (!current || typeof current !== "object") return;
      if (Number(current.expiresAt ?? 0) <= now) return;

      const currentClaimId = current.claimId ? String(current.claimId) : null;
      const claimedAt = Number(current.claimedAt ?? 0);
      const claimExpired = currentClaimId && (!claimedAt || now - claimedAt > CLAIM_TTL_MS);
      if (currentClaimId && !claimExpired) return;

      return {
        ...current,
        claimId,
        claimedAt: now
      };
    });

    if (!result.committed) {
      console.info(`[verification] Verification code exists but is currently claimed or unavailable.`);
      return null;
    }

    const record = result.snapshot.val();
    if (!record?.profile) return null;

    return {
      code,
      claimId,
      profile: structuredClone(record.profile),
      expiresAt: Number(record.expiresAt)
    };
  }

  async commit(claim) {
    const ref = this.codesRef.child(claim.code);
    const snapshot = await ref.get();
    const record = snapshot.val();
    if (!record || String(record.claimId ?? "") !== String(claim.claimId)) return false;

    const userId = String(record.profile?.userId ?? "");
    const stateSnapshot = userId ? await this.codeStateRef.child(userId).get() : null;
    const updates = {
      [`codes/${claim.code}`]: null,
      [`codeOwners/${claim.code}`]: null
    };

    if (userId && normalizeCode(stateSnapshot?.val()?.code) === claim.code) {
      updates[`codeState/${userId}/code`] = null;
      updates[`codeState/${userId}/profile`] = null;
      updates[`codeState/${userId}/expiresAt`] = null;
    }

    await this.root.update(updates);
    return true;
  }

  async release(claim) {
    const ref = this.codesRef.child(claim.code);
    const result = await ref.transaction((current) => {
      if (!current || String(current.claimId ?? "") !== String(claim.claimId)) return;
      return {
        ...current,
        claimId: null,
        claimedAt: null
      };
    });
    return result.committed;
  }
}
