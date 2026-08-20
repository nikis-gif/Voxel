import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder
} from "discord.js";

export const SEARCH_COMMUNITY_COMMAND_NAME = "procurar-comunidade";

export const searchCommunityCommand = new SlashCommandBuilder()
  .setName(SEARCH_COMMUNITY_COMMAND_NAME)
  .setDescription("Consulta uma comunidade do sistema do jogo.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .addStringOption((option) =>
    option
      .setName("nome")
      .setDescription("Nome exato da comunidade.")
      .setRequired(true)
      .setMaxLength(80)
  );
