import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder
} from "discord.js";

export const TICKET_COMMAND_NAME = "ticket";

export const ticketCommand = new SlashCommandBuilder()
  .setName(TICKET_COMMAND_NAME)
  .setDescription("Abre um atendimento privado com a equipe do EB.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild);
