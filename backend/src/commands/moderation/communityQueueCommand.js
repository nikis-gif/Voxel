import {
  ApplicationIntegrationType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";

export const COMMUNITY_QUEUE_COMMAND_NAME = "community-queue";

export const communityQueueCommand = new SlashCommandBuilder()
  .setName(COMMUNITY_QUEUE_COMMAND_NAME)
  .setDescription("Gerencia a fila persistente de alterações das comunidades.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("list")
      .setDescription("Lista operações recentes ou pendentes.")
      .addStringOption((option) =>
        option
          .setName("status")
          .setDescription("Filtro de estado.")
          .addChoices(
            { name: "Pendentes", value: "active" },
            { name: "Concluídas", value: "completed" },
            { name: "Falhas", value: "failed" },
            { name: "Canceladas", value: "cancelled" },
            { name: "Todas", value: "all" }
          )
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("servers")
      .setDescription("Mostra os servidores Roblox conectados ao bridge do Voxel.")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("status")
      .setDescription("Mostra os detalhes de uma operação.")
      .addStringOption((option) =>
        option
          .setName("id")
          .setDescription("ID da operação.")
          .setRequired(true)
          .setMaxLength(80)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("cancel")
      .setDescription("Cancela uma operação que ainda não foi concluída.")
      .addStringOption((option) =>
        option
          .setName("id")
          .setDescription("ID da operação.")
          .setRequired(true)
          .setMaxLength(80)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("retry")
      .setDescription("Recoloca uma operação com falha/cancelada na fila.")
      .addStringOption((option) =>
        option
          .setName("id")
          .setDescription("ID da operação.")
          .setRequired(true)
          .setMaxLength(80)
      )
  );
