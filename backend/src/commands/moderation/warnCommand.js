import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder
} from "discord.js";

export const WARN_COMMAND_NAME = "advertir";

export const warnCommand = new SlashCommandBuilder()
  .setName(WARN_COMMAND_NAME)
  .setDescription("Registra uma advertência e aplica os escalonamentos definidos pelo EB.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .addUserOption((option) =>
    option
      .setName("usuario")
      .setDescription("Membro que receberá a advertência.")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("motivo")
      .setDescription("Motivo da advertência.")
      .setRequired(true)
      .setMaxLength(300)
  );
