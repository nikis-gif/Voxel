import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder
} from "discord.js";

export const GENERATE_REWARD_COMMAND_NAME = "generate-reward";

export const generateRewardCommand = new SlashCommandBuilder()
  .setName(GENERATE_REWARD_COMMAND_NAME)
  .setDescription("Gera um código manual de recompensa do Voxel.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .addStringOption((option) =>
    option
      .setName("tipo")
      .setDescription("Tipo da recompensa.")
      .setRequired(true)
      .addChoices(
        { name: "Points", value: "points" },
        { name: "Dinheiro", value: "money" }
      )
  )
  .addIntegerOption((option) =>
    option
      .setName("quantidade")
      .setDescription("Quantidade que será entregue ao resgatar o código.")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(1_000_000)
  )
  .addUserOption((option) =>
    option
      .setName("usuario")
      .setDescription("Opcional: vincula o código à conta Roblox verificada deste usuário.")
      .setRequired(false)
  );
