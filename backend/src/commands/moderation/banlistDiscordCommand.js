import {
  ApplicationIntegrationType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";

export const BANLIST_DISCORD_COMMAND_NAME = "banlist-discord";

export const banlistDiscordCommand = new SlashCommandBuilder()
  .setName(BANLIST_DISCORD_COMMAND_NAME)
  .setDescription("Mostre a lista paginada de usuários banidos no Discord.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
