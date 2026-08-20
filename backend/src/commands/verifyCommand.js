import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder
} from "discord.js";

export const VERIFY_COMMAND_NAME = "verify";

export const verifyCommand = new SlashCommandBuilder()
  .setName(VERIFY_COMMAND_NAME)
  .setDescription("Verifique sua conta do Roblox e sincronize seus cargos do EB.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .addStringOption((option) =>
    option
      .setName("codigo")
      .setDescription("Código temporário gerado dentro do jogo.")
      .setRequired(true)
      .setMinLength(8)
      .setMaxLength(16)
  );
