import {
  ApplicationIntegrationType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";

export const UNBAN_DISCORD_COMMAND_NAME = "unban-discord";

export const unbanDiscordCommand = new SlashCommandBuilder()
  .setName(UNBAN_DISCORD_COMMAND_NAME)
  .setDescription("Remove o banimento de um usuário do Discord pelo ID.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((option) =>
    option
      .setName("usuario_id")
      .setDescription("ID numérico do usuário banido.")
      .setRequired(true)
      .setMinLength(17)
      .setMaxLength(20)
  )
  .addStringOption((option) =>
    option
      .setName("motivo")
      .setDescription("Observação administrativa para a remoção do banimento.")
      .setRequired(false)
      .setMaxLength(300)
  );
