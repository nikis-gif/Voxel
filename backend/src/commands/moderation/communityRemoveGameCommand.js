import {
  ApplicationIntegrationType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";

export const COMMUNITY_REMOVE_GAME_COMMAND_NAME = "community-remove";

export const communityRemoveGameCommand = new SlashCommandBuilder()
  .setName(COMMUNITY_REMOVE_GAME_COMMAND_NAME)
  .setDescription("Remove um Roblox UserId de uma comunidade pelo Voxel.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((option) =>
    option
      .setName("user-id")
      .setDescription("UserId numérico do jogador no Roblox.")
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(20)
  )
  .addStringOption((option) =>
    option
      .setName("comunidade")
      .setDescription("Nome exato da comunidade.")
      .setRequired(true)
      .setMaxLength(80)
  );
