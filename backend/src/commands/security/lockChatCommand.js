import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder
} from "discord.js";

export const LOCK_CHAT_COMMAND_NAME = "lock-chat";

export const lockChatCommand = new SlashCommandBuilder()
  .setName(LOCK_CHAT_COMMAND_NAME)
  .setDescription("Bloqueia o envio de mensagens no canal atual.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild);
