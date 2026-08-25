import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { loadEnvFile } from "node:process";
import { connectDiscordClient, createDiscordClient } from "./bot/discordClient.js";
import { createApp } from "./app.js";
import { closeFirebaseContext, createFirebaseContext } from "./config/firebase.js";
import { loadEnv } from "./config/env.js";
import { SupportSafetyService } from "./services/supportSafetyService.js";
import { registerDiscordDmCommands } from "./services/discordDmCommandService.js";
import { DiscordGuildCommandService } from "./services/discordGuildCommandService.js";
import { DiscordRoleSyncService } from "./services/discordRoleSyncService.js";
import { DiscordSupportService } from "./services/discordSupportService.js";
import { ChannelLockService } from "./services/channelLockService.js";
import { CommunityOperationStore } from "./services/communityOperationStore.js";
import { GuildSecurityService } from "./services/guildSecurityService.js";
import { DiscordVerificationService } from "./services/discordVerificationService.js";
import { GameBanService } from "./services/gameBanService.js";
import { GameBridgeService } from "./services/gameBridgeService.js";
import { RewardService } from "./services/rewardService.js";
import { RecruitmentService } from "./services/recruitmentService.js";
import { SupportAbuseService } from "./services/supportAbuseService.js";
import { TicketService } from "./services/ticketService.js";
import { VerificationCodeStore } from "./services/verificationCodeStore.js";
import { VerificationDatabase } from "./services/verificationDatabase.js";
import { WarningService } from "./services/warningService.js";
import { CommunityEngagementStore } from "./services/extended/communityEngagementStore.js";
import { CommunityExperienceCommandService } from "./services/extended/communityExperienceCommandService.js";
import { ExtendedModerationCommandService } from "./services/extended/extendedModerationCommandService.js";
import { GamePresenceService } from "./services/extended/gamePresenceService.js";
import { GuildLogService } from "./services/guildLogService.js";
import { GuildPolicyService } from "./services/guildPolicyService.js";
import { LinkModerationService } from "./services/linkModerationService.js";
import { OperationalAnnouncementService } from "./services/operationalAnnouncementService.js";
import { StaffReportService } from "./services/staffReportService.js";
import { ModerationStore } from "./services/extended/moderationStore.js";

if (existsSync(".env")) loadEnvFile(".env");

const env = loadEnv();
const firebase = createFirebaseContext(env.firebase);
const verificationDatabase = new VerificationDatabase(firebase.database);
await verificationDatabase.init();

const discordClient = createDiscordClient();
const verificationCodeStore = new VerificationCodeStore({ database: firebase.database });
const supportSafetyService = new SupportSafetyService();
const supportAbuseService = new SupportAbuseService({ database: firebase.database });
const communityOperationStore = new CommunityOperationStore({ database: firebase.database });
await communityOperationStore.init()
  .then(() => console.log("[community-queue] Persistent queue v6 ready."))
  .catch((error) => console.error("[community-queue] Initial migration failed; lazy retry remains enabled:", error));
const gameBridgeService = new GameBridgeService();
const gamePresenceService = new GamePresenceService(firebase.database);
const engagementStore = new CommunityEngagementStore(firebase.database);
const moderationStore = new ModerationStore(firebase.database);
let discordVerificationService = null;
let gameBanService = null;
let rewardService = null;
let recruitmentService = null;
let discordGuildCommandService = null;
let staffReportService = null;
let operationalAnnouncementService = null;

registerDiscordDmCommands(discordClient, env.supportOwnerId);
const discordSupportService = new DiscordSupportService({
  client: discordClient,
  ownerId: env.supportOwnerId,
  database: firebase.database,
  roleIds: env.verification.roleIds
});
discordSupportService.init();

console.log("[safety] Local support safeguards enabled. External AI moderation is disabled.");
console.log(`[firebase] Realtime Database connected: ${firebase.projectId}.`);

if (env.verification.enabled) {
  const roleSyncService = new DiscordRoleSyncService({
    guildId: env.verification.guildId,
    roleIds: env.verification.roleIds
  });

  gameBanService = new GameBanService(verificationDatabase);
  rewardService = new RewardService(verificationDatabase);
  recruitmentService = new RecruitmentService({
    database: firebase.database,
    codeStore: verificationCodeStore,
    gameBridgeService,
    gameBanService
  });
  const warningService = new WarningService({ database: verificationDatabase, gameBanService });
  const channelLockService = new ChannelLockService(verificationDatabase);
  const ticketService = new TicketService({
    client: discordClient,
    database: verificationDatabase,
    roleIds: env.verification.roleIds
  });
  ticketService.init();

  const guildLogService = new GuildLogService({
    client: discordClient,
    guildId: env.verification.guildId
  });
  guildLogService.init();

  const guildPolicyService = new GuildPolicyService({
    client: discordClient,
    guildId: env.verification.guildId,
    roleIds: env.verification.roleIds
  });
  guildPolicyService.init();

  const linkModerationService = new LinkModerationService({
    client: discordClient,
    guildId: env.verification.guildId,
    database: firebase.database,
    roleIds: env.verification.roleIds,
    guildLogService
  });
  linkModerationService.init();

  staffReportService = new StaffReportService({
    database: firebase.database,
    codeStore: verificationCodeStore,
    client: discordClient,
    guildId: env.verification.guildId,
    verificationDatabase
  });

  operationalAnnouncementService = new OperationalAnnouncementService({
    database: firebase.database,
    client: discordClient,
    guildId: env.verification.guildId,
    staffReportService
  });

  discordVerificationService = new DiscordVerificationService({
    client: discordClient,
    guildId: env.verification.guildId,
    codeStore: verificationCodeStore,
    roleSyncService,
    database: verificationDatabase
  });
  discordVerificationService.init();

  const guildSecurityService = new GuildSecurityService({
    client: discordClient,
    guildId: env.verification.guildId,
    database: verificationDatabase,
    supportOwnerId: env.supportOwnerId
  });
  await guildSecurityService.init();

  const moderationCommands = new ExtendedModerationCommandService({
    client: discordClient,
    guildId: env.verification.guildId,
    database: verificationDatabase,
    verificationService: discordVerificationService,
    warningService,
    gameBanService,
    rewardService,
    ticketService,
    gameBridgeService,
    gamePresenceService,
    channelLockService,
    securityService: guildSecurityService,
    moderationStore,
    roleIds: env.verification.roleIds
  });

  const communityCommands = new CommunityExperienceCommandService({
    client: discordClient,
    guildId: env.verification.guildId,
    database: verificationDatabase,
    verificationService: discordVerificationService,
    rewardService,
    gameBridgeService,
    gamePresenceService,
    engagementStore,
    roleIds: env.verification.roleIds
  });

  discordGuildCommandService = new DiscordGuildCommandService({
    client: discordClient,
    guildId: env.verification.guildId,
    verificationService: discordVerificationService,
    gameBanService,
    warningService,
    ticketService,
    gameBridgeService,
    gamePresenceService,
    communityOperationStore,
    rewardService,
    channelLockService,
    roleIds: env.verification.roleIds,
    extensionServices: [moderationCommands, communityCommands]
  });
  discordGuildCommandService.init();

  console.log("[verification] Persistent storage: Firebase Realtime Database.");
} else {
  console.warn("[verification] Disabled. Configure ROBLOX_API_KEY and EB_GUILD_ID to enable it.");
}

const app = createApp({
  env,
  discordClient,
  discordSupportService,
  supportSafetyService,
  supportAbuseService,
  verificationCodeStore,
  discordVerificationService,
  gameBanService,
  gameBridgeService,
  gamePresenceService,
  communityOperationStore,
  rewardService,
  recruitmentService,
  staffReportService,
  operationalAnnouncementService
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
    await verificationDatabase.close();
    await discordClient.destroy().catch(() => {});
    await closeFirebaseContext(firebase);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

