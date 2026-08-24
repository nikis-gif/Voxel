export const COMMUNITY_RANK_CHOICES = Object.freeze([
  Object.freeze({ name: "[REC] Recruta", value: "1" }),
  Object.freeze({ name: "[SLD] Soldado", value: "2" }),
  Object.freeze({ name: "[CB] Cabo", value: "3" }),
  Object.freeze({ name: "[T-SGT] Terceiro-Sargento", value: "4" }),
  Object.freeze({ name: "[S-SGT] Segundo-Sargento", value: "5" }),
  Object.freeze({ name: "[P-SGT] Primeiro-Sargento", value: "6" }),
  Object.freeze({ name: "[S-BTN] Sub-Tenente", value: "7" }),
  Object.freeze({ name: "[AAO] Aspirante-A-Oficial", value: "8" }),
  Object.freeze({ name: "[S-TN] Segundo-Tenente", value: "9" }),
  Object.freeze({ name: "[P-TN] Primeiro-Tenente", value: "10" }),
  Object.freeze({ name: "[CAP] Capitão", value: "11" }),
  Object.freeze({ name: "[MAJ] Major", value: "12" }),
  Object.freeze({ name: "[TEN-C] Tenente-Coronel", value: "13" }),
  Object.freeze({ name: "[COR] Coronel", value: "14" }),
  Object.freeze({ name: "[GEN-B] General-De-Brigada", value: "15" }),
  Object.freeze({ name: "[GEN-D] General-De-Divisão", value: "16" }),
  Object.freeze({ name: "[GEN-E] General-De-Exército", value: "17" }),
  Object.freeze({ name: "[S-COM] Sub-Comandante", value: "18" }),
  Object.freeze({ name: "[COM] Comandante", value: "19" })
]);

export function addCommunityRankChoices(option) {
  for (const choice of COMMUNITY_RANK_CHOICES) {
    option.addChoices(choice);
  }
  return option;
}
