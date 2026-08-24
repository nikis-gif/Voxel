import {
  ApplicationIntegrationType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";
import { addCommunityRankChoices } from "../../config/communityRankConfig.js";

export const CHANGE_RANK_GAME_COMMAND_NAME = "change-rank-game";

export const changeRankGameCommand = new SlashCommandBuilder()
  .setName(CHANGE_RANK_GAME_COMMAND_NAME)
  .setDescription("Agenda a alteração de rank de um Roblox UserId na comunidade.")
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
        .setDescription("Novo rank.")
        .setRequired(true)
    )
  );
