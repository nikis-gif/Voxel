import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder
} from "discord.js";

export const UNVERIFY_COMMAND_NAME = "unverify";

export const unverifyCommand = new SlashCommandBuilder()
  .setName(UNVERIFY_COMMAND_NAME)
  .setDescription("Desconecte sua conta do Roblox e retorne ao estado Civil.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild);
