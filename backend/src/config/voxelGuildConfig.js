export const VOXEL_GUILD_CONFIG = Object.freeze({
  ticketCategoryName: "⟬ 𝐓𝐈𝐂𝐊𝐄𝐓𝐒 𝐕𝐎𝐗𝐄𝐋 ⟭",
  legacyTicketCategoryNames: Object.freeze(["Voxel | Tickets", "Voxel Tickets"]),

  logChannelId: "1540406288847085648",
  trainingReportChannelId: "1540407767569928212",
  recruitmentReportChannelId: "1540407818258219088",
  trainingAnnouncementChannelId: "1540412778332954746",
  examAnnouncementChannelId: "1540412870314037309",

  botOnlyChannelIds: Object.freeze([
    "1540408247406690364",
    "1540408286531158026"
  ]),

  linkAllowedRoleKeys: Object.freeze([
    "oficiais",
    "superiores",
    "comandantes"
  ]),

  linkTimeouts: Object.freeze({
    5: 60 * 60 * 1000,
    10: 5 * 60 * 60 * 1000,
    20: 24 * 60 * 60 * 1000
  }),

  staffReportMinimumRank: 3,
  staffReportSessionTtlMs: 2 * 60 * 60 * 1000,
  staffReportSubmitCooldownMs: 15 * 1000
});
