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

    const previousCode = typeof state.code === "string" ? state.code : null;
    let rawCode;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      rawCode = createRawCode(EB_VERIFICATION_CONFIG.codeLength);
      const snapshot = await this.codesRef.child(rawCode).get();
      if (!snapshot.exists()) break;
      rawCode = null;
    }

    if (!rawCode) {
      const error = new Error("Não foi possível gerar um código único agora. Tente novamente.");
      error.statusCode = 503;
      throw error;
    }

    const record = {
      profile: structuredClone(profile),
      createdAt: now,
      expiresAt: now + this.ttlMs,
      claimId: null,
      claimedAt: null
    };

    const updates = {
      [`codes/${rawCode}`]: record,
      [`codeState/${userId}`]: {
        code: rawCode,
        lastGeneratedAt: now
      }
    };
    if (previousCode && previousCode !== rawCode) updates[`codes/${previousCode}`] = null;

    await this.root.update(updates);

    return {
      code: formatCode(rawCode),
      expiresAt: record.expiresAt,
      expiresInSeconds: Math.floor(this.ttlMs / 1000)
    };
  }

  async claim(codeInput) {
    const code = normalizeCode(codeInput);
    if (!code) return null;

    const now = Date.now();
    const claimId = randomUUID();
    const ref = this.codesRef.child(code);
    const result = await ref.transaction((current) => {
      if (!current || typeof current !== "object") return;
      const expiresAt = Number(current.expiresAt ?? 0);
      if (expiresAt <= now) return;

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

    if (!result.committed) return null;
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
    const updates = { [`codes/${claim.code}`]: null };
    if (userId && stateSnapshot?.val()?.code === claim.code) {
      updates[`codeState/${userId}/code`] = null;
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
