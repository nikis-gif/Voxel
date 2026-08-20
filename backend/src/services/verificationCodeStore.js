import { randomBytes, randomUUID } from "node:crypto";
import { EB_VERIFICATION_CONFIG } from "../config/ebVerificationConfig.js";

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
    ttlSeconds = EB_VERIFICATION_CONFIG.codeTtlSeconds,
    generationCooldownSeconds = EB_VERIFICATION_CONFIG.codeGenerationCooldownSeconds
  } = {}) {
    this.ttlMs = ttlSeconds * 1000;
    this.generationCooldownMs = generationCooldownSeconds * 1000;
    this.records = new Map();
    this.codeByRobloxUserId = new Map();
    this.lastGeneratedAt = new Map();
  }

  cleanup(now = Date.now()) {
    for (const [code, record] of this.records) {
      const claimExpired = record.claimedAt && now - record.claimedAt > CLAIM_TTL_MS;
      if (claimExpired) {
        record.claimId = null;
        record.claimedAt = null;
      }

      if (record.expiresAt <= now) {
        this.records.delete(code);
        if (this.codeByRobloxUserId.get(record.profile.userId) === code) {
          this.codeByRobloxUserId.delete(record.profile.userId);
        }
      }
    }
  }

  generate(profile) {
    const now = Date.now();
    this.cleanup(now);

    const lastGenerated = this.lastGeneratedAt.get(profile.userId) ?? 0;
    const retryAfterMs = this.generationCooldownMs - (now - lastGenerated);
    if (retryAfterMs > 0) {
      const error = new Error("Aguarde alguns segundos antes de gerar outro código.");
      error.statusCode = 429;
      error.retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
      throw error;
    }

    const previousCode = this.codeByRobloxUserId.get(profile.userId);
    if (previousCode) this.records.delete(previousCode);

    let rawCode;
    do {
      rawCode = createRawCode(EB_VERIFICATION_CONFIG.codeLength);
    } while (this.records.has(rawCode));

    const record = {
      profile: structuredClone(profile),
      createdAt: now,
      expiresAt: now + this.ttlMs,
      claimId: null,
      claimedAt: null
    };

    this.records.set(rawCode, record);
    this.codeByRobloxUserId.set(profile.userId, rawCode);
    this.lastGeneratedAt.set(profile.userId, now);

    return {
      code: formatCode(rawCode),
      expiresAt: record.expiresAt,
      expiresInSeconds: Math.floor(this.ttlMs / 1000)
    };
  }

  claim(codeInput) {
    const now = Date.now();
    this.cleanup(now);

    const code = normalizeCode(codeInput);
    const record = this.records.get(code);
    if (!record || record.expiresAt <= now || record.claimId) return null;

    const claimId = randomUUID();
    record.claimId = claimId;
    record.claimedAt = now;

    return {
      code,
      claimId,
      profile: structuredClone(record.profile),
      expiresAt: record.expiresAt
    };
  }

  commit(claim) {
    const record = this.records.get(claim.code);
    if (!record || record.claimId !== claim.claimId) return false;

    this.records.delete(claim.code);
    if (this.codeByRobloxUserId.get(record.profile.userId) === claim.code) {
      this.codeByRobloxUserId.delete(record.profile.userId);
    }
    return true;
  }

  release(claim) {
    const record = this.records.get(claim.code);
    if (!record || record.claimId !== claim.claimId) return false;

    record.claimId = null;
    record.claimedAt = null;
    return true;
  }
}
