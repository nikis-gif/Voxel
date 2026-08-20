import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder
} from "discord.js";

export const REWARDS_COMMAND_NAME = "rewards";

export const rewardsCommand = new SlashCommandBuilder()
  .setName(REWARDS_COMMAND_NAME)
  .setDescription("Abre as recompensas externas disponíveis para sua conta.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild);
