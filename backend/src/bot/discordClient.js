import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { once } from "node:events";

export function createDiscordClient() {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
  });
}

export async function connectDiscordClient(client, token) {
  if (client.isReady()) return client;

  const ready = once(client, Events.ClientReady);
  await client.login(token);
  await ready;

  return client;
}
