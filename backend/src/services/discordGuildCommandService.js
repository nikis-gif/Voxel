import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  MessageFlags,
  PermissionFlagsBits
} from "discord.js";
import { verifyCommand, VERIFY_COMMAND_NAME } from "../commands/verifyCommand.js";
import { groupsCommand, GROUPS_COMMAND_NAME } from "../commands/general/groupsCommand.js";
import { supportCommand, SUPPORT_COMMAND_NAME } from "../commands/general/supportCommand.js";
import { unverifyCommand, UNVERIFY_COMMAND_NAME } from "../commands/general/unverifyCommand.js";
import { banDiscordCommand, BAN_DISCORD_COMMAND_NAME } from "../commands/moderation/banDiscordCommand.js";
import { banGameCommand, BAN_GAME_COMMAND_NAME } from "../commands/moderation/banGameCommand.js";
import { banlistDiscordCommand, BANLIST_DISCORD_COMMAND_NAME } from "../commands/moderation/banlistDiscordCommand.js";
import { banlistGameCommand, BANLIST_GAME_COMMAND_NAME } from "../commands/moderation/banlistGameCommand.js";
import { clearCommand, CLEAR_COMMAND_NAME } from "../commands/moderation/clearCommand.js";
import { unbanDiscordCommand, UNBAN_DISCORD_COMMAND_NAME } from "../commands/moderation/unbanDiscordCommand.js";
import { unbanGameCommand, UNBAN_GAME_COMMAND_NAME } from "../commands/moderation/unbanGameCommand.js";
import { EB_VERIFICATION_CONFIG } from "../config/ebVerificationConfig.js";

const ERROR_COLOR = 0xed4245;
const SUPPORT_URL = "https://nikis-gif.github.io/Voxel/";
const PAGE_SIZE = 6;
const PAGINATION_PREFIX = "voxel-page";

const COMMAND_BUILDERS = Object.freeze([
  verifyCommand,
  unverifyCommand,
  groupsCommand,
  supportCommand,
  clearCommand,
  banDiscordCommand,
  unbanDiscordCommand,
  banGameCommand,
  unbanGameCommand,
  banlistGameCommand,
  banlistDiscordCommand
]);

function cleanReason(value) {
  const reason = typeof value === "string" ? value.trim() : "";
  return reason || "Não informado";
}

function discordTimestamp(value, style = "R") {
  const seconds = Math.floor(Number(value) / 1000);
  return Number.isFinite(seconds) && seconds > 0 ? `<t:${seconds}:${style}>` : "Não disponível";
}

function botAvatar(client) {
  return client.user?.displayAvatarURL({ size: 128 }) ?? undefined;
}

function baseEmbed(client, title, description = null) {
  const embed = new EmbedBuilder()
    .setColor(EB_VERIFICATION_CONFIG.color)
    .setAuthor({ name: "Voxel", iconURL: botAvatar(client) })
    .setTitle(title)
    .setFooter({ text: "Voxel • Exército Brasileiro" });

  if (description) embed.setDescription(description);
  return embed;
}

function errorEmbed(client, title, description) {
  return new EmbedBuilder()
    .setColor(ERROR_COLOR)
    .setAuthor({ name: "Voxel", iconURL: botAvatar(client) })
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "Voxel • Exército Brasileiro" });
}

function assertAdministrator(interaction) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return;

  const error = new Error("Este comando é restrito aos administradores do servidor.");
  error.code = "ADMIN_REQUIRED";
  throw error;
}

function assertBotPermission(guild, permission, message) {
  const botMember = guild.members.me;
  if (botMember?.permissions.has(permission)) return;

  const error = new Error(message);
  error.code = "BOT_PERMISSION_REQUIRED";
  throw error;
}

function parseSnowflake(value) {
  const text = String(value ?? "").trim();
  return /^\d{17,20}$/.test(text) ? text : null;
}

function paginationRow(kind, page, totalPages, userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PAGINATION_PREFIX}:${kind}:${Math.max(0, page - 1)}:${userId}`)
      .setLabel("Anterior")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`${PAGINATION_PREFIX}:${kind}:${Math.min(totalPages - 1, page + 1)}:${userId}`)
      .setLabel("Próxima")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  );
}

function parsePaginationId(customId) {
  const parts = customId.split(":");
  if (parts.length !== 4 || parts[0] !== PAGINATION_PREFIX) return null;

  const page = Number.parseInt(parts[2], 10);
  if (!Number.isInteger(page) || page < 0) return null;

  return {
    kind: parts[1],
    page,
    userId: parts[3]
  };
}

export class DiscordGuildCommandService {
  constructor({
    client,
    guildId,
    verificationService,
    gameBanService
  }) {
    this.client = client;
    this.guildId = guildId;
    this.verificationService = verificationService;
    this.gameBanService = gameBanService;
    this.initialized = false;
    this.commandsRegistered = false;
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    this.client.on(Events.ClientReady, () => {
      this.registerCommands().catch((error) => {
        console.error("[commands] Failed to register guild commands:", error);
      });
    });

    this.client.on(Events.InteractionCreate, (interaction) => {
      if (interaction.isChatInputCommand()) {
        this.handleCommand(interaction).catch((error) => {
          this.handleInteractionError(interaction, error).catch((replyError) => {
            console.error("[commands] Failed to report command error:", replyError);
          });
        });
        return;
      }

      if (interaction.isButton() && interaction.customId.startsWith(`${PAGINATION_PREFIX}:`)) {
        this.handlePagination(interaction).catch((error) => {
          this.handleInteractionError(interaction, error).catch((replyError) => {
            console.error("[commands] Failed to report pagination error:", replyError);
          });
        });
      }
    });

    if (this.client.isReady()) {
      this.registerCommands().catch((error) => {
        console.error("[commands] Failed to register guild commands:", error);
      });
    }
  }

  async registerCommands() {
    if (this.commandsRegistered || !this.client.isReady()) return;

    const guild = await this.client.guilds.fetch(this.guildId);
    await guild.commands.set(COMMAND_BUILDERS.map((builder) => builder.toJSON()));

    this.commandsRegistered = true;
    console.log(`[commands] Registered ${COMMAND_BUILDERS.length} Voxel command(s) in ${guild.name}.`);
  }

  async handleCommand(interaction) {
    if (interaction.guildId !== this.guildId || !interaction.guild) return;

    switch (interaction.commandName) {
      case VERIFY_COMMAND_NAME:
        await this.verificationService.handleVerify(interaction);
        break;
      case UNVERIFY_COMMAND_NAME:
        await this.handleUnverify(interaction);
        break;
      case GROUPS_COMMAND_NAME:
        await this.handleGroups(interaction);
        break;
      case SUPPORT_COMMAND_NAME:
        await this.handleSupport(interaction);
        break;
      case CLEAR_COMMAND_NAME:
        await this.handleClear(interaction);
        break;
      case BAN_DISCORD_COMMAND_NAME:
        await this.handleBanDiscord(interaction);
        break;
      case UNBAN_DISCORD_COMMAND_NAME:
        await this.handleUnbanDiscord(interaction);
        break;
      case BAN_GAME_COMMAND_NAME:
        await this.handleBanGame(interaction);
        break;
      case UNBAN_GAME_COMMAND_NAME:
        await this.handleUnbanGame(interaction);
        break;
      case BANLIST_GAME_COMMAND_NAME:
        await this.handleBanlistGame(interaction, 0);
        break;
      case BANLIST_DISCORD_COMMAND_NAME:
        await this.handleBanlistDiscord(interaction, 0);
        break;
      default:
        break;
    }
  }

  async handleInteractionError(interaction, error) {
    console.error(`[commands] ${interaction.commandName ?? interaction.customId} failed:`, error);

    const embed = errorEmbed(
      this.client,
      "Não foi possível concluir a ação",
      error?.message || "Ocorreu um erro inesperado. Tente novamente em alguns instantes."
    );

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [embed], components: [] });
      return;
    }

    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      embeds: [embed]
    });
  }

  async handleUnverify(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const result = await this.verificationService.unverify(member);

    const embed = baseEmbed(
      this.client,
      "Conta desconectada",
      result.unlinked
        ? "A vinculação com o Roblox foi removida. Seus cargos gerenciados pelo Voxel foram limpos e o cargo **Civil** foi restaurado."
        : "Sua conta não estava vinculada. O Voxel garantiu que seu estado no servidor permaneça como **Civil**."
    ).setTimestamp();

    if (result.link) {
      embed.addFields({
        name: "Conta desconectada",
        value: `\`${result.link.robloxUsername}\` • Roblox ID \`${result.link.robloxUserId}\``
      });
    }

    await interaction.editReply({ embeds: [embed] });
  }

  async handleGroups(interaction) {
    const cached = this.verificationService.getLinkedProfile(interaction.user.id);
    if (!cached?.link) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [errorEmbed(
          this.client,
          "Conta não verificada",
          "Use `/verify` antes de consultar suas comunidades do jogo."
        )]
      });
      return;
    }

    if (!cached.profile) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [errorEmbed(
          this.client,
          "Perfil aguardando sincronização",
          "Entre no jogo uma vez para o Voxel atualizar suas comunidades e tente novamente."
        )]
      });
      return;
    }

    const communities = Array.isArray(cached.profile.communities)
      ? cached.profile.communities
      : [];
    const visible = communities.slice(0, 20);
    const lines = visible.map((community, index) => {
      const role = community.roleName
        ? ` • ${community.roleName}${Number.isInteger(community.roleRank) ? ` (${community.roleRank})` : ""}`
        : "";
      return `**${index + 1}. ${community.name || "Comunidade"}**${role}`;
    });

    if (communities.length > visible.length) {
      lines.push(`\n+ ${communities.length - visible.length} comunidade(s) não exibida(s).`);
    }

    const embed = baseEmbed(
      this.client,
      "Suas comunidades",
      lines.length > 0
        ? lines.join("\n")
        : "Nenhuma comunidade foi encontrada no seu perfil atual do jogo."
    )
      .addFields(
        {
          name: "Roblox",
          value: `\`${cached.link.robloxUsername}\` • \`${cached.link.robloxUserId}\``,
          inline: true
        },
        {
          name: "Última sincronização",
          value: discordTimestamp(cached.updatedAt),
          inline: true
        }
      )
      .setTimestamp();

    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      embeds: [embed]
    });
  }

  async handleSupport(interaction) {
    const embed = baseEmbed(
      this.client,
      "Central de Suporte",
      "Envie seu problema, contexto e imagens diretamente pela página oficial do Voxel."
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Abrir suporte")
        .setStyle(ButtonStyle.Link)
        .setURL(SUPPORT_URL)
    );

    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      embeds: [embed],
      components: [row]
    });
  }

  async handleClear(interaction) {
    assertAdministrator(interaction);
    assertBotPermission(
      interaction.guild,
      PermissionFlagsBits.ManageMessages,
      "O Voxel precisa da permissão Gerenciar Mensagens para executar este comando."
    );

    const quantity = interaction.options.getInteger("quantidade", true);
    const channel = interaction.channel;
    if (!channel || typeof channel.bulkDelete !== "function") {
      throw new Error("Este comando só pode ser usado em canais que permitem exclusão de mensagens.");
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const deleted = await channel.bulkDelete(quantity, true);

    const embed = baseEmbed(
      this.client,
      "Mensagens removidas",
      `Foram removidas **${deleted.size}** mensagem(ns) recente(s) deste canal.`
    ).setTimestamp();

    if (deleted.size < quantity) {
      embed.addFields({
        name: "Observação",
        value: "Mensagens muito antigas não podem ser removidas em massa pelo Discord."
      });
    }

    await interaction.editReply({ embeds: [embed] });
  }

  async handleBanDiscord(interaction) {
    assertAdministrator(interaction);
    assertBotPermission(
      interaction.guild,
      PermissionFlagsBits.BanMembers,
      "O Voxel precisa da permissão Banir Membros para executar este comando."
    );

    const target = interaction.options.getUser("usuario", true);
    const reason = cleanReason(interaction.options.getString("motivo"));

    if (target.id === interaction.user.id) throw new Error("Você não pode banir a si mesmo por este comando.");
    if (target.id === this.client.user.id) throw new Error("O Voxel não pode banir a própria conta.");
    if (target.id === interaction.guild.ownerId) throw new Error("O proprietário do servidor não pode ser banido.");

    const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (targetMember && !targetMember.bannable) {
      throw new Error("O Voxel não pode banir esse usuário por causa da hierarquia de cargos.");
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.guild.members.ban(target.id, {
      reason: `${reason} | Moderador: ${interaction.user.tag} (${interaction.user.id})`
    });

    console.log(`[moderation] Discord ${target.id} banned by ${interaction.user.id}: ${reason}`);

    await interaction.editReply({
      embeds: [baseEmbed(this.client, "Usuário banido do Discord")
        .addFields(
          { name: "Usuário", value: `${target.username}\n\`${target.id}\``, inline: true },
          { name: "Moderador", value: `${interaction.user.username}\n\`${interaction.user.id}\``, inline: true },
          { name: "Motivo", value: reason, inline: false }
        )
        .setTimestamp()]
    });
  }

  async handleUnbanDiscord(interaction) {
    assertAdministrator(interaction);
    assertBotPermission(
      interaction.guild,
      PermissionFlagsBits.BanMembers,
      "O Voxel precisa da permissão Banir Membros para executar este comando."
    );

    const userId = parseSnowflake(interaction.options.getString("usuario_id", true));
    if (!userId) throw new Error("Informe um ID de usuário do Discord válido.");

    const reason = cleanReason(interaction.options.getString("motivo"));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const user = await interaction.guild.members.unban(
      userId,
      `${reason} | Moderador: ${interaction.user.tag} (${interaction.user.id})`
    );

    console.log(`[moderation] Discord ${userId} unbanned by ${interaction.user.id}: ${reason}`);

    await interaction.editReply({
      embeds: [baseEmbed(this.client, "Banimento removido do Discord")
        .addFields(
          { name: "Usuário", value: `${user.username}\n\`${user.id}\``, inline: true },
          { name: "Moderador", value: `${interaction.user.username}\n\`${interaction.user.id}\``, inline: true },
          { name: "Observação", value: reason, inline: false }
        )
        .setTimestamp()]
    });
  }

  readGameTarget(interaction) {
    const targetUser = interaction.options.getUser("usuario");
    const robloxUserId = interaction.options.getString("roblox_id")?.trim() || null;

    if (targetUser && robloxUserId) {
      throw new Error("Informe somente `usuario` ou `roblox_id`, não os dois ao mesmo tempo.");
    }
    if (!targetUser && !robloxUserId) {
      throw new Error("Informe um usuário do Discord vinculado ou um Roblox User ID.");
    }

    return {
      discordUserId: targetUser?.id ?? null,
      robloxUserId
    };
  }

  async handleBanGame(interaction) {
    assertAdministrator(interaction);
    const target = this.readGameTarget(interaction);
    const reason = cleanReason(interaction.options.getString("motivo"));

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const ban = this.gameBanService.ban({
      ...target,
      moderatorDiscordId: interaction.user.id,
      reason
    });

    await interaction.editReply({
      embeds: [baseEmbed(this.client, "Acesso ao jogo bloqueado")
        .addFields(
          { name: "Roblox", value: `${ban.robloxUsername}\n\`${ban.robloxUserId}\``, inline: true },
          {
            name: "Discord vinculado",
            value: ban.discordUserId ? `\`${ban.discordUserId}\`` : "Nenhum",
            inline: true
          },
          { name: "Motivo", value: ban.reason, inline: false }
        )
        .setDescription("O jogador será impedido de permanecer nos servidores do jogo enquanto o banimento estiver ativo.")
        .setTimestamp()]
    });
  }

  async handleUnbanGame(interaction) {
    assertAdministrator(interaction);
    const target = this.readGameTarget(interaction);
    const reason = cleanReason(interaction.options.getString("motivo"));

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const removed = this.gameBanService.unban({
      ...target,
      moderatorDiscordId: interaction.user.id,
      reason
    });

    await interaction.editReply({
      embeds: [baseEmbed(this.client, "Acesso ao jogo restaurado")
        .addFields(
          { name: "Roblox", value: `${removed.robloxUsername}\n\`${removed.robloxUserId}\``, inline: true },
          { name: "Observação", value: reason, inline: false }
        )
        .setTimestamp()]
    });
  }

  async handleBanlistGame(interaction, page) {
    assertAdministrator(interaction);
    const result = this.gameBanService.list(page, PAGE_SIZE);

    const description = result.items.length > 0
      ? result.items.map((ban, index) => {
        const number = result.page * PAGE_SIZE + index + 1;
        const discord = ban.discordUserId ? ` • Discord \`${ban.discordUserId}\`` : "";
        return `**${number}. ${ban.robloxUsername}**\nRoblox \`${ban.robloxUserId}\`${discord}\nMotivo: ${ban.reason}\nAplicado ${discordTimestamp(ban.bannedAt)}`;
      }).join("\n\n")
      : "Não há banimentos ativos no jogo.";

    const embed = baseEmbed(this.client, "Banimentos do jogo", description)
      .setFooter({
        text: `Voxel • Página ${result.page + 1}/${result.totalPages} • ${result.count} banimento(s)`
      });
    const components = result.count > PAGE_SIZE
      ? [paginationRow("game", result.page, result.totalPages, interaction.user.id)]
      : [];

    if (interaction.isButton()) {
      await interaction.update({ embeds: [embed], components });
    } else {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [embed],
        components
      });
    }
  }

  async fetchDiscordBans(guild) {
    assertBotPermission(
      guild,
      PermissionFlagsBits.BanMembers,
      "O Voxel precisa da permissão Banir Membros para consultar os banimentos do Discord."
    );

    const bans = await guild.bans.fetch({ limit: 1000 });
    return [...bans.values()].sort((left, right) =>
      left.user.username.localeCompare(right.user.username, "pt-BR")
    );
  }

  async handleBanlistDiscord(interaction, page) {
    assertAdministrator(interaction);
    const bans = await this.fetchDiscordBans(interaction.guild);
    const totalPages = Math.max(1, Math.ceil(bans.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(0, page), totalPages - 1);
    const items = bans.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

    const description = items.length > 0
      ? items.map((ban, index) => {
        const number = safePage * PAGE_SIZE + index + 1;
        return `**${number}. ${ban.user.username}**\nDiscord \`${ban.user.id}\`\nMotivo: ${ban.reason || "Não informado"}`;
      }).join("\n\n")
      : "Não há usuários banidos neste servidor.";

    const embed = baseEmbed(this.client, "Banimentos do Discord", description)
      .setFooter({
        text: `Voxel • Página ${safePage + 1}/${totalPages} • ${bans.length} banimento(s)`
      });
    const components = bans.length > PAGE_SIZE
      ? [paginationRow("discord", safePage, totalPages, interaction.user.id)]
      : [];

    if (interaction.isButton()) {
      await interaction.update({ embeds: [embed], components });
    } else {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [embed],
        components
      });
    }
  }

  async handlePagination(interaction) {
    const data = parsePaginationId(interaction.customId);
    if (!data) return;

    if (data.userId !== interaction.user.id) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [errorEmbed(this.client, "Paginação privada", "Somente quem abriu esta lista pode navegar pelas páginas.")]
      });
      return;
    }

    if (interaction.guildId !== this.guildId || !interaction.guild) return;

    if (data.kind === "game") {
      await this.handleBanlistGame(interaction, data.page);
      return;
    }

    if (data.kind === "discord") {
      await this.handleBanlistDiscord(interaction, data.page);
    }
  }
}
