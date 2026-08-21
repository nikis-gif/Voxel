import {
  ApplicationIntegrationType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";

export const BAN_DISCORD_COMMAND_NAME = "ban-discord";

export const banDiscordCommand = new SlashCommandBuilder()
  .setName(BAN_DISCORD_COMMAND_NAME)
  .setDescription("Bana um usuário do servidor do Discord.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((option) =>
    option
      .setName("usuario")
      .setDescription("Usuário que será banido do servidor.")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("motivo")
      .setDescription("Motivo administrativo do banimento.")
      .setRequired(false)
      .setMaxLength(300)
  );
