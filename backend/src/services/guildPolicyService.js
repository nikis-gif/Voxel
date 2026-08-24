import { Events } from "discord.js";
import { VOXEL_GUILD_CONFIG } from "../config/voxelGuildConfig.js";
import { hasAdministratorAccess } from "../utils/staffAccess.js";

function memberHasRole(member, roleId) {
  if (!member || !roleId) return false;
  if (member.roles?.cache) return member.roles.cache.has(roleId);
  return Array.isArray(member.roles) && member.roles.includes(roleId);
}

export class GuildPolicyService {
  constructor({ client, guildId, roleIds = {} }) {
    this.client = client;
    this.guildId = guildId;
    this.roleIds = roleIds;
    this.initialized = false;
  }

  isProtectedChannel(channelId) {
    return VOXEL_GUILD_CONFIG.botOnlyChannelIds.includes(String(channelId));
  }

  isStaffManagedChannel(channelId) {
    return VOXEL_GUILD_CONFIG.staffManagedChannelIds.includes(String(channelId));
  }

  staffRoleIds() {
    return [...new Set([
      ...VOXEL_GUILD_CONFIG.supportResponderRoleKeys.map((key) => this.roleIds[key]),
      ...VOXEL_GUILD_CONFIG.privilegedRoleIds
    ])].filter((roleId) => typeof roleId === "string" && /^\d{17,20}$/.test(roleId));
  }

  isStaff(member) {
    if (hasAdministratorAccess(member)) return true;
    return this.staffRoleIds().some((roleId) => memberHasRole(member, roleId));
  }

  async ensureProtectedChannels() {
    if (!this.client.isReady()) return;
    const guild = await this.client.guilds.fetch(this.guildId);
    const botId = this.client.user.id;

    for (const channelId of VOXEL_GUILD_CONFIG.botOnlyChannelIds) {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel?.isTextBased()) {
        console.warn(`[policy] Protected channel ${channelId} was not found or is not text based.`);
        continue;
      }

      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: false,
        AddReactions: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
        SendMessagesInThreads: false
      }, { reason: "Voxel protected verification channel" }).catch((error) => {
        console.error(`[policy] Failed to lock channel ${channelId}:`, error);
      });

      await channel.permissionOverwrites.edit(botId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        EmbedLinks: true
      }, { reason: "Voxel protected verification channel" }).catch(() => {});
    }

    console.log(`[policy] Protected ${VOXEL_GUILD_CONFIG.botOnlyChannelIds.length} verification channel(s).`);
  }

  async ensureStaffManagedChannels() {
    if (!this.client.isReady()) return;
    const guild = await this.client.guilds.fetch(this.guildId);
    const botId = this.client.user.id;
    const staffRoleIds = this.staffRoleIds();

    for (const channelId of VOXEL_GUILD_CONFIG.staffManagedChannelIds) {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        console.warn(`[policy] Staff-managed channel ${channelId} was not found.`);
        continue;
      }

      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: false,
        AddReactions: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
        SendMessagesInThreads: false,
        Connect: false
      }, { reason: "Voxel staff-managed channel" }).catch((error) => {
        console.error(`[policy] Failed to restrict channel ${channelId}:`, error);
      });

      for (const roleId of staffRoleIds) {
        await channel.permissionOverwrites.edit(roleId, {
          SendMessages: true,
          AddReactions: true,
          ReadMessageHistory: true,
          Connect: true
        }, { reason: "Voxel staff-managed channel access" }).catch(() => {});
      }

      await channel.permissionOverwrites.edit(botId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        EmbedLinks: true,
        AttachFiles: true,
        AddReactions: true,
        Connect: true
      }, { reason: "Voxel staff-managed channel bot access" }).catch(() => {});
    }

    console.log(`[policy] Restricted ${VOXEL_GUILD_CONFIG.staffManagedChannelIds.length} channel(s) to staff posting/voice access.`);
  }

  async enforceMessage(message) {
    if (message.guildId !== this.guildId) return;
    if (message.author.id === this.client.user?.id) return;

    if (this.isProtectedChannel(message.channelId)) {
      await message.delete().catch(() => {});
      console.info(`[policy] Removed non-Voxel message from protected channel ${message.channelId}.`);
      return;
    }

    if (this.isStaffManagedChannel(message.channelId) && !this.isStaff(message.member)) {
      await message.delete().catch(() => {});
      console.info(`[policy] Removed player message from staff-managed channel ${message.channelId}.`);
    }
  }

  async enforceVoiceAccess(oldState, newState) {
    if (newState.guild.id !== this.guildId) return;
    if (!newState.channelId || newState.channelId === oldState.channelId) return;
    if (!this.isStaffManagedChannel(newState.channelId)) return;
    if (this.isStaff(newState.member)) return;

    await newState.disconnect("Voxel staff-managed channel").catch(() => {});
    console.info(`[policy] Disconnected player ${newState.id} from staff-managed channel ${newState.channelId}.`);
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    const applyPolicies = () => {
      Promise.all([
        this.ensureProtectedChannels(),
        this.ensureStaffManagedChannels()
      ]).catch((error) => console.error("[policy] Failed to apply channel policies:", error));
    };

    this.client.on(Events.ClientReady, applyPolicies);

    this.client.on(Events.MessageCreate, (message) => {
      this.enforceMessage(message).catch((error) => console.error("[policy] Channel message enforcement failed:", error));
    });

    this.client.on(Events.VoiceStateUpdate, (oldState, newState) => {
      this.enforceVoiceAccess(oldState, newState).catch((error) => console.error("[policy] Voice access enforcement failed:", error));
    });

    if (this.client.isReady()) applyPolicies();
  }
}
