import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Events,
  MessageFlags,
  PermissionFlagsBits
} from "discord.js";
import { communityExperienceCommands } from "../../commands/extended/communityCommands.js";
import { EB_VERIFICATION_CONFIG } from "../../config/ebVerificationConfig.js";

const COMMAND_NAMES = new Set(communityExperienceCommands.map((builder) => builder.name));
const SHOP_PREFIX = "voxel-shop";
const GIVEAWAY_PREFIX = "voxel-giveaway-enter";
const SUGGEST_PREFIX = "voxel-suggest-vote";
const POLL_PREFIX = "voxel-poll-vote";

const SHOP_ITEMS = Object.freeze([
  { id: "bronze-badge", name: "Distintivo Bronze", price: 50, description: "Distintivo permanente no inventário Voxel." },
  { id: "silver-badge", name: "Distintivo Prata", price: 150, description: "Distintivo permanente no inventário Voxel." },
  { id: "supporter-title", name: "Título Apoiador", price: 300, description: "Título virtual para o perfil Voxel." }
]);

const EIGHT_BALL = Object.freeze([
  "Sim.", "Provavelmente.", "Os sinais apontam que sim.", "É possível.", "Não parece provável.", "Não.", "Melhor confirmar depois.", "Ainda não há informação suficiente."
]);

const RANKS = Object.freeze([
  "[REC] Recruta", "[SLD] Soldado", "[CB] Cabo", "[T-SGT] Terceiro-Sargento", "[S-SGT] Segundo-Sargento",
  "[P-SGT] Primeiro-Sargento", "[S-BTN] Sub-Tenente", "[AAO] Aspirante-A-Oficial", "[S-TN] Segundo-Tenente",
  "[P-TN] Primeiro-Tenente", "[CAP] Capitão", "[MAJ] Major", "[TEN-C] Tenente-Coronel", "[COR] Coronel",
  "[GEN-B] General-De-Brigada", "[GEN-D] General-De-Divisão", "[GEN-E] General-De-Exército", "[S-COM] Sub-Comandante", "[COM] Comandante"
]);

function ts(ms, style = "R") {
  const value = Math.floor(Number(ms) / 1000);
  return Number.isFinite(value) && value > 0 ? `<t:${value}:${style}>` : "N/A";
}

function duration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return `${days}d ${hours}h ${minutes}m`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function splitOptions(raw, max = 10) {
  return String(raw ?? "").split("|").map((value) => value.trim()).filter(Boolean).slice(0, max);
}

function shuffle(values) {
  const list = [...values];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [list[index], list[swap]] = [list[swap], list[index]];
  }
  return list;
}

export class CommunityExperienceCommandService {
  constructor({
    client,
    guildId,
    database,
    verificationService,
    rewardService,
    gameBridgeService,
    gamePresenceService,
    engagementStore,
    roleIds = {}
  }) {
    this.client = client;
    this.guildId = guildId;
    this.database = database;
    this.verificationService = verificationService;
    this.rewardService = rewardService;
    this.gameBridgeService = gameBridgeService;
    this.gamePresenceService = gamePresenceService;
    this.engagementStore = engagementStore;
    this.roleIds = roleIds;
    this.initialized = false;
  }

  getCommandBuilders() {
    return communityExperienceCommands;
  }

  canHandleCommand(name) {
    return COMMAND_NAMES.has(name);
  }

  canHandleButton(customId) {
    return [SHOP_PREFIX, GIVEAWAY_PREFIX, SUGGEST_PREFIX, POLL_PREFIX].some((prefix) => customId.startsWith(`${prefix}:`));
  }

  baseEmbed(title, description = null) {
    const embed = new EmbedBuilder()
      .setColor(EB_VERIFICATION_CONFIG.color)
      .setAuthor({ name: "Voxel", iconURL: this.client.user?.displayAvatarURL({ size: 128 }) ?? undefined })
      .setTitle(title)
      .setFooter({ text: "Voxel • Comunidade" });
    if (description) embed.setDescription(description);
    return embed;
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    this.client.on(Events.MessageCreate, (message) => {
      if (!message.guild || message.guild.id !== this.guildId || message.author.bot) return;
      this.engagementStore.recordMessage(message.author.id).catch(() => {});
      this.handleAfkMessage(message).catch(() => {});
    });

    setInterval(() => this.checkBirthdays().catch(() => {}), 60 * 60_000).unref?.();
    setInterval(() => this.checkGiveaways().catch(() => {}), 30_000).unref?.();
  }

  async checkGiveaways() {
    if (!this.client.isReady()) return;
    const snapshot = await this.engagementStore.root.child("giveaways").get();
    const now = Date.now();
    for (const [id, giveaway] of Object.entries(snapshot.val() ?? {})) {
      if (!giveaway || giveaway.endedAt || Number(giveaway.endsAt ?? 0) > now) continue;
      const entries = Object.keys(giveaway.entries ?? {});
      const winners = shuffle(entries).slice(0, Math.max(1, Number(giveaway.winnerCount ?? 1)));
      await this.engagementStore.updateGiveaway(id, { winners, endedAt: now });
      const channel = await this.client.channels.fetch(giveaway.channelId).catch(() => null);
      if (!channel?.isTextBased()) continue;
      const resultText = winners.length ? winners.map((uid) => `<@${uid}>`).join(", ") : "Nenhum participante válido.";
      if (giveaway.messageId) {
        const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
        if (message) {
          await message.edit({ embeds: [this.baseEmbed("Sorteio encerrado", `**${giveaway.prize}**\nVencedor(es): ${resultText}`).setFooter({ text: `Voxel • Sorteio ${id}` })], components: [] }).catch(() => {});
          continue;
        }
      }
      await channel.send({ embeds: [this.baseEmbed("Sorteio encerrado", `**${giveaway.prize}**\nVencedor(es): ${resultText}`)], allowedMentions: { users: winners } }).catch(() => {});
    }
  }

  async handleAfkMessage(message) {
    const own = await this.engagementStore.getUser(message.author.id);
    if (own.afk) {
      await this.engagementStore.setAfk(message.author.id, null);
      await message.reply({ content: "Seu estado AFK foi removido automaticamente.", allowedMentions: { repliedUser: false } }).then((reply) => setTimeout(() => reply.delete().catch(() => {}), 5000)).catch(() => {});
    }

    const mentioned = [...message.mentions.users.values()].filter((user) => !user.bot && user.id !== message.author.id).slice(0, 5);
    for (const user of mentioned) {
      const state = await this.engagementStore.getUser(user.id);
      if (!state.afk) continue;
      await message.reply({ content: `<@${user.id}> está AFK: **${state.afk.reason}** • desde ${ts(state.afk.since)}`, allowedMentions: { users: [user.id], repliedUser: false } }).catch(() => {});
    }
  }

  async checkBirthdays() {
    if (!this.client.isReady()) return;
    const guild = await this.client.guilds.fetch(this.guildId).catch(() => null);
    if (!guild) return;
    const channel = guild.systemChannel;
    if (!channel?.isTextBased()) return;
    const nowMs = Date.now();
    const usersSnap = await this.engagementStore.root.child("users").get();
    for (const [discordId, value] of Object.entries(usersSnap.val() ?? {})) {
      const offset = Number.isInteger(value?.timezone) ? Number(value.timezone) : -3;
      const local = new Date(nowMs + offset * 60 * 60_000);
      const key = `${String(local.getUTCDate()).padStart(2, "0")}/${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
      const today = local.toISOString().slice(0, 10);
      if (value?.birthday !== key || value?.lastBirthdayGreeting === today) continue;
      await channel.send({ content: `Hoje é aniversário de <@${discordId}>. Parabéns!`, allowedMentions: { users: [discordId] } }).catch(() => {});
      await this.engagementStore.root.child(`users/${discordId}/lastBirthdayGreeting`).set(today);
    }
  }

  async assertStaff(interaction) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return member;
    const allowed = ["oficiais", "superiores", "comandantes"].map((key) => this.roleIds[key]).filter(Boolean);
    if (allowed.some((id) => member.roles.cache.has(id))) return member;
    throw new Error("Esta ação exige Oficiais, Superiores, Comandantes ou Administradores.");
  }

  async linked(discordUserId) {
    const cached = await this.verificationService.getLinkedProfile(discordUserId);
    if (!cached?.link) throw new Error("Use `/verify` antes de utilizar este recurso.");
    return cached;
  }

  async handleCommand(interaction) {
    if (interaction.guildId !== this.guildId || !interaction.guild || !this.canHandleCommand(interaction.commandName)) return false;
    switch (interaction.commandName) {
      case "economy": return this.handleEconomy(interaction);
      case "game": return this.handleGame(interaction);
      case "community-hub": return this.handleCommunityHub(interaction);
      case "events": return this.handleEvents(interaction);
      case "social": return this.handleSocial(interaction);
      case "progress": return this.handleProgress(interaction);
      case "giveaway": return this.handleGiveaway(interaction);
      case "quiz": return this.handleQuiz(interaction);
      case "suggest": return this.handleSuggest(interaction);
      case "fun": return this.handleFun(interaction);
      case "server": return this.handleServer(interaction);
      default: return false;
    }
  }

  async handleButton(interaction) {
    const [prefix, id, extra] = interaction.customId.split(":");
    if (prefix === SHOP_PREFIX) return this.handleShopPurchase(interaction, id);
    if (prefix === GIVEAWAY_PREFIX) return this.handleGiveawayEntry(interaction, id);
    if (prefix === SUGGEST_PREFIX) return this.handleSuggestionVote(interaction, id, extra);
    if (prefix === POLL_PREFIX) return this.handlePollVote(interaction, id, Number(extra));
    return false;
  }

  async handleEconomy(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "daily") {
      const linked = await this.linked(interaction.user.id);
      const state = await this.engagementStore.claimDaily(interaction.user.id);
      if (!state?.ok) throw new Error(`Sua próxima diária estará disponível ${ts(state.nextAt)}.`);
      let reward;
      try {
        reward = await this.rewardService.issueManual({ rewardType: "points", amount: 5, discordUserId: interaction.user.id });
      } catch (error) {
        await this.engagementStore.setUserField(interaction.user.id, "lastDailyAt", 0).catch(() => {});
        throw error;
      }
      await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Recompensa diária", `Sequência atual: **${state.streak} dia(s)**.\n\nCódigo para **5 Points**: ## \`${reward.code}\``).addFields({ name: "Validade", value: ts(reward.expiresAt), inline: true })] });
      return;
    }

    if (sub === "rank") {
      const linked = await this.linked(interaction.user.id);
      const [engagement, presence] = await Promise.all([
        this.engagementStore.getUser(interaction.user.id),
        this.gamePresenceService.getUserStats(linked.link.robloxUserId)
      ]);
      const profile = linked.profile;
      await interaction.reply({ embeds: [this.baseEmbed(`Rank de ${interaction.user.username}`)
        .addFields(
          { name: "Nível Voxel", value: `**${engagement.level}** • ${engagement.xp} XP`, inline: true },
          { name: "Mensagens contabilizadas", value: String(engagement.messages), inline: true },
          { name: "Streak", value: `${engagement.dailyStreak} dia(s)`, inline: true },
          { name: "Points", value: String(presence?.profile?.points ?? profile?.economy?.points ?? "Não sincronizado"), inline: true },
          { name: "Dinheiro", value: String(presence?.profile?.money ?? profile?.economy?.money ?? "Não sincronizado"), inline: true },
          { name: "Playtime", value: duration(presence?.totalSeconds ?? 0), inline: true }
        ).setTimestamp()] });
      return;
    }

    if (sub === "leaderboard") {
      const type = interaction.options.getString("tipo") ?? "xp";
      if (type === "xp") {
        const rows = await this.engagementStore.leaderboard(10);
        const lines = rows.map((row, index) => `**${index + 1}.** <@${row.discordUserId}> • nível ${row.level} • ${row.xp} XP`);
        await interaction.reply({ embeds: [this.baseEmbed("Leaderboard • XP", lines.join("\n") || "Sem dados.")] });
        return;
      }
      const rows = await this.gamePresenceService.leaderboard(type === "presence" ? "today" : "total", 10);
      const lines = [];
      for (const [index, row] of rows.entries()) {
        const link = await this.database.getByRobloxUserId(row.robloxUserId);
        lines.push(`**${index + 1}.** ${link ? `<@${link.discordUserId}>` : row.profile?.characterName || `Roblox ${row.robloxUserId}`} • ${duration(row.seconds)}`);
      }
      await interaction.reply({ embeds: [this.baseEmbed(type === "presence" ? "Leaderboard • Presença" : "Leaderboard • Playtime", lines.join("\n") || "Sem dados.")] });
      return;
    }

    if (sub === "shop") {
      const rows = SHOP_ITEMS.map((item) => new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${SHOP_PREFIX}:${item.id}`).setLabel(`${item.name} • ${item.price} Points`).setStyle(ButtonStyle.Secondary)
      ));
      const description = SHOP_ITEMS.map((item) => `**${item.name}** • ${item.price} Points\n${item.description}`).join("\n\n");
      await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Loja Voxel", description)], components: rows.slice(0, 5) });
      return;
    }

    if (sub === "inventory") {
      const state = await this.engagementStore.getUser(interaction.user.id);
      const items = Object.entries(state.inventory).filter(([, qty]) => Number(qty) > 0);
      const lines = items.map(([id, qty]) => `• **${SHOP_ITEMS.find((item) => item.id === id)?.name ?? id}** ×${qty}`);
      await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Seu inventário", lines.join("\n") || "Seu inventário está vazio.")] });
      return;
    }

    if (sub === "transfer-points") {
      const target = interaction.options.getUser("usuario", true);
      const amount = interaction.options.getInteger("quantidade", true);
      if (target.id === interaction.user.id || target.bot) throw new Error("Escolha outro membro válido.");
      const [sender, recipient] = await Promise.all([this.linked(interaction.user.id), this.linked(target.id)]);
      const reward = await this.rewardService.issueManual({ rewardType: "points", amount, discordUserId: target.id });
      try {
        await this.gameBridgeService.request("spend-points", { targetRobloxUserId: sender.link.robloxUserId, amount });
      } catch (error) {
        await this.database.revokeRewardCode(reward.code).catch(() => {});
        throw error;
      }
      const dmText = `Você recebeu **${amount} Points** de ${interaction.user.username}. Resgate no jogo: \`${reward.code}\``;
      await target.send(dmText).catch(() => {});
      await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Transferência preparada", `**${amount} Points** foram debitados da sua conta.\nCódigo destinado a <@${target.id}>: \`${reward.code}\``)] });
    }
  }

  async handleShopPurchase(interaction, itemId) {
    const item = SHOP_ITEMS.find((entry) => entry.id === itemId);
    if (!item) throw new Error("Item não encontrado.");
    const linked = await this.linked(interaction.user.id);
    await this.gameBridgeService.request("spend-points", { targetRobloxUserId: linked.link.robloxUserId, amount: item.price });
    const quantity = await this.engagementStore.addInventoryItem(interaction.user.id, item.id, 1);
    await interaction.update({ embeds: [this.baseEmbed("Compra concluída", `Você adquiriu **${item.name}** por **${item.price} Points**.\nQuantidade atual: **${quantity}**.`)], components: [] });
  }

  async handleGame(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "roblox") {
      const target = interaction.options.getUser("usuario") ?? interaction.user;
      const cached = await this.verificationService.getLinkedProfile(target.id);
      if (!cached?.link) throw new Error("Este usuário não está verificado.");
      const profile = cached.profile;
      const stats = await this.gamePresenceService.getUserStats(cached.link.robloxUserId);
      await interaction.reply({ embeds: [this.baseEmbed(`Roblox • ${target.username}`)
        .addFields(
          { name: "Conta", value: `**${profile?.characterName || cached.link.robloxUsername}**\n\`${cached.link.robloxUsername}\` • \`${cached.link.robloxUserId}\``, inline: false },
          { name: "EB", value: profile?.military?.isMember ? profile.military.label || `Rank ${profile.military.rank}` : "Civil", inline: true },
          { name: "Divisão", value: profile?.division?.isMember ? profile.division.label || profile.division.key : "Nenhuma", inline: true },
          { name: "Online", value: await this.gamePresenceService.isOnline(cached.link.robloxUserId) ? "Sim" : "Não", inline: true },
          { name: "Points", value: String(stats?.profile?.points ?? "N/A"), inline: true },
          { name: "Dinheiro", value: String(stats?.profile?.money ?? "N/A"), inline: true },
          { name: "Playtime", value: duration(stats?.totalSeconds ?? 0), inline: true }
        ).setTimestamp()] });
      return;
    }

    if (sub === "online") {
      const players = await this.gamePresenceService.listOnlinePlayers();
      const lines = [];
      for (const player of players.slice(0, 30)) {
        const link = await this.database.getByRobloxUserId(player.userId);
        lines.push(`• ${link ? `<@${link.discordUserId}>` : `**${player.characterName || player.username}**`} • ${player.militaryLabel || "Civil"}`);
      }
      await interaction.reply({ embeds: [this.baseEmbed(`Jogadores online • ${players.length}`, lines.join("\n") || "Nenhum servidor do jogo reportou jogadores online.")] });
      return;
    }

    if (sub === "servers") {
      const servers = await this.gamePresenceService.listServers();
      const lines = servers.map((server, index) => `**${index + 1}.** \`${server.serverId.slice(0, 12)}…\` • ${server.playerCount}/${server.maxPlayers || "?"} jogadores • visto ${ts(server.lastSeenAt)}`);
      await interaction.reply({ embeds: [this.baseEmbed(`Servidores ativos • ${servers.length}`, lines.join("\n") || "Nenhum servidor ativo detectado.")] });
      return;
    }

    const linked = await this.linked(interaction.user.id);
    const stats = await this.gamePresenceService.getUserStats(linked.link.robloxUserId);
    if (sub === "playtime") {
      await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Seu playtime", `Tempo total registrado: **${duration(stats?.totalSeconds ?? 0)}**.`)] });
    } else if (sub === "presence") {
      await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Sua presença", `Hoje: **${duration(stats?.todaySeconds ?? 0)}**\nTotal: **${duration(stats?.totalSeconds ?? 0)}**\nSessões: **${stats?.sessions ?? 0}**`)] });
    } else if (sub === "top-playtime" || sub === "top-presence") {
      const rows = await this.gamePresenceService.leaderboard(sub === "top-presence" ? "today" : "total", 10);
      const lines = [];
      for (const [index, row] of rows.entries()) {
        const link = await this.database.getByRobloxUserId(row.robloxUserId);
        lines.push(`**${index + 1}.** ${link ? `<@${link.discordUserId}>` : row.profile?.characterName || row.robloxUserId} • ${duration(row.seconds)}`);
      }
      await interaction.reply({ embeds: [this.baseEmbed(sub === "top-presence" ? "Top presença de hoje" : "Top playtime", lines.join("\n") || "Sem dados.")] });
    } else if (sub === "activity") {
      const engagement = await this.engagementStore.getUser(interaction.user.id);
      await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Sua atividade")
        .addFields(
          { name: "Discord", value: `${engagement.messages} mensagens contabilizadas\n${engagement.xp} XP • nível ${engagement.level}`, inline: true },
          { name: "Roblox", value: `${duration(stats?.totalSeconds ?? 0)} total\n${duration(stats?.todaySeconds ?? 0)} hoje`, inline: true }
        )] });
    }
  }

  async handleCommunityHub(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "my-communities") {
      const cached = await this.linked(interaction.user.id);
      const communities = Array.isArray(cached.profile?.communities) ? cached.profile.communities : [];
      const lines = communities.map((community) => `• **${community.name}** • ${community.roleName || "Membro"}`);
      await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Suas comunidades", lines.join("\n") || "Nenhuma comunidade sincronizada.")] });
      return;
    }

    const name = interaction.options.getString("nome", true).trim();
    if (sub === "community") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const data = await this.gameBridgeService.request("community-details", { name, viewerRobloxUserId: (await this.linked(interaction.user.id)).link.robloxUserId });
      await interaction.editReply({ embeds: [this.baseEmbed(data.name, data.description || "Sem descrição.").addFields(
        { name: "Membros", value: String(data.memberCount ?? 0), inline: true },
        { name: "Dono", value: `${data.ownerUsername || "Desconhecido"}\n\`${data.ownerUserId || 0}\``, inline: true },
        { name: "Cargos", value: String(data.roles?.length ?? 0), inline: true }
      )] });
      return;
    }

    const profiles = await this.database.listVerified({ limit: 5000 });
    const matches = [];
    for (const link of profiles) {
      const cached = await this.database.getVerificationProfile(link.robloxUserId);
      const membership = cached?.profile?.communities?.find((community) => String(community.name).toLowerCase() === name.toLowerCase());
      if (!membership) continue;
      const stats = await this.gamePresenceService.getUserStats(link.robloxUserId);
      matches.push({ link, membership, seconds: stats?.todaySeconds ?? 0 });
    }
    if (sub === "ranking") {
      matches.sort((a, b) => b.seconds - a.seconds);
      const lines = matches.slice(0, 15).map((item, index) => `**${index + 1}.** <@${item.link.discordUserId}> • ${item.membership.roleName || "Membro"} • ${duration(item.seconds)}`);
      await interaction.reply({ embeds: [this.baseEmbed(`Ranking • ${name}`, lines.join("\n") || "Nenhum membro verificado encontrado.")] });
    } else if (sub === "random-member") {
      if (!matches.length) throw new Error("Nenhum membro verificado dessa comunidade foi encontrado.");
      const chosen = matches[Math.floor(Math.random() * matches.length)];
      await interaction.reply({ embeds: [this.baseEmbed("Membro sorteado", `<@${chosen.link.discordUserId}> • **${chosen.membership.roleName || "Membro"}**`)] });
    }
  }

  async handleEvents(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "create") {
      await this.assertStaff(interaction);
      const event = await this.engagementStore.createEvent({
        title: interaction.options.getString("titulo", true),
        description: interaction.options.getString("descricao", true),
        startsAt: Date.now() + interaction.options.getInteger("minutos", true) * 60_000,
        limit: interaction.options.getInteger("limite") ?? 0,
        creatorDiscordId: interaction.user.id
      });
      await interaction.reply({ embeds: [this.baseEmbed(event.title, event.description).addFields(
        { name: "ID", value: `\`${event.id}\``, inline: true }, { name: "Início", value: ts(event.startsAt, "F"), inline: true }, { name: "Limite", value: event.limit ? String(event.limit) : "Ilimitado", inline: true }
      )] });
      return;
    }

    if (sub === "list") {
      const events = await this.engagementStore.listEvents(15);
      const lines = events.map((event) => `• \`${event.id}\` **${event.title}** • ${ts(event.startsAt)} • ${Object.keys(event.participants ?? {}).length}${event.limit ? `/${event.limit}` : ""}`);
      await interaction.reply({ embeds: [this.baseEmbed("Próximos eventos", lines.join("\n") || "Nenhum evento agendado.")] });
      return;
    }

    if (sub === "poll") {
      const question = interaction.options.getString("pergunta", true);
      const options = splitOptions(interaction.options.getString("opcoes", true), 5);
      if (options.length < 2) throw new Error("Informe pelo menos duas opções separadas por `|`.");
      const pollRef = this.engagementStore.root.child("polls").push();
      const poll = { id: pollRef.key, question, options, votes: {}, creatorDiscordId: interaction.user.id, createdAt: Date.now() };
      await pollRef.set(poll);
      const rows = [new ActionRowBuilder().addComponents(options.map((label, index) => new ButtonBuilder().setCustomId(`${POLL_PREFIX}:${poll.id}:${index}`).setLabel(label.slice(0, 80)).setStyle(ButtonStyle.Secondary)))];
      await interaction.reply({ embeds: [this.baseEmbed("Votação", question)], components: rows });
      return;
    }

    const id = interaction.options.getString("id", true).trim();
    const event = await this.engagementStore.getEvent(id);
    if (!event) throw new Error("Evento não encontrado.");
    const participants = Object.keys(event.participants ?? {});
    if (sub === "join") {
      if (event.limit && participants.length >= event.limit && !event.participants?.[interaction.user.id]) throw new Error("Este evento atingiu o limite de participantes.");
      await this.engagementStore.setEventParticipant(id, interaction.user.id, true);
      await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Participação confirmada", `Você entrou em **${event.title}**.`)] });
    } else if (sub === "leave") {
      await this.engagementStore.setEventParticipant(id, interaction.user.id, false);
      await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Participação removida", `Você saiu de **${event.title}**.`)] });
    } else if (sub === "random") {
      await this.assertStaff(interaction);
      const count = interaction.options.getInteger("quantidade", true);
      const picked = shuffle(participants).slice(0, count);
      await interaction.reply({ embeds: [this.baseEmbed(`Sorteio • ${event.title}`, picked.length ? picked.map((uid) => `• <@${uid}>`).join("\n") : "Nenhum participante inscrito.")] });
    } else if (sub === "team") {
      await this.assertStaff(interaction);
      const teams = interaction.options.getInteger("equipes", true);
      const shuffled = shuffle(participants);
      const groups = Array.from({ length: teams }, () => []);
      shuffled.forEach((uid, index) => groups[index % teams].push(uid));
      const description = groups.map((group, index) => `**Equipe ${index + 1}**\n${group.map((uid) => `<@${uid}>`).join("\n") || "Vazia"}`).join("\n\n");
      await interaction.reply({ embeds: [this.baseEmbed(`Equipes • ${event.title}`, description)] });
    }
  }

  async handlePollVote(interaction, pollId, optionIndex) {
    const ref = this.engagementStore.root.child(`polls/${pollId}`);
    const snapshot = await ref.get();
    const poll = snapshot.val();
    if (!poll || !Array.isArray(poll.options) || !poll.options[optionIndex]) throw new Error("Votação não encontrada.");
    await ref.child(`votes/${interaction.user.id}`).set(optionIndex);
    const updated = (await ref.get()).val();
    const counts = updated.options.map((_, index) => Object.values(updated.votes ?? {}).filter((vote) => Number(vote) === index).length);
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Voto registrado", updated.options.map((label, index) => `• **${label}**: ${counts[index]}`).join("\n"))] });
  }

  async ensurePingRole(guild, type) {
    const labels = { events: "Eventos", recruitment: "Recrutamento", updates: "Atualizações", communities: "Comunidades" };
    const name = `Voxel • ${labels[type]}`;
    let role = guild.roles.cache.find((candidate) => candidate.name === name);
    if (role) return role;
    if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error("O Voxel precisa de Gerenciar Cargos para criar cargos de notificação.");
    role = await guild.roles.create({ name, mentionable: false, reason: "Voxel opt-in notification role" });
    return role;
  }

  async handleSocial(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "coinflip") {
      await interaction.reply({ embeds: [this.baseEmbed("Cara ou coroa", Math.random() < 0.5 ? "**Cara**" : "**Coroa**")] });
    } else if (sub === "dice") {
      const raw = interaction.options.getString("dados", true).toLowerCase().trim();
      const match = raw.match(/^(\d{1,2})d(\d{1,4})$/);
      if (!match) throw new Error("Use o formato `NdM`, por exemplo `2d6`.");
      const count = Math.min(20, Number(match[1]));
      const sides = Math.min(1000, Number(match[2]));
      if (count < 1 || sides < 2) throw new Error("Configuração de dados inválida.");
      const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
      await interaction.reply({ embeds: [this.baseEmbed(`Dados • ${count}d${sides}`, `Resultados: **${rolls.join(", ")}**\nTotal: **${rolls.reduce((a, b) => a + b, 0)}**`)] });
    } else if (sub === "random") {
      const min = interaction.options.getInteger("min", true);
      const max = interaction.options.getInteger("max", true);
      if (max < min) throw new Error("O valor máximo precisa ser maior ou igual ao mínimo.");
      await interaction.reply({ embeds: [this.baseEmbed("Número sorteado", `**${min + Math.floor(Math.random() * (max - min + 1))}**`)] });
    } else if (sub === "choose") {
      const options = splitOptions(interaction.options.getString("opcoes", true), 20);
      if (options.length < 2) throw new Error("Informe pelo menos duas opções separadas por `|`.");
      await interaction.reply({ embeds: [this.baseEmbed("Escolha do Voxel", `**${options[Math.floor(Math.random() * options.length)]}**`)] });
    } else if (sub === "8ball") {
      const question = interaction.options.getString("pergunta", true);
      await interaction.reply({ embeds: [this.baseEmbed(question, EIGHT_BALL[Math.floor(Math.random() * EIGHT_BALL.length)])] });
    } else if (sub === "avatar") {
      const user = interaction.options.getUser("usuario") ?? interaction.user;
      await interaction.reply({ embeds: [this.baseEmbed(`Avatar • ${user.username}`).setImage(user.displayAvatarURL({ size: 4096 }))] });
    } else if (sub === "banner") {
      const raw = interaction.options.getUser("usuario") ?? interaction.user;
      const user = await this.client.users.fetch(raw.id, { force: true });
      if (!user.bannerURL()) throw new Error("Este usuário não possui banner público.");
      await interaction.reply({ embeds: [this.baseEmbed(`Banner • ${user.username}`).setImage(user.bannerURL({ size: 4096 }))] });
    } else if (sub === "userinfo") {
      const user = interaction.options.getUser("usuario") ?? interaction.user;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const linked = await this.verificationService.getLinkedProfile(user.id);
      await interaction.reply({ embeds: [this.baseEmbed(`Usuário • ${user.username}`)
        .setThumbnail(user.displayAvatarURL({ size: 512 }))
        .addFields(
          { name: "ID", value: `\`${user.id}\``, inline: true },
          { name: "Conta criada", value: ts(user.createdTimestamp, "D"), inline: true },
          { name: "Entrou no servidor", value: member?.joinedTimestamp ? ts(member.joinedTimestamp, "D") : "N/A", inline: true },
          { name: "Verificado", value: linked?.link ? `Sim • Roblox \`${linked.link.robloxUserId}\`` : "Não", inline: true },
          { name: "Cargos", value: member ? String(Math.max(0, member.roles.cache.size - 1)) : "N/A", inline: true }
        )] });
    } else if (sub === "birthday") {
      const value = interaction.options.getString("data", true).trim().toLowerCase();
      if (value === "remover") {
        await this.engagementStore.setUserField(interaction.user.id, "birthday", null);
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: "Aniversário removido." });
        return;
      }
      if (!/^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])$/.test(value)) throw new Error("Use o formato `DD/MM` ou `remover`.");
      await this.engagementStore.setUserField(interaction.user.id, "birthday", value);
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: `Aniversário salvo como **${value}**.` });
    } else if (sub === "quote") {
      const id = interaction.options.getString("mensagem_id", true).trim();
      const message = await interaction.channel.messages.fetch(id).catch(() => null);
      if (!message) throw new Error("Mensagem não encontrada neste canal.");
      await interaction.reply({ embeds: [this.baseEmbed(`Citação • ${message.author.username}`, message.content || "Mensagem sem texto.").setThumbnail(message.author.displayAvatarURL({ size: 128 })).addFields({ name: "Original", value: `[Abrir mensagem](${message.url})` })] });
    } else if (sub === "afk") {
      const reason = interaction.options.getString("motivo")?.trim() || "AFK";
      if (reason.toLowerCase() === "remover") {
        await this.engagementStore.setAfk(interaction.user.id, null);
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: "Estado AFK removido." });
      } else {
        await this.engagementStore.setAfk(interaction.user.id, reason);
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: `AFK ativado: **${reason}**.` });
      }
    } else if (sub === "remember") {
      const note = interaction.options.getString("nota", true).trim();
      await this.engagementStore.setUserField(interaction.user.id, "note", note.toLowerCase() === "remover" ? null : note);
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: note.toLowerCase() === "remover" ? "Nota removida." : "Nota privada salva." });
    } else if (sub === "timezone") {
      const utc = interaction.options.getInteger("utc", true);
      await this.engagementStore.setUserField(interaction.user.id, "timezone", utc);
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: `Fuso horário salvo como **UTC${utc >= 0 ? "+" : ""}${utc}**.` });
    } else if (sub === "ping-role") {
      const type = interaction.options.getString("tipo", true);
      const role = await this.ensurePingRole(interaction.guild, type);
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const has = member.roles.cache.has(role.id);
      if (has) await member.roles.remove(role, "Voxel opt-in notification");
      else await member.roles.add(role, "Voxel opt-in notification");
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: `${has ? "Removido de" : "Adicionado a"} **${role.name}**.` });
    }
  }

  async computeAchievements(discordUserId) {
    const [engagement, linked] = await Promise.all([
      this.engagementStore.getUser(discordUserId),
      this.verificationService.getLinkedProfile(discordUserId)
    ]);
    const stats = linked?.link ? await this.gamePresenceService.getUserStats(linked.link.robloxUserId) : null;
    const communities = linked?.profile?.communities?.length ?? 0;
    const achievements = [];
    if (linked?.link) achievements.push({ id: "verified", name: "Identidade confirmada", badge: "Verificado" });
    if ((stats?.totalSeconds ?? 0) >= 3600) achievements.push({ id: "play-1h", name: "Primeira hora", badge: "Presença I" });
    if ((stats?.totalSeconds ?? 0) >= 10 * 3600) achievements.push({ id: "play-10h", name: "Veterano de presença", badge: "Presença II" });
    if (communities >= 3) achievements.push({ id: "community-3", name: "Integrado", badge: "Comunidades" });
    if (engagement.dailyStreak >= 7) achievements.push({ id: "streak-7", name: "Uma semana", badge: "Constância" });
    if (engagement.level >= 5) achievements.push({ id: "level-5", name: "Ativo no Discord", badge: "Comunidade" });
    return { engagement, linked, stats, achievements };
  }

  async handleProgress(interaction) {
    const sub = interaction.options.getSubcommand();
    const data = await this.computeAchievements(interaction.user.id);
    if (sub === "profile-card") {
      const profile = data.linked?.profile;
      await interaction.reply({ embeds: [this.baseEmbed(`Perfil Voxel • ${interaction.user.username}`)
        .setThumbnail(interaction.user.displayAvatarURL({ size: 512 }))
        .addFields(
          { name: "Nível", value: `${data.engagement.level} • ${data.engagement.xp} XP`, inline: true },
          { name: "Playtime", value: duration(data.stats?.totalSeconds ?? 0), inline: true },
          { name: "Streak", value: `${data.engagement.dailyStreak} dia(s)`, inline: true },
          { name: "Personagem", value: profile?.characterName || "Não verificado", inline: true },
          { name: "EB", value: profile?.military?.isMember ? profile.military.label || `Rank ${profile.military.rank}` : "Civil", inline: true },
          { name: "Conquistas", value: String(data.achievements.length), inline: true }
        )] });
    } else if (sub === "achievements") {
      await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Conquistas", data.achievements.length ? data.achievements.map((item) => `• **${item.name}**`).join("\n") : "Nenhuma conquista desbloqueada ainda.")] });
    } else if (sub === "badges") {
      await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Distintivos", data.achievements.length ? data.achievements.map((item) => `• **${item.badge}**`).join("\n") : "Nenhum distintivo disponível.")] });
    } else if (sub === "missions") {
      const missions = [
        { id: "play-30m", text: "Jogue 30 minutos hoje", done: (data.stats?.todaySeconds ?? 0) >= 1800, reward: 5 },
        { id: "streak-3", text: "Mantenha streak de 3 dias", done: data.engagement.dailyStreak >= 3, reward: 5 },
        { id: "level-3", text: "Alcance nível 3 no Discord", done: data.engagement.level >= 3, reward: 5 }
      ];
      const lines = missions.map((mission) => `${mission.done ? "✅" : "⬜"} \`${mission.id}\` • ${mission.text} • ${mission.reward} Points`);
      await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Missões", lines.join("\n"))] });
    } else if (sub === "claim-mission") {
      const id = interaction.options.getString("missao", true).trim();
      const checks = {
        "play-30m": (data.stats?.todaySeconds ?? 0) >= 1800,
        "streak-3": data.engagement.dailyStreak >= 3,
        "level-3": data.engagement.level >= 3
      };
      if (!(id in checks)) throw new Error("Missão desconhecida.");
      if (!checks[id]) throw new Error("Você ainda não concluiu essa missão.");
      const claimed = await this.engagementStore.claimMission(interaction.user.id, `${new Date().toISOString().slice(0, 10)}:${id}`);
      if (!claimed) throw new Error("Essa missão já foi resgatada hoje.");
      const reward = await this.rewardService.issueManual({ rewardType: "points", amount: 5, discordUserId: interaction.user.id });
      await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Missão resgatada", `Código de **5 Points**: ## \`${reward.code}\``)] });
    }
  }

  async handleGiveaway(interaction) {
    const sub = interaction.options.getSubcommand();
    await this.assertStaff(interaction);
    if (sub === "create") {
      const giveaway = await this.engagementStore.createGiveaway({
        prize: interaction.options.getString("premio", true),
        endsAt: Date.now() + interaction.options.getInteger("minutos", true) * 60_000,
        winnerCount: interaction.options.getInteger("vencedores", true),
        creatorDiscordId: interaction.user.id,
        channelId: interaction.channelId
      });
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${GIVEAWAY_PREFIX}:${giveaway.id}`).setLabel("Participar").setStyle(ButtonStyle.Primary));
      const message = await interaction.reply({ embeds: [this.baseEmbed("Sorteio", `**${giveaway.prize}**\nTermina ${ts(giveaway.endsAt)}\nVencedores: **${giveaway.winnerCount}**`).setFooter({ text: `Voxel • Sorteio ${giveaway.id}` })], components: [row], fetchReply: true });
      await this.engagementStore.updateGiveaway(giveaway.id, { messageId: message.id });
      return;
    }
    const id = interaction.options.getString("id", true).trim();
    const giveaway = await this.engagementStore.getGiveaway(id);
    if (!giveaway) throw new Error("Sorteio não encontrado.");
    const entries = Object.keys(giveaway.entries ?? {});
    if (!entries.length) throw new Error("O sorteio não possui participantes.");
    const winners = shuffle(entries).slice(0, giveaway.winnerCount ?? 1);
    await this.engagementStore.updateGiveaway(id, { winners, endedAt: Date.now() });
    await interaction.reply({ embeds: [this.baseEmbed("Novos vencedores", winners.map((uid) => `• <@${uid}>`).join("\n"))] });
  }

  async handleGiveawayEntry(interaction, id) {
    const ok = await this.engagementStore.enterGiveaway(id, interaction.user.id);
    if (!ok) throw new Error("Este sorteio terminou ou não existe mais.");
    await interaction.reply({ flags: MessageFlags.Ephemeral, content: "Participação registrada." });
  }

  async handleQuiz(interaction) {
    const sub = interaction.options.getSubcommand();
    const rankIndex = Math.floor(Math.random() * RANKS.length);
    const correct = RANKS[rankIndex];
    const options = shuffle([correct, ...shuffle(RANKS.filter((_, index) => index !== rankIndex)).slice(0, 3)]);
    const prompt = sub === "trivia"
      ? `Qual é a posição **${rankIndex + 1}** na sequência de ranks usada pelo EB?`
      : `Qual destes ranks corresponde à posição **${rankIndex + 1}**?`;
    const answer = options.indexOf(correct) + 1;
    await interaction.reply({ embeds: [this.baseEmbed("Quiz do EB", `${prompt}\n\n${options.map((item, index) => `**${index + 1}.** ${item}`).join("\n")}\n\n||Resposta: **${answer}. ${correct}**||`)] });
  }

  async handleSuggest(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "list") {
      const suggestions = await this.engagementStore.listSuggestions(10);
      const lines = suggestions.map((item) => {
        const votes = Object.values(item.votes ?? {});
        const score = votes.reduce((sum, value) => sum + Number(value || 0), 0);
        return `• \`${item.id}\` • ${score >= 0 ? "+" : ""}${score} • ${String(item.text).slice(0, 90)}`;
      });
      await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [this.baseEmbed("Sugestões recentes", lines.join("\n") || "Nenhuma sugestão enviada.")] });
      return;
    }
    const text = interaction.options.getString("texto", true).trim();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const placeholder = await interaction.channel.send({ embeds: [this.baseEmbed("Nova sugestão", text).addFields({ name: "Autor", value: `<@${interaction.user.id}>`, inline: true })], allowedMentions: { parse: [] } });
    const suggestion = await this.engagementStore.createSuggestion({ authorDiscordId: interaction.user.id, text, channelId: interaction.channelId, messageId: placeholder.id });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${SUGGEST_PREFIX}:${suggestion.id}:up`).setLabel("Apoiar").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`${SUGGEST_PREFIX}:${suggestion.id}:down`).setLabel("Discordar").setStyle(ButtonStyle.Secondary)
    );
    await placeholder.edit({ components: [row] });
    await interaction.editReply({ content: `Sugestão registrada com ID \`${suggestion.id}\`.` });
  }

  async handleSuggestionVote(interaction, id, direction) {
    const vote = direction === "up" ? 1 : -1;
    const suggestion = await this.engagementStore.voteSuggestion(id, interaction.user.id, vote);
    if (!suggestion) throw new Error("Sugestão não encontrada.");
    const votes = Object.values(suggestion.votes ?? {});
    const score = votes.reduce((sum, value) => sum + Number(value || 0), 0);
    await interaction.reply({ flags: MessageFlags.Ephemeral, content: `Voto registrado. Pontuação atual: **${score >= 0 ? "+" : ""}${score}**.` });
  }

  async handleFun(interaction) {
    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser("usuario", true);
    if (target.id === interaction.user.id) throw new Error("Escolha outra pessoa.");
    if (sub === "duel") {
      const winner = Math.random() < 0.5 ? interaction.user : target;
      await interaction.reply({ embeds: [this.baseEmbed("Duelo", `${interaction.user} vs ${target}\n\nVencedor: **${winner.username}**`)] });
    } else {
      const ids = [interaction.user.id, target.id].sort().join(":");
      let hash = 0;
      for (const char of ids) hash = (hash * 31 + char.charCodeAt(0)) % 101;
      await interaction.reply({ embeds: [this.baseEmbed("Compatibilidade", `${interaction.user} + ${target}\n\n**${hash}%**`)] });
    }
  }

  async handleServer(interaction) {
    const [verified, online, events] = await Promise.all([
      this.database.countVerified(),
      this.gamePresenceService.listOnlinePlayers(),
      this.engagementStore.listEvents(100)
    ]);
    const guild = interaction.guild;
    await interaction.reply({ embeds: [this.baseEmbed("Estatísticas do servidor")
      .addFields(
        { name: "Membros", value: String(guild.memberCount), inline: true },
        { name: "Verificados", value: String(verified), inline: true },
        { name: "No jogo agora", value: String(online.length), inline: true },
        { name: "Eventos ativos", value: String(events.length), inline: true },
        { name: "Comunidades", value: "Integradas ao perfil Roblox", inline: true },
        { name: "Voxel", value: this.client.isReady() ? "Online" : "Reconectando", inline: true }
      ).setTimestamp()] });
  }
}
