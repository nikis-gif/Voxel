import { Client, Events, GatewayIntentBits, Partials } from "discord.js";

const RETRY_DELAYS_MS = [15_000, 30_000, 60_000, 120_000, 300_000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  let attempt = 0;

  while (!client.isReady()) {
    try {
      console.log(`[discord] Connecting to Discord Gateway (attempt ${attempt + 1})...`);

      // Let discord.js own Discord REST/Gateway rate-limit handling.
      await client.login(token);

      if (!client.isReady()) {
        throw new Error("Discord login completed without a ready client");
      }

      return client;
    } catch (error) {
      const retryDelay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
      attempt += 1;

      console.error(
        `[discord] Connection attempt failed. Retrying in ${Math.round(retryDelay / 1000)}s:`,
        error
      );

      await client.destroy().catch(() => {});
      await sleep(retryDelay);
    }
  }

  return client;
}
