import {
  ApplicationIntegrationType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";

export const CHANGE_RANK_GAME_COMMAND_NAME = "change-rank-game";

const RANKS = Object.freeze([
  ["[REC] Recruta", "1"],
  ["[SLD] Soldado", "2"],
  ["[CB] Cabo", "3"],
  ["[T-SGT] Terceiro-Sargento", "4"],
  ["[S-SGT] Segundo-Sargento", "5"],
  ["[P-SGT] Primeiro-Sargento", "6"],
  ["[S-BTN] Sub-Tenente", "7"],
  ["[AAO] Aspirante-A-Oficial", "8"],
  ["[S-TN] Segundo-Tenente", "9"],
  ["[P-TN] Primeiro-Tenente", "10"],
  ["[CAP] Capitão", "11"],
  ["[MAJ] Major", "12"],
  ["[TEN-C] Tenente-Coronel", "13"],
  ["[COR] Coronel", "14"],
  ["[GEN-B] General-De-Brigada", "15"],
  ["[GEN-D] General-De-Divisão", "16"],
  ["[GEN-E] General-De-Exército", "17"],
  ["[S-COM] Sub-Comandante", "18"],
  ["[COM] Comandante", "19"]
]);

export const changeRankGameCommand = new SlashCommandBuilder()
  .setName(CHANGE_RANK_GAME_COMMAND_NAME)
  .setDescription("Altera o rank de um jogador em uma comunidade do jogo.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((option) =>
    option
      .setName("usuario")
      .setDescription("Usuário verificado que terá o rank alterado.")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("comunidade")
      .setDescription("Nome exato da comunidade.")
      .setRequired(true)
      .setMaxLength(80)
  )
  .addStringOption((option) => {
    option
      .setName("rank")
      .setDescription("Novo rank.")
      .setRequired(true);

    for (const [name, value] of RANKS) {
      option.addChoices({ name, value });
    }

    return option;
  });
