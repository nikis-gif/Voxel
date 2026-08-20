import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { loadEnvFile } from "node:process";
import { connectDiscordClient, createDiscordClient } from "./bot/discordClient.js";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { ContentModerationService } from "./services/contentModerationService.js";
import { registerDiscordDmCommands } from "./services/discordDmCommandService.js";
import { DiscordGuildCommandService } from "./services/discordGuildCommandService.js";
import { DiscordRoleSyncService } from "./services/discordRoleSyncService.js";
import { DiscordSupportService } from "./services/discordSupportService.js";
import { DiscordVerificationService } from "./services/discordVerificationService.js";
import { GameBanService } from "./services/gameBanService.js";
import { GameBridgeService } from "./services/gameBridgeService.js";
import { RewardService } from "./services/rewardService.js";
import { SupportAbuseService } from "./services/supportAbuseService.js";
import { TicketService } from "./services/ticketService.js";
import { VerificationCodeStore } from "./services/verificationCodeStore.js";
import { VerificationDatabase } from "./services/verificationDatabase.js";
import { WarningService } from "./services/warningService.js";

if (existsSync(".env")) loadEnvFile(".env");

const env = loadEnv();
const discordClient = createDiscordClient();
const verificationCodeStore = new VerificationCodeStore();
const contentModerationService = new ContentModerationService(env.supportModeration);
const supportAbuseService = new SupportAbuseService();
const gameBridgeService = new GameBridgeService();
let verificationDatabase = null;
let discordVerificationService = null;
let gameBanService = null;
let rewardService = null;
let discordGuildCommandService = null;

registerDiscordDmCommands(discordClient, env.supportOwnerId);
const discordSupportService = new DiscordSupportService(discordClient, env.supportOwnerId);

if (contentModerationService.enabled) {
  console.log("[moderation] Support text and image moderation enabled.");
} else {
  console.warn("[moderation] Disabled. Configure OPENAI_API_KEY to block unsafe support content.");
}

if (env.verification.enabled) {
  verificationDatabase = new VerificationDatabase(env.verification.databasePath);
  const roleSyncService = new DiscordRoleSyncService({
    guildId: env.verification.guildId,
    roleIds: env.verification.roleIds
  });

  gameBanService = new GameBanService(verificationDatabase);
  rewardService = new RewardService(verificationDatabase);
  const warningService = new WarningService({ database: verificationDatabase, gameBanService });
  const ticketService = new TicketService({
    client: discordClient,
    database: verificationDatabase,
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

  discordGuildCommandService = new DiscordGuildCommandService({
    client: discordClient,
    guildId: env.verification.guildId,
    verificationService: discordVerificationService,
    gameBanService,
    warningService,
    ticketService,
    gameBridgeService,
    rewardService,
    roleIds: env.verification.roleIds
  });
  discordGuildCommandService.init();

  console.log(`[verification] Persistent links database: ${env.verification.databasePath}`);
} else {
  console.warn("[verification] Disabled. Configure ROBLOX_API_KEY and EB_GUILD_ID to enable it.");
}

const app = createApp({
  env,
  discordClient,
  discordSupportService,
  contentModerationService,
  supportAbuseService,
  verificationCodeStore,
  discordVerificationService,
  gameBanService,
  gameBridgeService,
  rewardService
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
