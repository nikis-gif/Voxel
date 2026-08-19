const DEFAULT_PORT = 3000;

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
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

export function loadEnv() {
  const allowedOrigins = parseOrigins(process.env.ALLOWED_ORIGINS);
  if (allowedOrigins.length === 0) {
    throw new Error("ALLOWED_ORIGINS must contain at least one website origin");
  }

  return Object.freeze({
    port: parsePort(process.env.PORT),
    nodeEnv: process.env.NODE_ENV?.trim() || "development",
    discordBotToken: requireEnv("DISCORD_BOT_TOKEN"),
    supportOwnerId: requireEnv("SUPPORT_OWNER_ID"),
    allowedOrigins,
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY)
  });
}
