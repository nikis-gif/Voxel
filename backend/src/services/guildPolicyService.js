import { Events, PermissionFlagsBits } from "discord.js";
import { VOXEL_GUILD_CONFIG } from "../config/voxelGuildConfig.js";

export class GuildPolicyService {
  constructor({ client, guildId }) {
    this.client = client;
    this.guildId = guildId;
    this.initialized = false;
  }

  isProtectedChannel(channelId) {
    return VOXEL_GUILD_CONFIG.botOnlyChannelIds.includes(String(channelId));
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

  async enforceMessage(message) {
    if (message.guildId !== this.guildId || !this.isProtectedChannel(message.channelId)) return;
    if (message.author.id === this.client.user?.id) return;

    await message.delete().catch(() => {});
    console.info(`[policy] Removed non-Voxel message from protected channel ${message.channelId}.`);
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    this.client.on(Events.ClientReady, () => {
      this.ensureProtectedChannels().catch((error) => console.error("[policy] Failed to apply protected channels:", error));
    });

    this.client.on(Events.MessageCreate, (message) => {
      this.enforceMessage(message).catch((error) => console.error("[policy] Protected channel enforcement failed:", error));
    });

    if (this.client.isReady()) {
      this.ensureProtectedChannels().catch((error) => console.error("[policy] Failed to apply protected channels:", error));
    }
  }
}
