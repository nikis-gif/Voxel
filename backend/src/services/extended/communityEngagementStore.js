const ROOT = "voxel/v1/communityExperience";
const MESSAGE_XP = 8;
const MESSAGE_COOLDOWN_MS = 45_000;
const DAILY_COOLDOWN_MS = 24 * 60 * 60_000;
const DAILY_STREAK_RESET_MS = 48 * 60 * 60_000;

function values(value) {
  return value && typeof value === "object" ? Object.entries(value) : [];
}

export function levelFromXp(xp) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, Number(xp) || 0) / 100)) + 1);
}

export class CommunityEngagementStore {
  constructor(database) {
    this.root = database.ref(ROOT);
    this.messageCooldowns = new Map();
  }

  async recordMessage(discordUserId) {
    const id = String(discordUserId);
    const now = Date.now();
    if ((this.messageCooldowns.get(id) ?? 0) > now) return false;
    this.messageCooldowns.set(id, now + MESSAGE_COOLDOWN_MS);

    await this.root.child(`users/${id}`).transaction((current) => {
      const value = current && typeof current === "object" ? current : {};
      return {
        ...value,
        xp: Number(value.xp ?? 0) + MESSAGE_XP,
        messages: Number(value.messages ?? 0) + 1,
        updatedAt: now
      };
    });
    return true;
  }

  async getUser(discordUserId) {
    const snapshot = await this.root.child(`users/${String(discordUserId)}`).get();
    const value = snapshot.val() ?? {};
    const xp = Number(value.xp ?? 0);
    return {
      discordUserId: String(discordUserId),
      xp,
      level: levelFromXp(xp),
      messages: Number(value.messages ?? 0),
      dailyStreak: Number(value.dailyStreak ?? 0),
      lastDailyAt: Number(value.lastDailyAt ?? 0),
      birthday: value.birthday ? String(value.birthday) : null,
      timezone: Number.isInteger(value.timezone) ? Number(value.timezone) : null,
      afk: value.afk && typeof value.afk === "object" ? value.afk : null,
      note: value.note ? String(value.note) : null,
      inventory: value.inventory && typeof value.inventory === "object" ? value.inventory : {},
      claimedMissions: value.claimedMissions && typeof value.claimedMissions === "object" ? value.claimedMissions : {}
    };
  }

  async claimDaily(discordUserId) {
    const id = String(discordUserId);
    const now = Date.now();
    let outcome = null;
    await this.root.child(`users/${id}`).transaction((current) => {
      const value = current && typeof current === "object" ? current : {};
      const lastDailyAt = Number(value.lastDailyAt ?? 0);
      const elapsed = now - lastDailyAt;
      if (lastDailyAt > 0 && elapsed < DAILY_COOLDOWN_MS) {
        outcome = { ok: false, nextAt: lastDailyAt + DAILY_COOLDOWN_MS, streak: Number(value.dailyStreak ?? 0) };
        return;
      }

      const previousStreak = Number(value.dailyStreak ?? 0);
      const streak = lastDailyAt > 0 && elapsed <= DAILY_STREAK_RESET_MS ? previousStreak + 1 : 1;
      outcome = { ok: true, nextAt: now + DAILY_COOLDOWN_MS, streak };
      return {
        ...value,
        dailyStreak: streak,
        lastDailyAt: now,
        xp: Number(value.xp ?? 0) + 25,
        updatedAt: now
      };
    });
    return outcome;
  }

  async leaderboard(limit = 10) {
    const snapshot = await this.root.child("users").get();
    return values(snapshot.val())
      .map(([discordUserId, value]) => ({
        discordUserId,
        xp: Number(value?.xp ?? 0),
        level: levelFromXp(value?.xp ?? 0)
      }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, Math.max(1, Math.min(50, limit)));
  }

  async setUserField(discordUserId, field, value) {
    await this.root.child(`users/${String(discordUserId)}/${String(field)}`).set(value);
  }

  async setAfk(discordUserId, reason) {
    const ref = this.root.child(`users/${String(discordUserId)}/afk`);
    if (!reason) {
      await ref.remove();
      return null;
    }
    const value = { reason: String(reason).slice(0, 200), since: Date.now() };
    await ref.set(value);
    return value;
  }

  async setInventoryItem(discordUserId, itemId, quantity) {
    const ref = this.root.child(`users/${String(discordUserId)}/inventory/${String(itemId)}`);
    if (quantity <= 0) await ref.remove();
    else await ref.set(Math.floor(quantity));
  }

  async addInventoryItem(discordUserId, itemId, amount = 1) {
    const ref = this.root.child(`users/${String(discordUserId)}/inventory/${String(itemId)}`);
    const result = await ref.transaction((current) => Math.max(0, Number(current ?? 0) + Number(amount)));
    return Number(result.snapshot.val() ?? 0);
  }

  async createEvent({ title, description, startsAt, limit, creatorDiscordId }) {
    const ref = this.root.child("events").push();
    const value = {
      id: ref.key,
      title: String(title),
      description: String(description),
      startsAt: Number(startsAt),
      limit: Math.max(0, Math.floor(Number(limit ?? 0))),
      creatorDiscordId: String(creatorDiscordId),
      participants: {},
      createdAt: Date.now()
    };
    await ref.set(value);
    return value;
  }

  async getEvent(id) {
    const snapshot = await this.root.child(`events/${String(id)}`).get();
    return snapshot.val() ?? null;
  }

  async listEvents(limit = 20) {
    const snapshot = await this.root.child("events").get();
    return values(snapshot.val())
      .map(([, value]) => value)
      .filter(Boolean)
      .sort((a, b) => Number(a.startsAt ?? 0) - Number(b.startsAt ?? 0))
      .filter((event) => Number(event.startsAt ?? 0) >= Date.now() - 60 * 60_000)
      .slice(0, limit);
  }

  async setEventParticipant(eventId, discordUserId, joined) {
    const ref = this.root.child(`events/${String(eventId)}/participants/${String(discordUserId)}`);
    if (joined) await ref.set({ joinedAt: Date.now() });
    else await ref.remove();
  }

  async createSuggestion({ authorDiscordId, text, channelId, messageId }) {
    const ref = this.root.child("suggestions").push();
    const value = {
      id: ref.key,
      authorDiscordId: String(authorDiscordId),
      text: String(text),
      channelId: String(channelId),
      messageId: String(messageId),
      votes: {},
      status: "open",
      createdAt: Date.now()
    };
    await ref.set(value);
    return value;
  }

  async listSuggestions(limit = 10) {
    const snapshot = await this.root.child("suggestions").get();
    return values(snapshot.val())
      .map(([, value]) => value)
      .filter(Boolean)
      .sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0))
      .slice(0, limit);
  }

  async voteSuggestion(id, discordUserId, vote) {
    const ref = this.root.child(`suggestions/${String(id)}/votes/${String(discordUserId)}`);
    if (vote === 0) await ref.remove();
    else await ref.set(vote > 0 ? 1 : -1);
    return this.getSuggestion(id);
  }

  async getSuggestion(id) {
    const snapshot = await this.root.child(`suggestions/${String(id)}`).get();
    return snapshot.val() ?? null;
  }

  async createGiveaway({ prize, endsAt, winnerCount, creatorDiscordId, channelId }) {
    const ref = this.root.child("giveaways").push();
    const value = {
      id: ref.key,
      prize: String(prize),
      endsAt: Number(endsAt),
      winnerCount: Math.max(1, Math.floor(Number(winnerCount))),
      creatorDiscordId: String(creatorDiscordId),
      channelId: String(channelId),
      messageId: null,
      entries: {},
      endedAt: null,
      winners: [],
      createdAt: Date.now()
    };
    await ref.set(value);
    return value;
  }

  async updateGiveaway(id, patch) {
    await this.root.child(`giveaways/${String(id)}`).update(patch);
    return this.getGiveaway(id);
  }

  async getGiveaway(id) {
    const snapshot = await this.root.child(`giveaways/${String(id)}`).get();
    return snapshot.val() ?? null;
  }

  async enterGiveaway(id, discordUserId) {
    const giveaway = await this.getGiveaway(id);
    if (!giveaway || giveaway.endedAt || Number(giveaway.endsAt) <= Date.now()) return false;
    await this.root.child(`giveaways/${String(id)}/entries/${String(discordUserId)}`).set({ joinedAt: Date.now() });
    return true;
  }

  async claimMission(discordUserId, missionId) {
    const ref = this.root.child(`users/${String(discordUserId)}/claimedMissions/${String(missionId)}`);
    const result = await ref.transaction((current) => current ? undefined : Date.now());
    return result.committed;
  }
}
