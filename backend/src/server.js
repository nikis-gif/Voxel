import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { createServer } from "node:http";
import { connectDiscordClient, createDiscordClient } from "./bot/discordClient.js";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { registerDiscordDmCommands } from "./services/discordDmCommandService.js";
import { DiscordSupportService } from "./services/discordSupportService.js";

// Local dev uses backend/.env. Cloud hosts inject env vars directly.
if (existsSync(".env")) loadEnvFile(".env");

const env = loadEnv();
const discordClient = createDiscordClient();

registerDiscordDmCommands(discordClient, env.supportOwnerId);

const discordSupportService = new DiscordSupportService(discordClient, env.supportOwnerId);
const app = createApp({ env, discordClient, discordSupportService });
const server = createServer(app);

// Bind HTTP first so cloud platforms can detect the web service immediately.
server.listen(env.port, "0.0.0.0", () => {
  console.log(`Voxel Support API running on 0.0.0.0:${env.port}`);
});

connectDiscordClient(discordClient, env.discordBotToken)
  .then(() => {
    console.log(`Discord bot ready as ${discordClient.user.tag}`);
    console.log("Owner DM command ready: clear");
  })
  .catch((error) => {
    console.error("Discord bot failed to connect:", error);
  });

function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);

  server.close(() => {
    discordClient.destroy();
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
