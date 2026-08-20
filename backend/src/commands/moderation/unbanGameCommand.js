import {
  ApplicationIntegrationType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";

export const UNBAN_GAME_COMMAND_NAME = "unban-game";

export const unbanGameCommand = new SlashCommandBuilder()
  .setName(UNBAN_GAME_COMMAND_NAME)
  .setDescription("Remove um banimento aplicado ao jogo.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((option) =>
    option
      .setName("usuario")
      .setDescription("Conta do Discord associada ao banimento.")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("roblox_id")
      .setDescription("Roblox User ID que será desbanido.")
      .setRequired(false)
      .setMaxLength(20)
  )
  .addStringOption((option) =>
    option
      .setName("motivo")
      .setDescription("Observação administrativa para o desbanimento.")
      .setRequired(false)
      .setMaxLength(300)
  );
