export const VOXEL_OWNER_IDS = Object.freeze([
  "1134320234388525086"
]);

export const VOXEL_SECURITY_CONFIG = Object.freeze({
  antiRaid: Object.freeze({
    joinWindowMs: 15_000,
    joinThreshold: 8,
    raidModeMs: 10 * 60_000,
    newcomerTimeoutMs: 10 * 60_000
  }),
  antiNuke: Object.freeze({
    actionWindowMs: 20_000,
    scoreThreshold: 6,
    quarantineTimeoutMs: 24 * 60 * 60_000,
    incidentCooldownMs: 10 * 60_000
  })
});
