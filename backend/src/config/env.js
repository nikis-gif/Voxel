const DEFAULT_PORT = 3000;

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optionalEnv(name) {
  const value = process.env[name]?.trim();
  return value || null;
}

function parsePort(value) {
  const port = Number.parseInt(value ?? "", 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : DEFAULT_PORT;
}

function parseOrigins(value) {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function parseTrustProxy(value) {
  if (!value || value === "0" || value.toLowerCase() === "false") return false;
  if (value === "1" || value.toLowerCase() === "true") return 1;

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : false;
}

function parseRoleIds(value) {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const result = {};
    for (const [key, id] of Object.entries(parsed)) {
      if (typeof id === "string" && /^\d{17,20}$/.test(id)) result[key] = id;
    }
    return result;
  } catch {
    throw new Error("EB_ROLE_IDS must be valid JSON when provided");
  }
}

export function loadEnv() {
  const allowedOrigins = parseOrigins(process.env.ALLOWED_ORIGINS);
  if (allowedOrigins.length === 0) {
    throw new Error("ALLOWED_ORIGINS must contain at least one website origin");
  }

  const robloxApiKey = optionalEnv("ROBLOX_API_KEY");
  const ebGuildId = optionalEnv("EB_GUILD_ID");
  if ((robloxApiKey && !ebGuildId) || (!robloxApiKey && ebGuildId)) {
    throw new Error("ROBLOX_API_KEY and EB_GUILD_ID must be configured together");
  }

  return Object.freeze({
    port: parsePort(process.env.PORT),
    nodeEnv: process.env.NODE_ENV?.trim() || "development",
    discordBotToken: requireEnv("DISCORD_BOT_TOKEN"),
    supportOwnerId: requireEnv("SUPPORT_OWNER_ID"),
    allowedOrigins,
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    firebase: Object.freeze({
      databaseUrl: requireEnv("FIREBASE_DATABASE_URL").replace(/\/$/, ""),
      serviceAccountJson: requireEnv("FIREBASE_SERVICE_ACCOUNT_JSON")
    }),
    verification: Object.freeze({
      enabled: Boolean(robloxApiKey && ebGuildId),
      robloxApiKey,
      guildId: ebGuildId,
      roleIds: Object.freeze(parseRoleIds(process.env.EB_ROLE_IDS))
    })
  });
}
