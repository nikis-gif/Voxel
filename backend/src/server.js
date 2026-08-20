import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { createServer } from "node:http";
import { connectDiscordClient, createDiscordClient } from "./bot/discordClient.js";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { registerDiscordDmCommands } from "./services/discordDmCommandService.js";
import { DiscordRoleSyncService } from "./services/discordRoleSyncService.js";
import { DiscordSupportService } from "./services/discordSupportService.js";
import { DiscordVerificationService } from "./services/discordVerificationService.js";
import { VerificationCodeStore } from "./services/verificationCodeStore.js";
import { VerificationDatabase } from "./services/verificationDatabase.js";

// Local development uses backend/.env. Cloud hosts inject environment variables directly.
if (existsSync(".env")) loadEnvFile(".env");

const env = loadEnv();
const discordClient = createDiscordClient();
const verificationCodeStore = new VerificationCodeStore();
let verificationDatabase = null;
let discordVerificationService = null;

registerDiscordDmCommands(discordClient, env.supportOwnerId);

const discordSupportService = new DiscordSupportService(discordClient, env.supportOwnerId);

if (env.verification.enabled) {
  verificationDatabase = new VerificationDatabase(env.verification.databasePath);

  const roleSyncService = new DiscordRoleSyncService({
    guildId: env.verification.guildId,
    roleIds: env.verification.roleIds
  });

  discordVerificationService = new DiscordVerificationService({
    client: discordClient,
    guildId: env.verification.guildId,
    codeStore: verificationCodeStore,
    roleSyncService,
    database: verificationDatabase
  });
  discordVerificationService.init();

  console.log(`[verification] Persistent links database: ${env.verification.databasePath}`);
} else {
  console.warn("[verification] Disabled. Configure ROBLOX_API_KEY and EB_GUILD_ID to enable it.");
}

const app = createApp({
  env,
  discordClient,
  discordSupportService,
  verificationCodeStore,
  discordVerificationService
});
const server = createServer(app);

server.listen(env.port, "0.0.0.0", () => {
  console.log(`Voxel Support API running on 0.0.0.0:${env.port}`);
});

connectDiscordClient(discordClient, env.discordBotToken)
  .then(() => {
    console.log(`Discord bot ready as ${discordClient.user.tag}`);
    console.log("Owner DM command ready: clear");
  })
  .catch((error) => {
    console.error("[discord] Background connection loop stopped unexpectedly:", error);
  });

function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);

  server.close(async () => {
    verificationDatabase?.close();
    await discordClient.destroy().catch(() => {});
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
