import { Client, Events, GatewayIntentBits, Partials } from "discord.js";

const READY_TIMEOUT_MS = 90_000;
const RETRY_DELAYS_MS = [15_000, 30_000, 60_000, 120_000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createReadyWaiter(client) {
  if (client.isReady()) {
    return {
      promise: Promise.resolve(client),
      cancel() {}
    };
  }

  let settled = false;
  let resolveReady;
  let rejectReady;

  const promise = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const cleanup = () => {
    clearTimeout(timer);
    client.off(Events.ClientReady, onReady);
  };

  const onReady = (readyClient) => {
    if (settled) return;
    settled = true;
    cleanup();
    resolveReady(readyClient);
  };

  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    cleanup();

    const error = new Error(
      `Discord client did not emit ClientReady within ${Math.round(READY_TIMEOUT_MS / 1000)}s`
    );
    error.code = "DISCORD_READY_TIMEOUT";
    rejectReady(error);
  }, READY_TIMEOUT_MS);

  timer.unref?.();
  client.once(Events.ClientReady, onReady);

  return {
    promise,
    cancel() {
      if (settled) return;
      settled = true;
      cleanup();
    }
  };
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
    const attemptNumber = attempt + 1;
    const readyWaiter = createReadyWaiter(client);

    try {
      console.log(`[discord] Connecting to Discord Gateway (attempt ${attemptNumber})...`);

      // client.login() starts the WebSocket session, but ClientReady is the
      // authoritative signal that the bot can safely start handling work.
      await client.login(token);
      await readyWaiter.promise;

      console.log(`[discord] ClientReady confirmed on attempt ${attemptNumber}.`);
      return client;
    } catch (error) {
      readyWaiter.cancel();

      if (client.isReady()) {
        console.log(`[discord] Client became ready while handling attempt ${attemptNumber}.`);
        return client;
      }

      const retryDelay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
      attempt += 1;

      console.error(
        `[discord] Attempt ${attemptNumber} failed. Retrying in ${Math.round(retryDelay / 1000)}s:`,
        error
      );

      await client.destroy().catch(() => {});
      await sleep(retryDelay);
    }
  }

  return client;
}
