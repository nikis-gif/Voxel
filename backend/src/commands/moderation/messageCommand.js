import {
  ApplicationIntegrationType,
  ChannelType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";

export const MESSAGE_COMMAND_NAME = "message";

export const messageCommand = new SlashCommandBuilder()
  .setName(MESSAGE_COMMAND_NAME)
  .setDescription("Cria e envia um comunicado formatado pelo Voxel.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((option) =>
    option
      .setName("canal")
      .setDescription("Canal que receberá o comunicado.")
      .setRequired(true)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  );
