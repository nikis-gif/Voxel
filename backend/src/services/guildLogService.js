import {
  AuditLogEvent,
  EmbedBuilder,
  Events,
  PermissionFlagsBits
} from "discord.js";
import { VOXEL_GUILD_CONFIG } from "../config/voxelGuildConfig.js";

const LOG_COLOR = 0x7f8c8d;
const ALERT_COLOR = 0xed4245;
const SUCCESS_COLOR = 0x57f287;

function trim(value, max = 1000) {
  const text = String(value ?? "").trim();
  if (!text) return "Não disponível";
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function channelLabel(channel) {
  return channel?.id ? `<#${channel.id}>\n\`${channel.id}\`` : "Canal desconhecido";
}

function memberLabel(member) {
  if (!member?.id) return "Membro desconhecido";
  return `<@${member.id}>\n\`${member.id}\``;
}

function roleLabel(role) {
  if (!role?.id) return "Cargo desconhecido";
  return `${role}\n\`${role.id}\``;
}

function optionSummary(interaction) {
  const lines = [];
  const sensitiveNames = new Set(["codigo", "code", "token", "senha", "password"]);
  const printable = (name, value) => sensitiveNames.has(String(name).toLowerCase()) ? "[oculto]" : trim(value, 160);

  for (const option of interaction.options?.data ?? []) {
    if (option.options?.length) {
      for (const nested of option.options) {
        lines.push(`• ${option.name}.${nested.name}: ${printable(nested.name, nested.value)}`);
      }
      continue;
    }
    if (option.value !== undefined) lines.push(`• ${option.name}: ${printable(option.name, option.value)}`);
  }
  return lines.length ? trim(lines.join("\n"), 1000) : "Sem argumentos.";
}

export class GuildLogService {
  constructor({ client, guildId, logChannelId = VOXEL_GUILD_CONFIG.logChannelId }) {
    this.client = client;
    this.guildId = guildId;
    this.logChannelId = logChannelId;
    this.initialized = false;
  }

  async log({ title, description = null, fields = [], color = LOG_COLOR, timestamp = new Date() }) {
    if (!this.client.isReady()) return false;
    const guild = await this.client.guilds.fetch(this.guildId).catch(() => null);
    if (!guild) return false;
    const channel = await guild.channels.fetch(this.logChannelId).catch(() => null);
    if (!channel?.isTextBased()) return false;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setAuthor({ name: "Voxel • Registro do Servidor", iconURL: this.client.user?.displayAvatarURL({ size: 128 }) ?? undefined })
      .setTitle(trim(title, 256))
      .setFooter({ text: "Voxel • Auditoria" })
      .setTimestamp(timestamp);

    if (description) embed.setDescription(trim(description, 4000));
    if (fields.length) embed.addFields(fields.slice(0, 25));

    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch((error) => {
      console.error("[guild-log] Failed to send log:", error);
    });
    return true;
  }

  async resolveExecutor(guild, type, targetId) {
    const botMember = guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return null;

    const logs = await guild.fetchAuditLogs({ type, limit: 3 }).catch(() => null);
    if (!logs) return null;
    const entry = logs.entries.find((item) => String(item.target?.id ?? "") === String(targetId ?? ""));
    return entry?.executor ?? null;
  }

  async logLinkWarning({ member, count, timeoutMs, message }) {
    const timeoutText = timeoutMs ? `${Math.round(timeoutMs / 3_600_000)} hora(s)` : "Não aplicado";
    await this.log({
      title: "Link bloqueado pelo Voxel",
      color: ALERT_COLOR,
      fields: [
        { name: "Usuário", value: memberLabel(member), inline: true },
        { name: "Advertências de link", value: String(count), inline: true },
        { name: "Timeout", value: timeoutText, inline: true },
        { name: "Canal", value: channelLabel(message.channel), inline: true },
        { name: "Conteúdo removido", value: `\`${trim(message.content, 900).replace(/`/g, "'")}\``, inline: false }
      ]
    });
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    this.client.on(Events.GuildMemberAdd, (member) => {
      if (member.guild.id !== this.guildId) return;
      this.log({
        title: "Membro entrou no servidor",
        color: SUCCESS_COLOR,
        fields: [
          { name: "Membro", value: memberLabel(member), inline: true },
          { name: "Conta criada", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }
        ]
      });
    });

    this.client.on(Events.GuildMemberRemove, (member) => {
      if (member.guild.id !== this.guildId) return;
      this.log({ title: "Membro saiu do servidor", fields: [{ name: "Membro", value: memberLabel(member), inline: true }] });
    });

    this.client.on(Events.VoiceStateUpdate, (oldState, newState) => {
      if (newState.guild.id !== this.guildId) return;
      if (oldState.channelId === newState.channelId) return;

      let title = "Movimentação em canal de voz";
      let description = `${memberLabel(newState.member)}`;
      if (!oldState.channelId && newState.channelId) {
        title = "Conexão em canal de voz";
        description = `${memberLabel(newState.member)} entrou em ${channelLabel(newState.channel)}.`;
      } else if (oldState.channelId && !newState.channelId) {
        title = "Desconexão de canal de voz";
        description = `${memberLabel(oldState.member)} saiu de ${channelLabel(oldState.channel)}.`;
      } else {
        description = `${memberLabel(newState.member)} foi de ${channelLabel(oldState.channel)} para ${channelLabel(newState.channel)}.`;
      }

      this.log({ title, description });
    });

    this.client.on(Events.MessageDelete, (message) => {
      if (message.guildId !== this.guildId) return;
      if (message.channelId === this.logChannelId) return;
      this.log({
        title: "Mensagem removida",
        fields: [
          { name: "Autor", value: message.author?.id ? `<@${message.author.id}>\n\`${message.author.id}\`` : "Não disponível", inline: true },
          { name: "Canal", value: channelLabel(message.channel), inline: true },
          { name: "Conteúdo", value: trim(message.content, 1000), inline: false }
        ]
      });
    });

    this.client.on(Events.MessageBulkDelete, (messages, channel) => {
      if (channel.guildId !== this.guildId || channel.id === this.logChannelId) return;
      this.log({
        title: "Mensagens removidas em massa",
        fields: [
          { name: "Canal", value: channelLabel(channel), inline: true },
          { name: "Quantidade", value: String(messages.size), inline: true }
        ]
      });
    });

    this.client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
      if (newMessage.guildId !== this.guildId || newMessage.channelId === this.logChannelId) return;
      if (!oldMessage.content || !newMessage.content || oldMessage.content === newMessage.content) return;
      this.log({
        title: "Mensagem editada",
        fields: [
          { name: "Autor", value: newMessage.author?.id ? `<@${newMessage.author.id}>` : "Não disponível", inline: true },
          { name: "Canal", value: channelLabel(newMessage.channel), inline: true },
          { name: "Antes", value: trim(oldMessage.content, 900), inline: false },
          { name: "Depois", value: trim(newMessage.content, 900), inline: false }
        ]
      });
    });

    this.client.on(Events.GuildRoleCreate, async (role) => {
      if (role.guild.id !== this.guildId) return;
      const executor = await this.resolveExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
      this.log({
        title: "Cargo criado",
        fields: [
          { name: "Cargo", value: roleLabel(role), inline: true },
          { name: "Executor", value: executor?.id ? `<@${executor.id}>\n\`${executor.id}\`` : "Não identificado", inline: true }
        ]
      });
    });

    this.client.on(Events.GuildRoleDelete, async (role) => {
      if (role.guild.id !== this.guildId) return;
      const executor = await this.resolveExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
      this.log({
        title: "Cargo removido",
        color: ALERT_COLOR,
        fields: [
          { name: "Cargo", value: `**${trim(role.name, 200)}**\n\`${role.id}\``, inline: true },
          { name: "Executor", value: executor?.id ? `<@${executor.id}>\n\`${executor.id}\`` : "Não identificado", inline: true }
        ]
      });
    });

    this.client.on(Events.GuildRoleUpdate, (oldRole, newRole) => {
      if (newRole.guild.id !== this.guildId) return;
      if (oldRole.name === newRole.name && oldRole.permissions.bitfield === newRole.permissions.bitfield && oldRole.color === newRole.color) return;
      this.log({ title: "Cargo atualizado", fields: [{ name: "Cargo", value: roleLabel(newRole), inline: true }] });
    });

    this.client.on(Events.ChannelCreate, async (channel) => {
      if (channel.guildId !== this.guildId || channel.id === this.logChannelId) return;
      const executor = await this.resolveExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
      this.log({
        title: "Canal criado",
        fields: [
          { name: "Canal", value: channelLabel(channel), inline: true },
          { name: "Executor", value: executor?.id ? `<@${executor.id}>` : "Não identificado", inline: true }
        ]
      });
    });

    this.client.on(Events.ChannelDelete, async (channel) => {
      if (channel.guildId !== this.guildId || channel.id === this.logChannelId) return;
      const executor = await this.resolveExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
      this.log({
        title: "Canal removido",
        color: ALERT_COLOR,
        fields: [
          { name: "Canal", value: `**${trim(channel.name, 200)}**\n\`${channel.id}\``, inline: true },
          { name: "Executor", value: executor?.id ? `<@${executor.id}>` : "Não identificado", inline: true }
        ]
      });
    });

    this.client.on(Events.GuildBanAdd, (ban) => {
      if (ban.guild.id !== this.guildId) return;
      this.log({ title: "Usuário banido do Discord", color: ALERT_COLOR, fields: [{ name: "Usuário", value: `<@${ban.user.id}>\n\`${ban.user.id}\``, inline: true }] });
    });

    this.client.on(Events.GuildBanRemove, (ban) => {
      if (ban.guild.id !== this.guildId) return;
      this.log({ title: "Banimento removido", color: SUCCESS_COLOR, fields: [{ name: "Usuário", value: `<@${ban.user.id}>\n\`${ban.user.id}\``, inline: true }] });
    });

    this.client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
      if (newMember.guild.id !== this.guildId) return;
      if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) {
        this.log({
          title: "Timeout atualizado",
          fields: [
            { name: "Membro", value: memberLabel(newMember), inline: true },
            { name: "Até", value: newMember.communicationDisabledUntilTimestamp ? `<t:${Math.floor(newMember.communicationDisabledUntilTimestamp / 1000)}:F>` : "Removido", inline: true }
          ]
        });
      }
    });

    this.client.on(Events.InteractionCreate, (interaction) => {
      if (!interaction.isChatInputCommand() || interaction.guildId !== this.guildId) return;
      this.log({
        title: "Comando executado",
        fields: [
          { name: "Comando", value: `\`/${interaction.commandName}\``, inline: true },
          { name: "Executor", value: `<@${interaction.user.id}>\n\`${interaction.user.id}\``, inline: true },
          { name: "Canal", value: interaction.channel ? channelLabel(interaction.channel) : "Não disponível", inline: true },
          { name: "Argumentos", value: optionSummary(interaction), inline: false }
        ]
      });
    });
  }
}
