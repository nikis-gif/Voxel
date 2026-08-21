import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder
} from "discord.js";

export const UNLOCK_CHAT_COMMAND_NAME = "unlock-chat";

export const unlockChatCommand = new SlashCommandBuilder()
  .setName(UNLOCK_CHAT_COMMAND_NAME)
  .setDescription("Restaura o envio de mensagens no canal atual.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild);
