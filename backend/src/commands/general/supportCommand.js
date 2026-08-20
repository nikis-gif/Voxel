import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder
} from "discord.js";

export const SUPPORT_COMMAND_NAME = "support";

export const supportCommand = new SlashCommandBuilder()
  .setName(SUPPORT_COMMAND_NAME)
  .setDescription("Abra a Central de Suporte oficial do Voxel.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild);
