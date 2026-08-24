import {
  ApplicationIntegrationType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";
import { addCommunityRankChoices } from "../../config/communityRankConfig.js";

export const COMMUNITY_ADD_GAME_COMMAND_NAME = "community-add";

export const communityAddGameCommand = new SlashCommandBuilder()
  .setName(COMMUNITY_ADD_GAME_COMMAND_NAME)
  .setDescription("Adiciona um Roblox UserId a uma comunidade pelo Voxel.")
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
  )
  .addStringOption((option) =>
    addCommunityRankChoices(
      option
        .setName("rank")
        .setDescription("Rank inicial do jogador.")
        .setRequired(true)
    )
  );
