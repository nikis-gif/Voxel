const ROOT = "voxel/v1/presence";
const SERVER_STALE_MS = 90_000;
const MAX_DELTA_SECONDS = 30;

function dayKey(timestamp = Date.now()) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function normalizePlayer(player) {
  const userId = Number(player?.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  return {
    userId,
    username: String(player?.username ?? ""),
    characterName: String(player?.characterName ?? ""),
    points: Math.max(0, Math.floor(Number(player?.points ?? 0))),
    money: Math.max(0, Math.floor(Number(player?.money ?? 0))),
    militaryLabel: String(player?.militaryLabel ?? ""),
    militaryRank: Math.max(0, Math.floor(Number(player?.militaryRank ?? 0))),
    divisionKey: String(player?.divisionKey ?? "")
  };
}

export class GamePresenceService {
  constructor(database) {
    this.root = database.ref(ROOT);
  }

  async recordHeartbeat({ serverId, placeId, maxPlayers, players }) {
    const now = Date.now();
    const serverRef = this.root.child(`servers/${String(serverId)}`);
    const previous = (await serverRef.get()).val();
    const previousAt = Number(previous?.lastSeenAt ?? now);
    const deltaSeconds = Math.max(0, Math.min(MAX_DELTA_SECONDS, Math.floor((now - previousAt) / 1000)));
    const normalizedPlayers = Array.isArray(players) ? players.map(normalizePlayer).filter(Boolean).slice(0, 100) : [];

    await serverRef.set({
      serverId: String(serverId),
      placeId: Number(placeId) || 0,
      maxPlayers: Math.max(0, Math.floor(Number(maxPlayers ?? 0))),
      playerCount: normalizedPlayers.length,
      players: Object.fromEntries(normalizedPlayers.map((player) => [String(player.userId), player])),
      lastSeenAt: now
    });

    if (deltaSeconds <= 0) return;
    const key = dayKey(now);

    await Promise.all(normalizedPlayers.map((player) =>
      this.root.child(`users/${player.userId}`).transaction((current) => {
        const value = current && typeof current === "object" ? current : {};
        const daily = value.daily && typeof value.daily === "object" ? value.daily : {};
        daily[key] = Number(daily[key] ?? 0) + deltaSeconds;
        const sessions = Math.max(1, Number(value.sessions ?? 0));
        const serverChanged = value.lastServerId && value.lastServerId !== String(serverId);
        return {
          robloxUserId: player.userId,
          totalSeconds: Number(value.totalSeconds ?? 0) + deltaSeconds,
          sessions: serverChanged ? sessions + 1 : sessions,
          daily,
          lastSeenAt: now,
          lastServerId: String(serverId),
          profile: player
        };
      })
    ));
  }

  async listServers() {
    const now = Date.now();
    const snapshot = await this.root.child("servers").get();
    const entries = Object.values(snapshot.val() ?? {})
      .filter((server) => server && now - Number(server.lastSeenAt ?? 0) <= SERVER_STALE_MS)
      .sort((a, b) => Number(b.playerCount ?? 0) - Number(a.playerCount ?? 0));
    return entries;
  }

  async listOnlinePlayers() {
    const servers = await this.listServers();
    const seen = new Set();
    const players = [];
    for (const server of servers) {
      for (const player of Object.values(server.players ?? {})) {
        const normalized = normalizePlayer(player);
        if (!normalized || seen.has(normalized.userId)) continue;
        seen.add(normalized.userId);
        players.push({ ...normalized, serverId: server.serverId, placeId: server.placeId });
      }
    }
    return players;
  }

  async isOnline(robloxUserId) {
    const id = Number(robloxUserId);
    return (await this.listOnlinePlayers()).some((player) => player.userId === id);
  }

  async getUserStats(robloxUserId) {
    const snapshot = await this.root.child(`users/${Number(robloxUserId)}`).get();
    const value = snapshot.val();
    if (!value || typeof value !== "object") return null;
    const today = dayKey();
    return {
      robloxUserId: Number(value.robloxUserId ?? robloxUserId),
      totalSeconds: Number(value.totalSeconds ?? 0),
      todaySeconds: Number(value.daily?.[today] ?? 0),
      daily: value.daily ?? {},
      sessions: Number(value.sessions ?? 0),
      lastSeenAt: Number(value.lastSeenAt ?? 0),
      profile: value.profile ?? null
    };
  }

  async leaderboard(metric = "total", limit = 10) {
    const snapshot = await this.root.child("users").get();
    const today = dayKey();
    return Object.values(snapshot.val() ?? {})
      .filter((value) => value && typeof value === "object")
      .map((value) => ({
        robloxUserId: Number(value.robloxUserId),
        seconds: metric === "today" ? Number(value.daily?.[today] ?? 0) : Number(value.totalSeconds ?? 0),
        profile: value.profile ?? null
      }))
      .filter((entry) => Number.isSafeInteger(entry.robloxUserId) && entry.robloxUserId > 0)
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, Math.max(1, Math.min(50, limit)));
  }
}
