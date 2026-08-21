import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder
} from "discord.js";

export const GROUPS_COMMAND_NAME = "groups";

export const groupsCommand = new SlashCommandBuilder()
  .setName(GROUPS_COMMAND_NAME)
  .setDescription("Mostre as comunidades do jogo vinculadas ao seu perfil atual.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild);
