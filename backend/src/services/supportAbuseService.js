import { createHash } from "node:crypto";

const ROOT_PATH = "voxel/v1/support/duplicateFingerprints";
const DUPLICATE_TTL_MS = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requestFingerprint({ sender, message, files }) {
  const fileHashes = files.map((file) => hash(file.buffer)).join(":");
  return hash(`${sender.toLowerCase()}\n${message}\n${fileHashes}`);
}

export class SupportAbuseService {
  constructor({ database }) {
    this.ref = database.ref(ROOT_PATH);
    this.lastCleanupAt = 0;
  }

  async cleanup(now = Date.now()) {
    if (now - this.lastCleanupAt < CLEANUP_INTERVAL_MS) return;
    this.lastCleanupAt = now;

    const snapshot = await this.ref.get();
    const updates = {};
    snapshot.forEach((child) => {
      const createdAt = Number(child.val() ?? 0);
      if (!createdAt || now - createdAt >= DUPLICATE_TTL_MS) updates[child.key] = null;
    });

    if (Object.keys(updates).length > 0) await this.ref.update(updates);
  }

  async reserve(payload) {
    const now = Date.now();
    await this.cleanup(now);
    const fingerprint = requestFingerprint(payload);
    const result = await this.ref.child(fingerprint).transaction((current) => {
      const previous = Number(current ?? 0);
      if (previous > 0 && now - previous < DUPLICATE_TTL_MS) return;
      return now;
    });

    if (!result.committed) {
      const error = new Error("Uma solicitação idêntica já foi recebida recentemente.");
      error.statusCode = 409;
      error.code = "DUPLICATE_SUPPORT_REQUEST";
      throw error;
    }

    return fingerprint;
  }

  async release(fingerprint) {
    if (!fingerprint) return;
    await this.ref.child(fingerprint).remove();
  }
}
