import {
  ApplicationIntegrationType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";

export const BAN_GAME_COMMAND_NAME = "ban-game";

export const banGameCommand = new SlashCommandBuilder()
  .setName(BAN_GAME_COMMAND_NAME)
  .setDescription("Bana uma conta vinculada do jogo ou um Roblox User ID.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((option) =>
    option
      .setName("usuario")
      .setDescription("Conta do Discord vinculada ao Roblox.")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("roblox_id")
      .setDescription("Roblox User ID, caso a conta não esteja vinculada ao Discord.")
      .setRequired(false)
      .setMaxLength(20)
  )
  .addStringOption((option) =>
    option
      .setName("motivo")
      .setDescription("Motivo administrativo do banimento no jogo.")
      .setRequired(false)
      .setMaxLength(300)
  );
