import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits
} from "discord.js";
import { extendedModerationCommands } from "../../commands/extended/moderationCommands.js";
import { EB_VERIFICATION_CONFIG } from "../../config/ebVerificationConfig.js";
import { VOXEL_OWNER_IDS } from "../../config/voxelSecurityConfig.js";

const COMMAND_NAMES = new Set(extendedModerationCommands.map((builder) => builder.name));
const ERROR_COLOR = 0xed4245;

function cleanReason(value) {
  const reason = typeof value === "string" ? value.trim() : "";
  return reason || "Não informado";
}

function fmtDuration(ms) {
  const seconds = Math.max(0, Math.floor(Number(ms) / 1000));
  if (seconds >= 86400) return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 60)}m`;
}

function ts(ms, style = "R") {
  const value = Math.floor(Number(ms) / 1000);
  return Number.isFinite(value) && value > 0 ? `<t:${value}:${style}>` : "N/A";
}

function short(value, max = 1000) {
  const text = String(value ?? "");
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export class ExtendedModerationCommandService {
  constructor({
    client,
    guildId,
    database,
    verificationService,
    warningService,
    gameBanService,
    rewardService,
    ticketService,
    gameBridgeService,
    gamePresenceService,
    channelLockService,
    securityService,
    moderationStore,
    roleIds = {}
  }) {
    this.client = client;
    this.guildId = guildId;
    this.database = database;
    this.verificationService = verificationService;
    this.warningService = warningService;
    this.gameBanService = gameBanService;
    this.rewardService = rewardService;
    this.ticketService = ticketService;
    this.gameBridgeService = gameBridgeService;
    this.gamePresenceService = gamePresenceService;
    this.channelLockService = channelLockService;
    this.securityService = securityService;
    this.moderationStore = moderationStore;
    this.roleIds = roleIds;
    this.startedAt = Date.now();
  }

  getCommandBuilders() {
    return extendedModerationCommands;
  }

  canHandleCommand(name) {
    return COMMAND_NAMES.has(name);
  }

  baseEmbed(title, description = null) {
    const embed = new EmbedBuilder()
      .setColor(EB_VERIFICATION_CONFIG.color)
      .setAuthor({ name: "Voxel", iconURL: this.client.user?.displayAvatarURL({ size: 128 }) ?? undefined })
      .setTitle(title)
      .setFooter({ text: "Voxel • Exército Brasileiro" });
    if (description) embed.setDescription(description);
    return embed;
  }

  errorEmbed(title, description) {
    return this.baseEmbed(title, description).setColor(ERROR_COLOR);
  }

  roleAllowed(member, keys) {
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    return keys.map((key) => this.roleIds[key]).filter(Boolean).some((id) => member.roles.cache.has(id));
  }

  async assertRole(interaction, keys, message) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (this.roleAllowed(member, keys)) return member;
    const error = new Error(message);
    error.code = "INSUFFICIENT_STAFF_ROLE";
    throw error;
  }

  async assertStaff(interaction) {
    return this.assertRole(interaction, ["oficiais", "superiores", "comandantes"], "Este comando exige Oficiais, Superiores, Comandantes ou Administradores.");
  }

  async assertSenior(interaction) {
    return this.assertRole(interaction, ["superiores", "comandantes"], "Este comando exige Superiores, Comandantes ou Administradores.");
  }

  async assertCommander(interaction) {
    return this.assertRole(interaction, ["comandantes"], "Este comando exige Comandantes ou Administradores.");
  }

  assertAdmin(interaction) {
    if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return;
    const error = new Error("Este comando é restrito aos administradores do servidor.");
    error.code = "ADMIN_REQUIRED";
    throw error;
  }

  assertOwner(interaction) {
    if (VOXEL_OWNER_IDS.includes(interaction.user.id)) return;
    const error = new Error("Este comando é restrito aos donos do Voxel.");
    error.code = "OWNER_REQUIRED";
    throw error;
  }

  async sendModlog(guild, record) {
    const channelId = await this.moderationStore.getModlogChannel();
    if (!channelId) return;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) return;
    const embed = this.baseEmbed(`Moderação • ${record.type}`)
      .addFields(
        { name: "Alvo", value: record.targetDiscordId ? `<@${record.targetDiscordId}>\n\`${record.targetDiscordId}\`` : "Servidor", inline: true },
        { name: "Responsável", value: `<@${record.moderatorDiscordId}>`, inline: true },
        { name: "Motivo", value: short(record.reason, 1000), inline: false },
        { name: "Caso", value: `\`${record.id}\``, inline: true }
      ).setTimestamp(record.createdAt);
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
  }

  async recordCase(interaction, type, targetDiscordId, reason, metadata = {}) {
    const record = await this.moderationStore.addCase({
      type,
      targetDiscordId,
      moderatorDiscordId: interaction.user.id,
      reason: cleanReason(reason),
      metadata
    });
    await this.sendModlog(interaction.guild, record);
    return record;
  }

  async handleCommand(interaction) {
    if (interaction.guildId !== this.guildId || !interaction.guild) return false;
    const name = interaction.commandName;
    if (!this.canHandleCommand(name)) return false;

    switch (name) {
      case "mute": return this.handleMute(interaction);
      case "unmute": return this.handleUnmute(interaction);
      case "kick": return this.handleKick(interaction);
      case "warns": return this.handleWarns(interaction);
      case "remove-warning": return this.handleRemoveWarning(interaction);
      case "reset-warnings": return this.handleResetWarnings(interaction);
      case "history": return this.handleHistory(interaction);
      case "modlogs": return this.handleModlogs(interaction);
      case "slowmode": return this.handleSlowmode(interaction);
      case "purge-user": return this.handlePurgeUser(interaction);
      case "nickname": return this.handleNickname(interaction);
      case "sync-nickname": return this.handleSync(interaction, true);
      case "sync-roles": return this.handleSync(interaction, false);
      case "sync-all": return this.handleSyncAll(interaction);
      case "player-info": return this.handlePlayerInfo(interaction);
      case "quarantine": return this.handleQuarantine(interaction);
      case "unquarantine": return this.handleUnquarantine(interaction);
      case "lockdown": return this.handleLockdown(interaction);
      case "unlockdown": return this.handleUnlockdown(interaction);
      case "security-status": return this.handleSecurityStatus(interaction);
      case "anti-raid": return this.handleAntiRaid(interaction);
      case "anti-nuke": return this.handleAntiNuke(interaction);
      case "security-whitelist": return this.handleSecurityWhitelist(interaction);
      case "security-incidents": return this.handleSecurityIncidents(interaction);
      case "security-case": return this.handleSecurityCase(interaction);
      case "ticket-close": return this.handleTicketClose(interaction);
      case "ticket-add": return this.handleTicketAdd(interaction);
      case "ticket-remove": return this.handleTicketRemove(interaction);
      case "ticket-claim": return this.handleTicketClaim(interaction);
      case "ticket-list": return this.handleTicketList(interaction);
      case "report": return this.handleReport(interaction);
      case "community-members": return this.handleCommunityMembers(interaction);
      case "community-ranks": return this.handleCommunityRanks(interaction);
      case "community-profile": return this.handleCommunityProfile(interaction);
      case "force-unverify": return this.handleForceUnverify(interaction);
      case "verified-list": return this.handleVerifiedList(interaction);
      case "reward-history": return this.handleRewardHistory(interaction);
      case "revoke-reward": return this.handleRevokeReward(interaction);
      case "give-points": return this.handleGiveReward(interaction, "points");
      case "give-money": return this.handleGiveReward(interaction, "money");
      case "server-status": return this.handleServerStatus(interaction);
      case "bot-info": return this.handleBotInfo(interaction);
      case "help": return this.handleHelp(interaction);
      default: return false;
    }
  }

  async handleMute(interaction) {
    await this.assertStaff(interaction);
    const user = interaction.options.getUser("usuario", true);
    const minutes = interaction.options.getInteger("minutos", true);
    const reason = cleanReason(interaction.options.getString("motivo"));
    const member = await interaction.guild.members.fetch(user.id);
    if (!member.moderatable) throw new Error("O Voxel não consegue aplicar timeout neste membro pela hierarquia atual.");
    await member.timeout(minutes * 60_000, `Voxel: ${reason}`);
    const record = await this.recordCase(interaction, "mute", user.id, reason, { minutes });
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Timeout aplicado", `<@${user.id}> recebeu timeout por **${minutes} minuto(s)**.`).addFields({ name: "Caso", value: `\`${record.id}\`` })] });
  }

  async handleUnmute(interaction) {
    await this.assertStaff(interaction);
    const user = interaction.options.getUser("usuario", true);
    const reason = cleanReason(interaction.options.getString("motivo"));
    const member = await interaction.guild.members.fetch(user.id);
    if (!member.moderatable) throw new Error("O Voxel não consegue alterar o timeout deste membro.");
    await member.timeout(null, `Voxel: ${reason}`);
    await this.recordCase(interaction, "unmute", user.id, reason);
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Timeout removido", `<@${user.id}> pode voltar a interagir normalmente.`)] });
  }

  async handleKick(interaction) {
    await this.assertSenior(interaction);
    const user = interaction.options.getUser("usuario", true);
    const reason = cleanReason(interaction.options.getString("motivo"));
    const member = await interaction.guild.members.fetch(user.id);
    if (!member.kickable) throw new Error("O Voxel não consegue expulsar este membro pela hierarquia atual.");
    await this.recordCase(interaction, "kick", user.id, reason);
    await member.kick(`Voxel: ${reason}`);
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Membro expulso", `${user.username} foi removido do servidor.`)] });
  }

  async handleWarns(interaction) {
    await this.assertStaff(interaction);
    const user = interaction.options.getUser("usuario", true);
    const warnings = await this.database.listWarnings(user.id, { limit: 20 });
    const lines = warnings.map((warning, index) => `${index + 1}. \`${warning.id}\` • ${short(warning.reason, 120)} • ${ts(warning.createdAt)}`);
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed(`Advertências • ${user.username}`, lines.length ? lines.join("\n") : "Nenhuma advertência registrada.")] });
  }

  async handleRemoveWarning(interaction) {
    await this.assertSenior(interaction);
    const user = interaction.options.getUser("usuario", true);
    const warningId = interaction.options.getString("id", true).trim();
    const warning = await this.database.removeWarning(user.id, warningId);
    if (!warning) throw new Error("Advertência não encontrada.");
    await this.recordCase(interaction, "warning-removed", user.id, warning.reason, { warningId });
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Advertência removida", `A advertência \`${warningId}\` foi removida de <@${user.id}>.`)] });
  }

  async handleResetWarnings(interaction) {
    this.assertAdmin(interaction);
    const user = interaction.options.getUser("usuario", true);
    const count = await this.database.resetWarnings(user.id);
    await this.recordCase(interaction, "warnings-reset", user.id, `Reset de ${count} advertência(s).`);
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Advertências resetadas", `Foram removidas **${count}** advertência(s) de <@${user.id}>.`)] });
  }

  async handleHistory(interaction) {
    await this.assertStaff(interaction);
    const user = interaction.options.getUser("usuario", true);
    const [cases, warnings, ban] = await Promise.all([
      this.moderationStore.listCases(user.id, 20),
      this.database.listWarnings(user.id, { limit: 10 }),
      this.database.getGameBanByDiscordUserId(user.id)
    ]);
    const lines = cases.map((item) => `• **${item.type}** • ${ts(item.createdAt)} • ${short(item.reason, 100)}`);
    if (warnings.length) lines.push(`• **Advertências ativas:** ${warnings.length}`);
    if (ban) lines.push(`• **Ban no jogo:** ${ban.expiresAt ? `até ${ts(ban.expiresAt, "f")}` : "permanente"}`);
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed(`Histórico • ${user.username}`, lines.length ? lines.join("\n") : "Nenhum histórico encontrado.")] });
  }

  async handleModlogs(interaction) {
    this.assertAdmin(interaction);
    const channel = interaction.options.getChannel("canal");
    if (channel && !channel.isTextBased()) throw new Error("Escolha um canal de texto.");
    await this.moderationStore.setModlogChannel(channel?.id ?? null);
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Canal de moderação atualizado", channel ? `Novos registros serão enviados em <#${channel.id}>.` : "O envio automático de logs foi desativado.")] });
  }

  async handleSlowmode(interaction) {
    await this.assertStaff(interaction);
    const seconds = interaction.options.getInteger("segundos", true);
    if (!interaction.channel?.isTextBased() || typeof interaction.channel.setRateLimitPerUser !== "function") throw new Error("Este canal não suporta modo lento.");
    await interaction.channel.setRateLimitPerUser(seconds, `Voxel by ${interaction.user.tag}`);
    await this.recordCase(interaction, "slowmode", null, `${seconds}s`, { channelId: interaction.channelId });
    await interaction.reply({ embeds: [this.baseEmbed("Modo lento atualizado", seconds ? `O canal agora possui **${seconds}s** de intervalo.` : "O modo lento foi desativado.")] });
  }

  async handlePurgeUser(interaction) {
    await this.assertStaff(interaction);
    const user = interaction.options.getUser("usuario", true);
    const amount = interaction.options.getInteger("quantidade", true);
    if (!interaction.channel?.isTextBased() || typeof interaction.channel.messages?.fetch !== "function") throw new Error("Este canal não permite limpeza de mensagens.");
    const messages = await interaction.channel.messages.fetch({ limit: Math.min(100, amount) });
    const selected = messages.filter((message) => message.author.id === user.id && Date.now() - message.createdTimestamp < 14 * 24 * 60 * 60_000);
    const deleted = selected.size ? await interaction.channel.bulkDelete(selected, true) : new Map();
    await this.recordCase(interaction, "purge-user", user.id, `${deleted.size} mensagem(ns) removida(s).`, { channelId: interaction.channelId });
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Mensagens removidas", `Foram removidas **${deleted.size}** mensagens recentes de <@${user.id}>.`)] });
  }

  async handleNickname(interaction) {
    this.assertAdmin(interaction);
    const user = interaction.options.getUser("usuario", true);
    const nickname = interaction.options.getString("apelido")?.trim() || null;
    const member = await interaction.guild.members.fetch(user.id);
    if (!member.manageable) throw new Error("O Voxel não consegue alterar o apelido deste membro pela hierarquia.");
    await member.setNickname(nickname, `Voxel by ${interaction.user.tag}`);
    await this.recordCase(interaction, "nickname", user.id, nickname || "Apelido removido");
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Apelido atualizado", nickname ? `Novo apelido: **${nickname}**` : "O apelido manual foi removido.")] });
  }

  async handleSync(interaction, nicknameOnly) {
    await this.assertStaff(interaction);
    const user = interaction.options.getUser("usuario", true);
    const result = await this.verificationService.syncMemberFromCache(user.id);
    await this.recordCase(interaction, nicknameOnly ? "sync-nickname" : "sync-roles", user.id, "Sincronização manual com o perfil do jogo.");
    const label = result.profile?.military?.label || "Civil";
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Sincronização concluída", `<@${user.id}> foi sincronizado com **${label}**.`)] });
  }

  async handleSyncAll(interaction) {
    this.assertAdmin(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const links = await this.database.listVerified({ limit: 5000 });
    let synced = 0;
    let failed = 0;
    for (const link of links) {
      try {
        await this.verificationService.syncMemberFromCache(link.discordUserId);
        synced += 1;
      } catch {
        failed += 1;
      }
    }
    await this.recordCase(interaction, "sync-all", null, `${synced} sincronizados, ${failed} falharam.`);
    await interaction.editReply({ embeds: [this.baseEmbed("Sincronização geral concluída", `**${synced}** atualizados • **${failed}** não puderam ser sincronizados.`)] });
  }

  async handlePlayerInfo(interaction) {
    await this.assertStaff(interaction);
    const user = interaction.options.getUser("usuario", true);
    const [cached, warnings, cases, ban] = await Promise.all([
      this.verificationService.getLinkedProfile(user.id),
      this.database.countWarnings(user.id),
      this.moderationStore.listCases(user.id, 5),
      this.database.getGameBanByDiscordUserId(user.id)
    ]);
    const profile = cached?.profile;
    const communities = Array.isArray(profile?.communities) ? profile.communities : [];
    const embed = this.baseEmbed(`Jogador • ${user.username}`)
      .addFields(
        { name: "Verificação", value: cached?.link ? `Roblox \`${cached.link.robloxUserId}\` • ${cached.link.robloxUsername}` : "Não verificado", inline: false },
        { name: "Personagem", value: profile?.characterName || "Não sincronizado", inline: true },
        { name: "EB", value: profile?.military?.isMember ? profile.military.label || `Rank ${profile.military.rank}` : "Civil", inline: true },
        { name: "Divisão", value: profile?.division?.isMember ? profile.division.label || profile.division.key : "Nenhuma", inline: true },
        { name: "Comunidades", value: String(communities.length), inline: true },
        { name: "Advertências", value: String(warnings), inline: true },
        { name: "Ban no jogo", value: ban ? (ban.expiresAt ? `Até ${ts(ban.expiresAt, "f")}` : "Permanente") : "Não", inline: true },
        { name: "Casos recentes", value: cases.length ? cases.map((item) => `• ${item.type} • ${ts(item.createdAt)}`).join("\n") : "Nenhum", inline: false }
      ).setTimestamp();
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed] });
  }

  async handleQuarantine(interaction) {
    await this.assertSenior(interaction);
    const user = interaction.options.getUser("usuario", true);
    const hours = interaction.options.getInteger("horas", true);
    const reason = cleanReason(interaction.options.getString("motivo"));
    const member = await interaction.guild.members.fetch(user.id);
    if (!member.moderatable) throw new Error("O Voxel não consegue conter este membro pela hierarquia atual.");
    const roles = member.roles.cache.filter((role) => role.id !== interaction.guild.roles.everyone.id && !role.managed && role.editable).map((role) => role.id);
    if (roles.length) await member.roles.remove(roles, `Voxel quarantine: ${reason}`);
    await member.timeout(hours * 60 * 60_000, `Voxel quarantine: ${reason}`);
    await this.moderationStore.setQuarantine(user.id, { roles, reason, moderatorDiscordId: interaction.user.id, until: Date.now() + hours * 60 * 60_000, createdAt: Date.now() });
    await this.recordCase(interaction, "quarantine", user.id, reason, { hours, roles });
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Membro em quarentena", `<@${user.id}> foi contido por **${hours} hora(s)**.`)] });
  }

  async handleUnquarantine(interaction) {
    await this.assertSenior(interaction);
    const user = interaction.options.getUser("usuario", true);
    const record = await this.moderationStore.removeQuarantine(user.id);
    const member = await interaction.guild.members.fetch(user.id);
    if (member.moderatable) await member.timeout(null, `Voxel unquarantine by ${interaction.user.tag}`).catch(() => {});
    if (record?.roles?.length) {
      const restorable = record.roles.filter((id) => interaction.guild.roles.cache.get(id)?.editable);
      if (restorable.length) await member.roles.add(restorable, `Voxel restore after quarantine`).catch(() => {});
    }
    await this.verificationService.syncMemberFromCache(user.id).catch(() => {});
    await this.recordCase(interaction, "unquarantine", user.id, "Quarentena removida.");
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Quarentena removida", `<@${user.id}> foi liberado e seus dados foram ressincronizados.`)] });
  }

  async handleLockdown(interaction) {
    await this.assertCommander(interaction);
    const existing = await this.moderationStore.getLockdownState();
    if (existing?.active) throw new Error("O servidor já está em lockdown.");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const locked = [];
    for (const channel of interaction.guild.channels.cache.values()) {
      if (![ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum].includes(channel.type)) continue;
      try {
        await this.channelLockService.lock(channel, interaction.user.id);
        locked.push(channel.id);
      } catch {}
    }
    const reason = cleanReason(interaction.options.getString("motivo"));
    await this.moderationStore.setLockdownState({ active: true, channelIds: locked, reason, moderatorDiscordId: interaction.user.id, createdAt: Date.now() });
    await this.recordCase(interaction, "lockdown", null, reason, { channels: locked.length });
    await interaction.editReply({ embeds: [this.baseEmbed("Lockdown ativado", `**${locked.length}** canais foram bloqueados para @everyone.`)] });
  }

  async handleUnlockdown(interaction) {
    await this.assertCommander(interaction);
    const state = await this.moderationStore.getLockdownState();
    if (!state?.active) throw new Error("O servidor não está em lockdown.");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let restored = 0;
    for (const channelId of state.channelIds ?? []) {
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (!channel) continue;
      try {
        await this.channelLockService.unlock(channel, interaction.user.id);
        restored += 1;
      } catch {}
    }
    await this.moderationStore.clearLockdownState();
    await this.recordCase(interaction, "unlockdown", null, "Lockdown encerrado.", { channels: restored });
    await interaction.editReply({ embeds: [this.baseEmbed("Lockdown encerrado", `As permissões de **${restored}** canais foram restauradas.`)] });
  }

  async handleSecurityStatus(interaction) {
    await this.assertSenior(interaction);
    const [status, quarantines, incidents] = await Promise.all([
      this.securityService.getStatus(),
      this.moderationStore.listQuarantines(),
      this.database.listSecurityIncidents({ limit: 5 })
    ]);
    const embed = this.baseEmbed("Status de segurança")
      .addFields(
        { name: "Anti-Raid", value: `${status.antiRaidEnabled ? "Ativo" : "Desativado"}\nLimite: ${status.antiRaidThreshold}`, inline: true },
        { name: "Anti-Nuke", value: `${status.antiNukeEnabled ? "Ativo" : "Desativado"}\nSensibilidade: ${status.antiNukeThreshold}`, inline: true },
        { name: "Quarentenas", value: String(quarantines.length), inline: true },
        { name: "Whitelist", value: String(status.whitelist.length), inline: true },
        { name: "Incidentes recentes", value: incidents.length ? incidents.map((item) => `• \`${item.id}\` ${item.type} ${ts(item.createdAt)}`).join("\n") : "Nenhum", inline: false }
      ).setTimestamp();
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed] });
  }

  async handleAntiRaid(interaction) {
    this.assertAdmin(interaction);
    const action = interaction.options.getString("acao", true);
    const threshold = interaction.options.getInteger("limite");
    const status = await this.securityService.configureAntiRaid({ enabled: action === "enable" ? true : action === "disable" ? false : null, threshold: action === "config" ? threshold : null });
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Anti-Raid atualizado", `Estado: **${status.antiRaidEnabled ? "Ativo" : "Desativado"}** • Limite: **${status.antiRaidThreshold} entradas**.`)] });
  }

  async handleAntiNuke(interaction) {
    this.assertAdmin(interaction);
    const action = interaction.options.getString("acao", true);
    const threshold = interaction.options.getInteger("sensibilidade");
    const status = await this.securityService.configureAntiNuke({ enabled: action === "enable" ? true : action === "disable" ? false : null, threshold: action === "config" ? threshold : null });
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Anti-Nuke atualizado", `Estado: **${status.antiNukeEnabled ? "Ativo" : "Desativado"}** • Sensibilidade: **${status.antiNukeThreshold}**.`)] });
  }

  async handleSecurityWhitelist(interaction) {
    this.assertOwner(interaction);
    const action = interaction.options.getString("acao", true);
    if (action === "list") {
      const status = await this.securityService.getStatus();
      await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Whitelist Anti-Nuke", status.whitelist.length ? status.whitelist.map((id) => `• <@${id}> • \`${id}\``).join("\n") : "Nenhum usuário adicional na whitelist.")] });
      return;
    }
    const user = interaction.options.getUser("usuario");
    if (!user) throw new Error("Informe um usuário para adicionar ou remover.");
    await this.securityService.setWhitelist(user.id, action === "add");
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Whitelist atualizada", `<@${user.id}> foi ${action === "add" ? "adicionado à" : "removido da"} whitelist.`)] });
  }

  async handleSecurityIncidents(interaction) {
    await this.assertSenior(interaction);
    const incidents = await this.database.listSecurityIncidents({ limit: 20 });
    const lines = incidents.map((item) => `• \`${item.id}\` • **${item.type}** • ${ts(item.createdAt)}`);
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Incidentes de segurança", lines.length ? lines.join("\n") : "Nenhum incidente registrado.")] });
  }

  async handleSecurityCase(interaction) {
    await this.assertSenior(interaction);
    const id = interaction.options.getString("id", true).trim();
    const item = await this.database.getSecurityIncident(id);
    if (!item) throw new Error("Incidente não encontrado.");
    const embed = this.baseEmbed(`Incidente • ${item.type || "security"}`)
      .addFields(
        { name: "ID", value: `\`${id}\``, inline: true },
        { name: "Registrado", value: ts(item.createdAt, "f"), inline: true },
        { name: "Executor", value: item.executorDiscordId ? `<@${item.executorDiscordId}>` : "Não identificado", inline: true },
        { name: "Dados", value: `\`\`\`json\n${short(JSON.stringify(item, null, 2), 900)}\n\`\`\`` }
      );
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed] });
  }

  async handleTicketClose(interaction) {
    const user = interaction.options.getUser("usuario");
    return this.ticketService.closeByCommand(interaction, user);
  }

  async handleTicketAdd(interaction) {
    await this.assertStaff(interaction);
    const user = interaction.options.getUser("usuario", true);
    await this.ticketService.addMember(interaction, user);
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Membro adicionado", `<@${user.id}> agora possui acesso a este ticket.`)] });
  }

  async handleTicketRemove(interaction) {
    await this.assertStaff(interaction);
    const user = interaction.options.getUser("usuario", true);
    await this.ticketService.removeMember(interaction, user);
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Membro removido", `<@${user.id}> não possui mais acesso adicional a este ticket.`)] });
  }

  async handleTicketClaim(interaction) {
    await this.assertStaff(interaction);
    const context = await this.ticketService.claim(interaction);
    await interaction.reply({ embeds: [this.baseEmbed("Ticket assumido", `<@${interaction.user.id}> assumiu o atendimento de <@${context.ownerId}>.`)] });
  }

  async handleTicketList(interaction) {
    await this.assertStaff(interaction);
    const tickets = await this.ticketService.listOpen();
    const lines = tickets.slice(0, 20).map((ticket) => `• <#${ticket.channelId}> • <@${ticket.discordUserId}> • ${ticket.claimedBy ? `atendido por <@${ticket.claimedBy}>` : "não assumido"}`);
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Tickets abertos", lines.length ? lines.join("\n") : "Nenhum ticket aberto.")] });
  }

  async ensureReportsChannel(guild) {
    const configured = await this.moderationStore.getModlogChannel();
    if (configured) {
      const channel = await guild.channels.fetch(configured).catch(() => null);
      if (channel?.isTextBased()) return channel;
    }
    const existing = guild.channels.cache.find((channel) => channel.name === "voxel-reports" && channel.type === ChannelType.GuildText);
    if (existing) return existing;
    if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) throw new Error("Configure `/modlogs` para que o Voxel saiba onde entregar denúncias.");
    const overwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: this.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ...["oficiais", "superiores", "comandantes"].map((key) => this.roleIds[key]).filter(Boolean).map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }))
    ];
    return guild.channels.create({ name: "voxel-reports", type: ChannelType.GuildText, permissionOverwrites: overwrites, reason: "Voxel report system" });
  }

  async handleReport(interaction) {
    const target = interaction.options.getUser("usuario", true);
    const reason = interaction.options.getString("motivo", true).trim();
    const attachment = interaction.options.getAttachment("prova");
    const channel = await this.ensureReportsChannel(interaction.guild);
    const report = await this.recordCase(interaction, "report", target.id, reason, { reporterDiscordId: interaction.user.id, attachmentUrl: attachment?.url ?? null });
    const embed = this.baseEmbed("Nova denúncia", reason)
      .addFields(
        { name: "Denunciante", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Denunciado", value: `<@${target.id}>`, inline: true },
        { name: "Caso", value: `\`${report.id}\``, inline: true }
      ).setTimestamp();
    if (attachment?.contentType?.startsWith("image/")) embed.setImage(attachment.url);
    else if (attachment) embed.addFields({ name: "Prova", value: attachment.url });
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Denúncia enviada", `Sua denúncia foi registrada com o ID \`${report.id}\`.`)] });
  }

  async communityDetails(interaction) {
    const name = interaction.options.getString("comunidade", true).trim();
    const cached = await this.verificationService.getLinkedProfile(interaction.user.id);
    return this.gameBridgeService.request("community-details", { name, viewerRobloxUserId: cached?.link?.robloxUserId ?? 0 });
  }

  async handleCommunityMembers(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const data = await this.communityDetails(interaction);
    const members = Array.isArray(data.members) ? data.members : [];
    const lines = members.slice(0, 25).map((member, index) => `${index + 1}. **${member.characterName || member.username || member.userId}** • ${member.roleName || "Membro"}`);
    await interaction.editReply({ embeds: [this.baseEmbed(`Membros • ${data.name}`, lines.length ? lines.join("\n") : "Nenhum membro retornado.").setFooter({ text: `Voxel • ${data.memberCount ?? members.length} membros no total` })] });
  }

  async handleCommunityRanks(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const data = await this.communityDetails(interaction);
    const roles = Array.isArray(data.roles) ? data.roles : [];
    const lines = roles.slice(0, 25).map((role) => `• **${role.name}** • rank \`${role.rank}\` • ${role.memberCount ?? 0} membro(s)`);
    await interaction.editReply({ embeds: [this.baseEmbed(`Cargos • ${data.name}`, lines.length ? lines.join("\n") : "Nenhum cargo disponível.")] });
  }

  async handleCommunityProfile(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const data = await this.communityDetails(interaction);
    await interaction.editReply({ embeds: [this.baseEmbed(data.name || "Comunidade", data.description || "Sem descrição.")
      .addFields(
        { name: "Dono", value: `${data.ownerUsername || "Desconhecido"}\n\`${data.ownerUserId || 0}\``, inline: true },
        { name: "Membros", value: String(data.memberCount ?? 0), inline: true },
        { name: "Cargos", value: String(data.roles?.length ?? data.roleCount ?? 0), inline: true },
        { name: "ID", value: `\`${data.id || "n/a"}\`` }
      ).setTimestamp()] });
  }

  async handleForceUnverify(interaction) {
    this.assertAdmin(interaction);
    const user = interaction.options.getUser("usuario", true);
    const member = await interaction.guild.members.fetch(user.id);
    const result = await this.verificationService.unverify(member);
    await this.recordCase(interaction, "force-unverify", user.id, "Vinculação removida administrativamente.");
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Vinculação removida", result.unlinked ? `<@${user.id}> foi desconectado do Roblox.` : "A conta já não estava vinculada.")] });
  }

  async handleVerifiedList(interaction) {
    this.assertAdmin(interaction);
    const links = await this.database.listVerified({ limit: 100 });
    const lines = links.slice(0, 30).map((link) => `• <@${link.discordUserId}> ↔ **${link.robloxUsername}** \`${link.robloxUserId}\` • ${ts(link.updatedAt)}`);
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed(`Verificados • ${links.length}`, lines.length ? lines.join("\n") : "Nenhuma conta verificada.")] });
  }

  async handleRewardHistory(interaction) {
    const target = interaction.options.getUser("usuario") ?? interaction.user;
    if (target.id !== interaction.user.id) this.assertAdmin(interaction);
    const rewards = await this.database.listRewardsForDiscord(target.id, { limit: 20 });
    const lines = rewards.map((reward) => `• \`${reward.code}\` • ${reward.rewardType === "money" ? `R$ ${reward.amount}` : `${reward.amount} Points`} • ${reward.consumedAt ? `resgatado ${ts(reward.consumedAt)}` : `expira ${ts(reward.expiresAt)}`}`);
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed(`Recompensas • ${target.username}`, lines.length ? lines.join("\n") : "Nenhuma recompensa encontrada.")] });
  }

  async handleRevokeReward(interaction) {
    this.assertOwner(interaction);
    const code = interaction.options.getString("codigo", true).trim().toUpperCase();
    const reward = await this.database.revokeRewardCode(code);
    if (!reward) throw new Error("Código inexistente, expirado ou já consumido.");
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Recompensa revogada", `O código \`${code}\` foi invalidado.`)] });
  }

  async handleGiveReward(interaction, rewardType) {
    this.assertOwner(interaction);
    const target = interaction.options.getUser("usuario", true);
    const amount = interaction.options.getInteger("quantidade", true);
    const linked = await this.verificationService.getLinkedProfile(target.id);
    if (!linked?.link) throw new Error("O usuário selecionado precisa estar verificado.");
    const reward = await this.rewardService.issueManual({ rewardType, amount, discordUserId: target.id });
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Recompensa preparada", `<@${target.id}> recebeu um código de **${rewardType === "money" ? `R$ ${amount}` : `${amount} Points`}**.\n\n## \`${reward.code}\``).addFields({ name: "Validade", value: ts(reward.expiresAt), inline: true })] });
  }

  async handleServerStatus(interaction) {
    const [verified, servers, security] = await Promise.all([
      this.database.countVerified(),
      this.gamePresenceService.listServers(),
      this.securityService.getStatus()
    ]);
    const online = servers.reduce((sum, server) => sum + Number(server.playerCount ?? 0), 0);
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Status operacional")
      .addFields(
        { name: "Discord Gateway", value: this.client.isReady() ? "Online" : "Reconectando", inline: true },
        { name: "Firebase", value: "Conectado", inline: true },
        { name: "Roblox", value: `${servers.length} servidor(es) • ${online} jogador(es)`, inline: true },
        { name: "Verificados", value: String(verified), inline: true },
        { name: "Anti-Raid", value: security.antiRaidEnabled ? "Ativo" : "Desativado", inline: true },
        { name: "Anti-Nuke", value: security.antiNukeEnabled ? "Ativo" : "Desativado", inline: true }
      ).setTimestamp()] });
  }

  async handleBotInfo(interaction) {
    const verified = await this.database.countVerified();
    const uptime = Date.now() - this.startedAt;
    await interaction.reply({ embeds: [this.baseEmbed("Voxel", "Integração oficial entre Discord, Roblox e o Sistema de Comunidades.")
      .addFields(
        { name: "Uptime", value: fmtDuration(uptime), inline: true },
        { name: "Usuários verificados", value: String(verified), inline: true },
        { name: "Gateway", value: this.client.isReady() ? "Online" : "Reconectando", inline: true },
        { name: "Persistência", value: "Firebase Realtime Database", inline: false }
      ).setTimestamp()] });
  }

  async handleHelp(interaction) {
    const embed = this.baseEmbed("Central de comandos", "Os comandos são organizados por função e respeitam a hierarquia do EB.")
      .addFields(
        { name: "Conta e jogo", value: "`/verify` `/unverify` `/profile` `/groups` `/game` `/community-hub`", inline: false },
        { name: "Comunidade", value: "`/economy` `/events` `/social` `/progress` `/giveaway` `/quiz` `/suggest` `/fun`", inline: false },
        { name: "Moderação", value: "`/advertir` `/mute` `/unmute` `/kick` `/warns` `/history` `/player-info` `/report`", inline: false },
        { name: "Segurança", value: "`/lock-chat` `/lockdown` `/security-status` `/anti-raid` `/anti-nuke`", inline: false },
        { name: "Tickets", value: "`/ticket` `/ticket-claim` `/ticket-add` `/ticket-remove` `/ticket-close`", inline: false },
        { name: "Administração", value: "`/sync-roles` `/sync-all` `/verified-list` `/modlogs` `/server-status`", inline: false }
      );
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed] });
  }
}
