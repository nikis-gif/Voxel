import { EmbedBuilder, Events, MessageFlags } from "discord.js";
import { EB_VERIFICATION_CONFIG } from "../config/ebVerificationConfig.js";

const ERROR_COLOR = 0xed4245;
const UNKNOWN_MEMBER_CODE = 10007;

function profileDivisionText(profile) {
  if (!profile.division.isMember) return "Nenhuma divisão ativa";
  return profile.division.label || profile.division.key;
}

function nicknameText(roleResult) {
  const nickname = roleResult.nickname;
  if (!nickname?.managed) return "Não alterado";
  if (nickname.skipped === "missing-manage-nicknames") return "Não alterado por falta de permissão";
  if (nickname.skipped === "hierarchy") return "Não alterado pela hierarquia do servidor";
  return nickname.value ? `\`${nickname.value}\`` : "Removido";
}

function buildSuccessEmbed(profile, roleResult, botAvatar) {
  const militaryText = profile.military.isMember
    ? profile.military.label || `Rank ${profile.military.rank}`
    : "Civil";
  const characterName = profile.characterName || "Nome do personagem não disponível";

  return new EmbedBuilder()
    .setColor(EB_VERIFICATION_CONFIG.color)
    .setAuthor({ name: "Voxel • Verificação", iconURL: botAvatar })
    .setTitle("Verificação concluída")
    .setDescription("Sua conta foi vinculada e os dados do servidor foram sincronizados com o perfil atual do jogo.")
    .addFields(
      {
        name: "Personagem",
        value: `**${characterName}**\n\`${profile.username}\``,
        inline: true
      },
      {
        name: "Posto ou graduação",
        value: militaryText,
        inline: true
      },
      {
        name: "Apelido no servidor",
        value: nicknameText(roleResult),
        inline: false
      },
      {
        name: "Divisão",
        value: profileDivisionText(profile),
        inline: false
      },
      {
        name: "Cargos ativos",
        value: roleResult.active.length > 0
          ? roleResult.active.map((name) => `• ${name}`).join("\n")
          : "Nenhum cargo gerenciado foi aplicado.",
        inline: false
      }
    )
    .setFooter({ text: "Voxel • Sistema de verificação" })
    .setTimestamp();
}

function buildErrorEmbed(title, description, botAvatar) {
  return new EmbedBuilder()
    .setColor(ERROR_COLOR)
    .setAuthor({ name: "Voxel • Verificação", iconURL: botAvatar })
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "Voxel • Sistema de verificação" });
}

export class DiscordVerificationService {
  constructor({ client, guildId, codeStore, roleSyncService, database }) {
    this.client = client;
    this.guildId = guildId;
    this.codeStore = codeStore;
    this.roleSyncService = roleSyncService;
    this.database = database;
    this.initialized = false;
    this.attempts = new Map();
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    this.client.on(Events.GuildMemberAdd, (member) => {
      if (member.guild.id !== this.guildId) return;
      this.roleSyncService.assignCivil(member).catch((error) => {
        console.error(`[verification] Failed to assign Civil to ${member.user.id}:`, error);
      });
    });
  }

  checkAttemptLimit(userId) {
    const now = Date.now();
    const windowMs = EB_VERIFICATION_CONFIG.verifyAttemptWindowSeconds * 1000;
    const current = this.attempts.get(userId);

    if (!current || now - current.startedAt >= windowMs) {
      this.attempts.set(userId, { startedAt: now, count: 1 });
      return true;
    }

    if (current.count >= EB_VERIFICATION_CONFIG.verifyAttemptLimit) return false;
    current.count += 1;
    return true;
  }

  getLinkedProfile(discordUserId) {
    return this.database.getVerificationProfileByDiscordUserId(discordUserId);
  }

  async unverify(member) {
    const link = this.database.getByDiscordUserId(member.id);
    if (!link) {
      return {
        unlinked: false,
        link: null,
        roleResult: await this.roleSyncService.resetToCivil(member)
      };
    }

    const roleResult = await this.roleSyncService.resetToCivil(member);
    this.database.unlinkByDiscordUserId(member.id);

    console.log(
      `[verification] Discord ${member.id} unlinked from Roblox ${link.robloxUserId} (${link.robloxUsername}).`
    );

    return {
      unlinked: true,
      link,
      roleResult
    };
  }

  async syncRobloxProfile(profile) {
    const link = this.database.getByRobloxUserId(profile.userId);
    if (!link || link.guildId !== this.guildId) {
      return { linked: false, synced: false };
    }

    this.database.saveVerificationProfile(profile);

    if (!this.client.isReady()) {
      const error = new Error("O Discord ainda está conectando. Tente novamente em alguns segundos.");
      error.statusCode = 503;
      throw error;
    }

    const guild = await this.client.guilds.fetch(this.guildId);
    let member;
    try {
      member = await guild.members.fetch(link.discordUserId);
    } catch (error) {
      if (error?.code === UNKNOWN_MEMBER_CODE) {
        return { linked: true, synced: false, reason: "member-not-found" };
      }
      throw error;
    }

    const roleResult = await this.roleSyncService.sync(member, profile);
    this.database.updateProfile(profile.userId, profile.username);

    console.log(
      `[verification] Auto-synced Discord ${link.discordUserId} from Roblox ${profile.userId} (${profile.username}).`
    );

    return {
      linked: true,
      synced: true,
      roles: roleResult.active,
      nickname: roleResult.nickname
    };
  }

  async handleVerify(interaction) {
    const botAvatar = this.client.user?.displayAvatarURL({ size: 128 }) ?? undefined;

    if (interaction.guildId !== this.guildId || !interaction.guild) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [buildErrorEmbed("Servidor inválido", "Este comando está disponível apenas no servidor oficial configurado para o EB.", botAvatar)]
      });
      return;
    }

    if (!this.checkAttemptLimit(interaction.user.id)) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [buildErrorEmbed("Muitas tentativas", "Aguarde um minuto antes de tentar outro código.", botAvatar)]
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const code = interaction.options.getString("codigo", true);
    const claim = this.codeStore.claim(code);
    if (!claim) {
      await interaction.editReply({
        embeds: [buildErrorEmbed(
          "Código inválido ou expirado",
          "Gere um novo código em **Configurações > Discord** dentro do jogo e tente novamente.",
          botAvatar
        )]
      });
      return;
    }

    try {
      this.database.assertLinkAvailable(claim.profile.userId, interaction.user.id);

      const member = await interaction.guild.members.fetch(interaction.user.id);
      const roleResult = await this.roleSyncService.sync(member, claim.profile);

      this.database.link({
        robloxUserId: claim.profile.userId,
        discordUserId: interaction.user.id,
        guildId: this.guildId,
        robloxUsername: claim.profile.username
      });
      this.database.saveVerificationProfile(claim.profile);
      this.codeStore.commit(claim);

      await interaction.editReply({
        embeds: [buildSuccessEmbed(claim.profile, roleResult, botAvatar)]
      });

      console.log(
        `[verification] Discord ${interaction.user.id} linked to Roblox ${claim.profile.userId} (${claim.profile.username}).`
      );
    } catch (error) {
      this.codeStore.release(claim);
      console.error(`[verification] Failed to sync roles for ${interaction.user.id}:`, error);

      const isLinkConflict = error?.code === "ROBLOX_ALREADY_LINKED"
        || error?.code === "DISCORD_ALREADY_LINKED";
      const title = isLinkConflict
        ? "Conta já vinculada"
        : "Não foi possível sincronizar os cargos";
      const description = isLinkConflict
        ? error.message
        : "O código continua válido. Verifique a configuração dos cargos e a hierarquia do Voxel antes de tentar novamente.";

      await interaction.editReply({
        embeds: [buildErrorEmbed(title, description, botAvatar)]
      });
    }
  }
}
