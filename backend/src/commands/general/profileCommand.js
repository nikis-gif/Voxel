import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder
} from "discord.js";

export const PROFILE_COMMAND_NAME = "profile";

export const profileCommand = new SlashCommandBuilder()
  .setName(PROFILE_COMMAND_NAME)
  .setDescription("Mostra seu perfil vinculado ao Voxel, jogo e comunidades.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild);
