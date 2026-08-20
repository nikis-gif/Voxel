import {
  ApplicationIntegrationType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";

export const BANLIST_GAME_COMMAND_NAME = "banlist-game";

export const banlistGameCommand = new SlashCommandBuilder()
  .setName(BANLIST_GAME_COMMAND_NAME)
  .setDescription("Mostre a lista paginada de banimentos ativos no jogo.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
