import {
  ApplicationIntegrationType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";

export const CLEAR_COMMAND_NAME = "clear";

export const clearCommand = new SlashCommandBuilder()
  .setName(CLEAR_COMMAND_NAME)
  .setDescription("Remova uma quantidade de mensagens recentes deste canal.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addIntegerOption((option) =>
    option
      .setName("quantidade")
      .setDescription("Quantidade de mensagens a remover, entre 1 e 100.")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(100)
  );
