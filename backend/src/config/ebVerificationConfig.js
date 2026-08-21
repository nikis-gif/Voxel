export const EB_VERIFICATION_CONFIG = Object.freeze({
  color: 0x3366ff,
  codeLength: 8,
  codeTtlSeconds: 600,
  codeGenerationCooldownSeconds: 15,
  verifyAttemptWindowSeconds: 60,
  verifyAttemptLimit: 6,

  rankGroups: Object.freeze([
    Object.freeze({ min: 1, max: 2, roleKey: "pracas" }),
    Object.freeze({ min: 3, max: 7, roleKey: "graduados" }),
    Object.freeze({ min: 8, max: 13, roleKey: "oficiais" }),
    Object.freeze({ min: 14, max: 17, roleKey: "superiores" }),
    Object.freeze({ min: 18, max: 19, roleKey: "comandantes" })
  ]),

  roles: Object.freeze({
    civil: Object.freeze({
      names: Object.freeze(["Civil"])
    }),
    verificado: Object.freeze({
      names: Object.freeze(["Verificado"])
    }),
    pracas: Object.freeze({
      names: Object.freeze(["Praças |EB|", "Pracas |EB|"])
    }),
    graduados: Object.freeze({
      names: Object.freeze(["Graduados |EB|"])
    }),
    oficiais: Object.freeze({
      names: Object.freeze(["Oficiais |EB|"])
    }),
    superiores: Object.freeze({
      names: Object.freeze(["Superiores |EB|"])
    }),
    comandantes: Object.freeze({
      names: Object.freeze(["Comandantes |EB|"])
    }),
    divisionBAC: Object.freeze({
      names: Object.freeze([
        "Batalhão de Ações de Comandos",
        "Batalhao de Acoes de Comandos",
        "Batalhão de Ações |EB|",
        "[A] BAC"
      ])
    }),
    divisionBFEsp: Object.freeze({
      names: Object.freeze([
        "Batalhão de Forças Especiais",
        "Batalhao de Forcas Especiais",
        "Batalhão de Forças |EB|",
        "[B] BFEsp"
      ])
    }),
    divisionBPE: Object.freeze({
      names: Object.freeze([
        "Batalhão de Polícia do Exército",
        "Batalhao de Policia do Exercito",
        "Batalhão de Polícia |EB|",
        "[E] BPE"
      ])
    }),
    divisionCIGS: Object.freeze({
      names: Object.freeze([
        "Centro de Instrução de Guerra na Selva",
        "Centro de Instrucao de Guerra na Selva",
        "Centro de Instrução |EB|",
        "[G] CIGS"
      ])
    }),
    divisionCIE: Object.freeze({
      names: Object.freeze([
        "Centro de Inteligência do Exército",
        "Centro de Inteligencia do Exercito",
        "Centro de Inteligência |EB|",
        "[C] CIE"
      ])
    })
  }),

  divisions: Object.freeze({
    BAC: "divisionBAC",
    BFEsp: "divisionBFEsp",
    BPE: "divisionBPE",
    CIGS: "divisionCIGS",
    CIE: "divisionCIE"
  })
});

export function getRankRoleKey(rank) {
  for (const group of EB_VERIFICATION_CONFIG.rankGroups) {
    if (rank >= group.min && rank <= group.max) return group.roleKey;
  }
  return null;
}
