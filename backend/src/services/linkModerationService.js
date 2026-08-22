import {
  EmbedBuilder,
  Events
} from "discord.js";
import { EB_VERIFICATION_CONFIG } from "../config/ebVerificationConfig.js";
import { VOXEL_GUILD_CONFIG } from "../config/voxelGuildConfig.js";
import { hasAdministratorAccess } from "../utils/staffAccess.js";

const LINK_PATTERN = /(?:https?:\/\/|www\.|discord\.gg\/|discord(?:app)?\.com\/invite\/|(?:[a-z0-9-]+\.)+(?:com|net|org|gg|io|dev|app|br|me|xyz|co|tv)(?:\/|\b))/i;
const ROOT_PATH = "voxel/v1/moderation/linkWarnings";

function timeoutLabel(durationMs) {
  if (!durationMs) return null;
  if (durationMs >= 24 * 60 * 60 * 1000) return "1 dia";
  if (durationMs >= 5 * 60 * 60 * 1000) return "5 horas";
  return "1 hora";
}

export class LinkModerationService {
  constructor({ client, guildId, database, roleIds = {}, guildLogService = null }) {
    this.client = client;
    this.guildId = guildId;
    this.roleIds = roleIds;
    this.root = database.ref(ROOT_PATH);
    this.guildLogService = guildLogService;
    this.initialized = false;
  }

  canSendLinks(member) {
    if (hasAdministratorAccess(member)) return true;
    return VOXEL_GUILD_CONFIG.linkAllowedRoleKeys
      .map((key) => this.roleIds[key])
      .filter(Boolean)
      .some((roleId) => member.roles.cache.has(roleId));
  }

  async incrementWarning(member, message) {
    const userRef = this.root.child(member.id);
    const countResult = await userRef.child("count").transaction((current) => {
      return Math.max(0, Number(current ?? 0)) + 1;
    });
    const count = Math.max(1, Number(countResult.snapshot.val() ?? 1));

    await userRef.update({
      discordUserId: member.id,
      count,
      lastWarningAt: Date.now(),
      lastChannelId: message.channelId,
      lastMessageId: message.id
    });

    return count;
  }

  async notify(message, member, count, timeoutMs) {
    const label = timeoutLabel(timeoutMs);
    const embed = new EmbedBuilder()
      .setColor(timeoutMs ? 0xed4245 : EB_VERIFICATION_CONFIG.color)
      .setAuthor({ name: "Voxel • Moderação de Links", iconURL: this.client.user?.displayAvatarURL({ size: 128 }) ?? undefined })
      .setTitle("Link removido")
      .setDescription("Links neste servidor são restritos a Oficiais, Superiores, Comandantes e Administradores.")
      .addFields(
        { name: "Advertências de link", value: `**${count}**`, inline: true },
        { name: "Punição aplicada", value: label ? `Timeout de **${label}**` : "Nenhuma nesta ocorrência", inline: true }
      )
      .setFooter({ text: "5 avisos: 1h • 10 avisos: 5h • 20 avisos: 1 dia" })
      .setTimestamp();

    const warning = await message.channel.send({
      content: `<@${member.id}>`,
      embeds: [embed],
      allowedMentions: { users: [member.id], roles: [] }
    }).catch(() => null);

    if (warning) {
      setTimeout(() => warning.delete().catch(() => {}), 10_000).unref?.();
    }
  }

  async handleMessage(message) {
    if (message.guildId !== this.guildId || !message.guild || !message.member) return;
    if (message.author.bot || message.webhookId) return;
    if (!LINK_PATTERN.test(message.content ?? "")) return;
    if (this.canSendLinks(message.member)) return;

    const content = message.content ?? "";
    await message.delete().catch(() => {});
    const count = await this.incrementWarning(message.member, message);
    const timeoutMs = VOXEL_GUILD_CONFIG.linkTimeouts[count] ?? null;

    if (timeoutMs && message.member.moderatable) {
      await message.member.timeout(timeoutMs, `Voxel: ${count} advertências automáticas por envio de links.`).catch((error) => {
        console.error(`[links] Failed to timeout ${message.member.id}:`, error);
      });
    }

    await Promise.all([
      this.notify(message, message.member, count, timeoutMs),
      this.guildLogService?.logLinkWarning({ member: message.member, count, timeoutMs, message: { channel: message.channel, content } })
    ]);

    console.info(`[links] Removed link from Discord ${message.member.id}; warning count=${count}.`);
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;
    this.client.on(Events.MessageCreate, (message) => {
      this.handleMessage(message).catch((error) => console.error("[links] Moderation failed:", error));
    });
  }
}
