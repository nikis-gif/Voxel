import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { once } from "node:events";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const CONNECT_TIMEOUT_MS = 45_000;
const HTTP_TIMEOUT_MS = 10_000;

function withTimeout(promise, timeoutMs, message) {
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function fetchDiscord(path, token) {
  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    headers: {
      Authorization: `Bot ${token}`,
      "User-Agent": "VoxelSupport/1.0"
    },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const details = body ? `: ${body.slice(0, 300)}` : "";
    throw new Error(`Discord API returned HTTP ${response.status}${details}`);
  }

  return response.json();
}

async function validateDiscordAccess(token) {
  console.log("[discord] Validating bot token through Discord REST API...");

  const [bot, gateway] = await Promise.all([
    fetchDiscord("/users/@me", token),
    fetchDiscord("/gateway/bot", token)
  ]);

  const sessionLimit = gateway.session_start_limit;
  const remaining = sessionLimit?.remaining ?? "unknown";
  const total = sessionLimit?.total ?? "unknown";

  console.log(`[discord] REST authentication OK as ${bot.username} (${bot.id}).`);
  console.log(`[discord] Gateway session starts remaining: ${remaining}/${total}.`);

  return { bot, gateway };
}

function registerDiagnostics(client) {
  client.on(Events.Warn, (message) => {
    console.warn(`[discord] Warning: ${message}`);
  });

  client.on(Events.Error, (error) => {
    console.error("[discord] Client error:", error);
  });

  client.on(Events.ShardError, (error, shardId) => {
    console.error(`[discord] Shard ${shardId} error:`, error);
  });

  client.on(Events.ShardDisconnect, (event, shardId) => {
    console.warn(`[discord] Shard ${shardId} disconnected with code ${event.code}.`);
  });

  client.on(Events.ShardReconnecting, (shardId) => {
    console.warn(`[discord] Shard ${shardId} reconnecting...`);
  });

  client.on(Events.ShardReady, (shardId) => {
    console.log(`[discord] Shard ${shardId} ready.`);
  });
}

export function createDiscordClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
  });

  registerDiagnostics(client);
  return client;
}

export async function connectDiscordClient(client, token) {
  if (client.isReady()) return client;

  await validateDiscordAccess(token);
  console.log("[discord] Connecting to Discord Gateway...");

  const readyPromise = once(client, Events.ClientReady);
  const loginPromise = client.login(token);

  await withTimeout(
    Promise.all([loginPromise, readyPromise]),
    CONNECT_TIMEOUT_MS,
    `Discord Gateway did not reach ready state within ${CONNECT_TIMEOUT_MS / 1000} seconds`
  );

  if (!client.isReady()) {
    throw new Error("Discord Gateway finished login without entering ready state");
  }

  return client;
}
