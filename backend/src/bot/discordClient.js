import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { once } from "node:events";

export async function createDiscordClient(token) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
  });

  const ready = once(client, Events.ClientReady);
  await client.login(token);
  await ready;

  return client;
}
