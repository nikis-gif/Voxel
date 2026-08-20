import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits
} from "discord.js";
import { EB_VERIFICATION_CONFIG } from "../config/ebVerificationConfig.js";

const TICKET_COOLDOWN_MS = 20 * 60 * 1000;
const CATEGORY_NAME = "Voxel | Tickets";
export const TICKET_CLOSE_PREFIX = "voxel-ticket-close";

function cleanChannelName(value) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
  return normalized || "usuario";
}

function closeButton(ownerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${TICKET_CLOSE_PREFIX}:${ownerId}`)
      .setLabel("Fechar ticket")
      .setStyle(ButtonStyle.Danger)
  );
}

export class TicketService {
  constructor({ client, database, roleIds = {} }) {
    this.client = client;
    this.database = database;
    this.roleIds = roleIds;
  }

  staffRoleIds() {
    return ["oficiais", "superiores", "comandantes"]
      .map((key) => this.roleIds[key])
      .filter((id) => typeof id === "string" && /^\d{17,20}$/.test(id));
  }

  isStaff(member) {
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    return this.staffRoleIds().some((roleId) => member.roles.cache.has(roleId));
  }

  async ensureCategory(guild) {
    await guild.channels.fetch();
    const existing = guild.channels.cache.find(
      (channel) => channel.type === ChannelType.GuildCategory && channel.name === CATEGORY_NAME
    );
    if (existing) return existing;

    const botMember = guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      throw new Error("O Voxel precisa da permissão Gerenciar Canais para criar tickets.");
    }

    return guild.channels.create({
      name: CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      reason: "Voxel ticket system"
    });
  }

  async open(guild, member) {
    const stored = this.database.getTicket(member.id);
    if (stored?.channelId) {
      const channel = await guild.channels.fetch(stored.channelId).catch(() => null);
      if (channel) return { channel, existing: true };
      this.database.closeTicket(member.id);
    }

    if (stored?.openedAt) {
      const retryAt = stored.openedAt + TICKET_COOLDOWN_MS;
      if (retryAt > Date.now()) {
        const error = new Error(`Você poderá abrir outro ticket <t:${Math.floor(retryAt / 1000)}:R>.`);
        error.code = "TICKET_COOLDOWN";
        throw error;
      }
    }

    const category = await this.ensureCategory(guild);
    const botId = this.client.user.id;
    const staffIds = this.staffRoleIds();
    const overwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks
        ]
      },
      {
        id: botId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages
        ]
      },
      ...staffIds.map((roleId) => ({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ManageMessages
        ]
      }))
    ];

    const channel = await guild.channels.create({
      name: `ticket-${cleanChannelName(member.user.username)}`,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `Voxel ticket | Owner ${member.id}`,
      permissionOverwrites: overwrites,
      reason: `Voxel ticket opened by ${member.user.tag} (${member.id})`
    });

    this.database.openTicket(member.id, channel.id);

    const embed = new EmbedBuilder()
      .setColor(EB_VERIFICATION_CONFIG.color)
      .setAuthor({ name: "Voxel", iconURL: this.client.user.displayAvatarURL({ size: 128 }) })
      .setTitle("Atendimento iniciado")
      .setDescription(
        "Descreva sua solicitação com contexto suficiente para análise. Envie evidências somente quando forem necessárias e não compartilhe senhas, tokens ou outras credenciais."
      )
      .addFields(
        { name: "Solicitante", value: `<@${member.id}>`, inline: true },
        { name: "Equipe com acesso", value: "Oficiais, Superiores e Comandantes", inline: true }
      )
      .setFooter({ text: "Voxel • Sistema de tickets" })
      .setTimestamp();

    await channel.send({
      content: `<@${member.id}>`,
      embeds: [embed],
      components: [closeButton(member.id)],
      allowedMentions: { users: [member.id], roles: [] }
    });

    return { channel, existing: false };
  }

  async close(interaction, ownerId) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (interaction.user.id !== ownerId && !this.isStaff(member)) {
      const error = new Error("Somente o responsável pelo ticket ou a equipe autorizada pode fechá-lo.");
      error.code = "TICKET_CLOSE_FORBIDDEN";
      throw error;
    }

    this.database.closeTicket(ownerId);
    const channel = interaction.channel;
    if (!channel) return;

    await interaction.reply({ content: "Ticket encerrado. Este canal será removido em alguns segundos." });
    setTimeout(() => {
      channel.delete(`Voxel ticket closed by ${interaction.user.tag}`).catch((error) => {
        console.error(`[tickets] Failed to delete channel ${channel.id}:`, error);
      });
    }, 3_000).unref?.();
  }
}
