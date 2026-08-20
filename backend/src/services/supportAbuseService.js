import { createHash } from "node:crypto";

const DUPLICATE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 2_000;

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requestFingerprint({ sender, message, files }) {
  const fileHashes = files.map((file) => hash(file.buffer)).join(":");
  return hash(`${sender.toLowerCase()}\n${message}\n${fileHashes}`);
}

export class SupportAbuseService {
  constructor() {
    this.recent = new Map();
  }

  prune(now = Date.now()) {
    for (const [key, createdAt] of this.recent) {
      if (now - createdAt >= DUPLICATE_TTL_MS) this.recent.delete(key);
    }

    while (this.recent.size > MAX_CACHE_ENTRIES) {
      const oldest = this.recent.keys().next().value;
      if (!oldest) break;
      this.recent.delete(oldest);
    }
  }

  assertNotDuplicate(payload) {
    const now = Date.now();
    this.prune(now);

    const fingerprint = requestFingerprint(payload);
    const previous = this.recent.get(fingerprint);
    if (previous && now - previous < DUPLICATE_TTL_MS) {
      const error = new Error("Uma solicitação idêntica já foi recebida recentemente.");
      error.statusCode = 409;
      error.code = "DUPLICATE_SUPPORT_REQUEST";
      throw error;
    }

    this.recent.set(fingerprint, now);
  }
}
