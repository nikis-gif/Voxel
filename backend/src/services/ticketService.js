import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits
} from "discord.js";
import { EB_VERIFICATION_CONFIG } from "../config/ebVerificationConfig.js";
import { VOXEL_GUILD_CONFIG } from "../config/voxelGuildConfig.js";
import { hasAdministratorAccess } from "../utils/staffAccess.js";

const TICKET_COOLDOWN_MS = 20 * 60 * 1000;
const CATEGORY_NAME = VOXEL_GUILD_CONFIG.ticketCategoryName;
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

  init() {
    const apply = async () => {
      if (!this.client.isReady()) return;
      const guilds = [...this.client.guilds.cache.values()];
      for (const guild of guilds) {
        try {
          const category = await this.ensureCategory(guild);
          await this.syncStaffAccess(guild, category);
        } catch (error) {
          console.error("[tickets] Failed to sync ticket access:", error);
        }
      }
    };

    this.client.once("clientReady", () => { apply().catch(() => {}); });
    if (this.client.isReady()) apply().catch(() => {});
  }

  staffRoleIds() {
    return [...new Set([
      ...["oficiais", "superiores", "comandantes"].map((key) => this.roleIds[key]),
      ...VOXEL_GUILD_CONFIG.privilegedRoleIds
    ])].filter((id) => typeof id === "string" && /^\d{17,20}$/.test(id));
  }

  isStaff(member) {
    if (hasAdministratorAccess(member)) return true;
    return this.staffRoleIds().some((roleId) => member.roles.cache.has(roleId));
  }

  async syncStaffAccess(guild, category) {
    const staffIds = this.staffRoleIds();
    if (!staffIds.length) return;

    const ticketChannels = guild.channels.cache.filter((channel) =>
      channel.parentId === category.id
      && channel.type === ChannelType.GuildText
      && channel.topic?.startsWith("Voxel ticket | Owner ")
    );

    const permissions = {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      EmbedLinks: true,
      ManageMessages: true
    };

    for (const channel of ticketChannels.values()) {
      for (const roleId of staffIds) {
        await channel.permissionOverwrites.edit(roleId, permissions, { reason: "Voxel ticket staff access sync" });
      }
    }
  }

  async ensureCategory(guild) {
    await guild.channels.fetch();
    const existing = guild.channels.cache.find(
      (channel) => channel.type === ChannelType.GuildCategory && channel.name === CATEGORY_NAME
    );
    if (existing) return existing;

    const legacy = guild.channels.cache.find(
      (channel) => channel.type === ChannelType.GuildCategory
        && VOXEL_GUILD_CONFIG.legacyTicketCategoryNames.includes(channel.name)
    );
    if (legacy) {
      await legacy.setName(CATEGORY_NAME, "Voxel ticket category rename");
      return legacy;
    }

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
    const stored = await this.database.getTicket(member.id);
    if (stored?.channelId) {
      const channel = await guild.channels.fetch(stored.channelId).catch(() => null);
      if (channel) return { channel, existing: true };
      await this.database.closeTicket(member.id);
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

    await this.database.openTicket(member.id, channel.id);

    const embed = new EmbedBuilder()
      .setColor(EB_VERIFICATION_CONFIG.color)
      .setAuthor({ name: "Voxel", iconURL: this.client.user.displayAvatarURL({ size: 128 }) })
      .setTitle("Atendimento iniciado")
      .setDescription(
        "Descreva sua solicitação com contexto suficiente para análise. Envie evidências somente quando forem necessárias e não compartilhe senhas, tokens ou outras credenciais."
      )
      .addFields(
        { name: "Solicitante", value: `<@${member.id}>`, inline: true },
        { name: "Equipe com acesso", value: "Equipe autorizada do Voxel", inline: true }
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

    await this.database.closeTicket(ownerId);
    const channel = interaction.channel;
    if (!channel) return;

    await interaction.reply({ content: "Ticket encerrado. Este canal será removido em alguns segundos." });
    setTimeout(() => {
      channel.delete(`Voxel ticket closed by ${interaction.user.tag}`).catch((error) => {
        console.error(`[tickets] Failed to delete channel ${channel.id}:`, error);
      });
    }, 3_000).unref?.();
  }
  async resolveTicketContext(interaction, explicitUser = null) {
    if (explicitUser) {
      const ticket = await this.database.getTicket(explicitUser.id);
      return ticket?.channelId ? { ownerId: explicitUser.id, ticket } : null;
    }
    if (!interaction.channelId) return null;
    const ticket = await this.database.getTicketByChannelId(interaction.channelId);
    return ticket ? { ownerId: ticket.discordUserId, ticket } : null;
  }

  async closeByCommand(interaction, explicitUser = null) {
    const context = await this.resolveTicketContext(interaction, explicitUser);
    if (!context) throw new Error("Nenhum ticket aberto foi encontrado para esta solicitação.");
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (interaction.user.id !== context.ownerId && !this.isStaff(member)) {
      throw new Error("Somente o dono do ticket ou a equipe autorizada pode fechá-lo.");
    }
    const channel = await interaction.guild.channels.fetch(context.ticket.channelId).catch(() => null);
    await this.database.closeTicket(context.ownerId);
    if (channel) {
      await interaction.reply({ content: "Ticket encerrado. O canal será removido em alguns segundos." });
      setTimeout(() => channel.delete(`Voxel ticket closed by ${interaction.user.tag}`).catch(() => {}), 3000).unref?.();
      return;
    }
    await interaction.reply({ content: "Ticket encerrado no banco de dados." });
  }

  async addMember(interaction, user) {
    const context = await this.resolveTicketContext(interaction);
    if (!context) throw new Error("Use este comando dentro de um ticket aberto.");
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!this.isStaff(member)) throw new Error("Somente a equipe autorizada pode adicionar membros ao ticket.");
    await interaction.channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true
    });
    const extras = { ...(context.ticket.extraMembers ?? {}), [user.id]: true };
    await this.database.updateTicket(context.ownerId, { extraMembers: extras });
  }

  async removeMember(interaction, user) {
    const context = await this.resolveTicketContext(interaction);
    if (!context) throw new Error("Use este comando dentro de um ticket aberto.");
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!this.isStaff(member)) throw new Error("Somente a equipe autorizada pode remover membros do ticket.");
    if (user.id === context.ownerId) throw new Error("O dono do ticket não pode ser removido.");
    await interaction.channel.permissionOverwrites.delete(user.id).catch(() => {});
    const extras = { ...(context.ticket.extraMembers ?? {}) };
    delete extras[user.id];
    await this.database.updateTicket(context.ownerId, { extraMembers: extras });
  }

  async claim(interaction) {
    const context = await this.resolveTicketContext(interaction);
    if (!context) throw new Error("Use este comando dentro de um ticket aberto.");
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!this.isStaff(member)) throw new Error("Somente a equipe autorizada pode assumir tickets.");
    await this.database.updateTicket(context.ownerId, { claimedBy: interaction.user.id, claimedAt: Date.now() });
    return context;
  }

  async listOpen() {
    return this.database.listOpenTickets();
  }

}
