const ROOT_PATH = "voxel/v1";

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function normalizeLink(value) {
  if (!value || typeof value !== "object") return null;
  return {
    robloxUserId: Number(value.robloxUserId),
    discordUserId: String(value.discordUserId),
    guildId: String(value.guildId),
    robloxUsername: String(value.robloxUsername),
    linkedAt: Number(value.linkedAt),
    updatedAt: Number(value.updatedAt)
  };
}

function normalizeGameBan(value) {
  if (!value || typeof value !== "object") return null;
  return {
    robloxUserId: Number(value.robloxUserId),
    robloxUsername: String(value.robloxUsername),
    discordUserId: value.discordUserId ? String(value.discordUserId) : null,
    moderatorDiscordId: String(value.moderatorDiscordId),
    reason: String(value.reason),
    bannedAt: Number(value.bannedAt),
    updatedAt: Number(value.updatedAt),
    expiresAt: value.expiresAt == null ? null : Number(value.expiresAt),
    source: value.source ? String(value.source) : "manual"
  };
}

function normalizeWarning(id, value) {
  if (!value || typeof value !== "object") return null;
  return {
    id: String(id),
    discordUserId: String(value.discordUserId),
    moderatorDiscordId: String(value.moderatorDiscordId),
    reason: String(value.reason),
    createdAt: Number(value.createdAt)
  };
}

function normalizeTicket(value) {
  if (!value || typeof value !== "object") return null;
  return {
    discordUserId: String(value.discordUserId),
    channelId: value.channelId ? String(value.channelId) : null,
    openedAt: Number(value.openedAt),
    closedAt: value.closedAt == null ? null : Number(value.closedAt),
    updatedAt: Number(value.updatedAt)
  };
}

function normalizeReward(value) {
  if (!value || typeof value !== "object") return null;

  const robloxUserId = Number(value.robloxUserId);
  return {
    code: String(value.code),
    discordUserId: value.discordUserId ? String(value.discordUserId) : null,
    robloxUserId: Number.isSafeInteger(robloxUserId) && robloxUserId > 0 ? robloxUserId : null,
    rewardType: String(value.rewardType),
    amount: Number(value.amount),
    source: value.source ? String(value.source) : "legacy",
    createdAt: Number(value.createdAt),
    expiresAt: Number(value.expiresAt),
    reservationToken: value.reservationToken ? String(value.reservationToken) : null,
    reservedAt: value.reservedAt == null ? null : Number(value.reservedAt),
    consumedAt: value.consumedAt == null ? null : Number(value.consumedAt)
  };
}

function objectValues(value) {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value);
}

export class VerificationDatabase {
  constructor(database) {
    this.database = database;
    this.root = database.ref(ROOT_PATH);
    this.linksRef = this.root.child("verification/links");
    this.profilesRef = this.root.child("verification/profiles");
    this.gameBansRef = this.root.child("moderation/gameBans");
    this.warningsRef = this.root.child("moderation/warnings");
    this.ticketsRef = this.root.child("tickets");
    this.rewardsRef = this.root.child("rewards");
    this.rewardReservationsRef = this.rewardsRef.child("reservations");
    this.channelLocksRef = this.root.child("moderation/channelLocks");
    this.securityRef = this.root.child("security");
  }

  async init() {
    await this.root.child("_meta").update({
      schemaVersion: 3,
      storage: "firebase-realtime-database",
      lastBackendBootAt: Date.now()
    });
  }

  async assertLinkAvailable(robloxUserId, discordUserId) {
    const [existingRoblox, existingDiscord] = await Promise.all([
      this.getByRobloxUserId(robloxUserId),
      this.getByDiscordUserId(discordUserId)
    ]);

    if (existingRoblox && existingRoblox.discordUserId !== discordUserId) {
      const error = new Error("Esta conta do Roblox já está vinculada a outra conta do Discord.");
      error.code = "ROBLOX_ALREADY_LINKED";
      throw error;
    }

    if (existingDiscord && existingDiscord.robloxUserId !== Number(robloxUserId)) {
      const error = new Error("Esta conta do Discord já está vinculada a outra conta do Roblox.");
      error.code = "DISCORD_ALREADY_LINKED";
      throw error;
    }
  }

  async link({ robloxUserId, discordUserId, guildId, robloxUsername }) {
    const numericRobloxId = Number(robloxUserId);
    const discordId = String(discordUserId);
    const now = Date.now();

    await this.linksRef.transaction((current) => {
      const links = current && typeof current === "object" ? current : {};
      links.byRoblox ??= {};
      links.byDiscord ??= {};

      const existingRoblox = links.byRoblox[String(numericRobloxId)] ?? null;
      const existingDiscord = links.byDiscord[discordId] ?? null;

      if (existingRoblox && String(existingRoblox.discordUserId) !== discordId) {
        const error = new Error("Esta conta do Roblox já está vinculada a outra conta do Discord.");
        error.code = "ROBLOX_ALREADY_LINKED";
        throw error;
      }

      if (existingDiscord && Number(existingDiscord.robloxUserId) !== numericRobloxId) {
        const error = new Error("Esta conta do Discord já está vinculada a outra conta do Roblox.");
        error.code = "DISCORD_ALREADY_LINKED";
        throw error;
      }

      const linkedAt = Number(existingRoblox?.linkedAt ?? existingDiscord?.linkedAt ?? now);
      const record = {
        robloxUserId: numericRobloxId,
        discordUserId: discordId,
        guildId: String(guildId),
        robloxUsername: String(robloxUsername),
        linkedAt,
        updatedAt: now
      };

      links.byRoblox[String(numericRobloxId)] = record;
      links.byDiscord[discordId] = record;
      return links;
    });

    return this.getByDiscordUserId(discordId);
  }

  async unlinkByDiscordUserId(discordUserId) {
    const discordId = String(discordUserId);
    let removed = null;

    await this.linksRef.transaction((current) => {
      if (!current?.byDiscord?.[discordId]) return current;

      const links = current;
      removed = clone(links.byDiscord[discordId]);
      delete links.byDiscord[discordId];
      if (removed?.robloxUserId != null) {
        delete links.byRoblox?.[String(removed.robloxUserId)];
      }
      return links;
    });

    if (!removed) return null;
    await this.profilesRef.child(String(removed.robloxUserId)).remove();
    return normalizeLink(removed);
  }

  async getByRobloxUserId(robloxUserId) {
    const snapshot = await this.linksRef.child(`byRoblox/${Number(robloxUserId)}`).get();
    return normalizeLink(snapshot.val());
  }

  async getByDiscordUserId(discordUserId) {
    const snapshot = await this.linksRef.child(`byDiscord/${String(discordUserId)}`).get();
    return normalizeLink(snapshot.val());
  }

  async updateProfile(robloxUserId, robloxUsername) {
    const link = await this.getByRobloxUserId(robloxUserId);
    if (!link) return null;

    const updated = {
      ...link,
      robloxUsername: String(robloxUsername),
      updatedAt: Date.now()
    };

    await this.linksRef.update({
      [`byRoblox/${link.robloxUserId}`]: updated,
      [`byDiscord/${link.discordUserId}`]: updated
    });
    return updated;
  }

  async saveVerificationProfile(profile) {
    const updatedAt = Date.now();
    await this.profilesRef.child(String(profile.userId)).set({
      profile: clone(profile),
      updatedAt
    });
    return { profile: clone(profile), updatedAt };
  }

  async getVerificationProfile(robloxUserId) {
    const snapshot = await this.profilesRef.child(String(robloxUserId)).get();
    const value = snapshot.val();
    if (!value?.profile || typeof value.profile !== "object") return null;
    return { profile: clone(value.profile), updatedAt: Number(value.updatedAt ?? 0) };
  }

  async getVerificationProfileByDiscordUserId(discordUserId) {
    const link = await this.getByDiscordUserId(discordUserId);
    if (!link) return null;
    const cached = await this.getVerificationProfile(link.robloxUserId);
    if (!cached) return { link, profile: null, updatedAt: null };
    return { link, profile: cached.profile, updatedAt: cached.updatedAt };
  }

  async setGameBan({
    robloxUserId,
    robloxUsername,
    discordUserId = null,
    moderatorDiscordId,
    reason,
    expiresAt = null,
    source = "manual"
  }) {
    const userId = Number(robloxUserId);
    const ref = this.gameBansRef.child(`byRoblox/${userId}`);
    let previousDiscordId = null;

    const result = await ref.transaction((current) => {
      previousDiscordId = current?.discordUserId ? String(current.discordUserId) : null;
      const now = Date.now();
      return {
        robloxUserId: userId,
        robloxUsername: String(robloxUsername),
        discordUserId: discordUserId ? String(discordUserId) : null,
        moderatorDiscordId: String(moderatorDiscordId),
        reason: String(reason),
        bannedAt: Number(current?.bannedAt ?? now),
        updatedAt: now,
        expiresAt: expiresAt == null ? null : Number(expiresAt),
        source: String(source || "manual")
      };
    });

    const ban = normalizeGameBan(result.snapshot.val());
    const updates = {};
    if (previousDiscordId && previousDiscordId !== ban?.discordUserId) {
      updates[`byDiscord/${previousDiscordId}`] = null;
    }
    if (ban?.discordUserId) {
      updates[`byDiscord/${ban.discordUserId}`] = ban.robloxUserId;
    }
    if (Object.keys(updates).length > 0) await this.gameBansRef.update(updates);
    return ban;
  }

  async purgeExpiredGameBans(now = Date.now()) {
    const snapshot = await this.gameBansRef.child("byRoblox").get();
    const entries = objectValues(snapshot.val());
    const updates = {};
    let removed = 0;

    for (const [robloxId, raw] of entries) {
      const ban = normalizeGameBan(raw);
      if (!ban?.expiresAt || ban.expiresAt > now) continue;
      updates[`byRoblox/${robloxId}`] = null;
      if (ban.discordUserId) updates[`byDiscord/${ban.discordUserId}`] = null;
      removed += 1;
    }

    if (removed > 0) await this.gameBansRef.update(updates);
    return removed;
  }

  async getGameBan(robloxUserId) {
    const ref = this.gameBansRef.child(`byRoblox/${Number(robloxUserId)}`);
    const snapshot = await ref.get();
    const ban = normalizeGameBan(snapshot.val());
    if (!ban) return null;

    if (ban.expiresAt != null && ban.expiresAt <= Date.now()) {
      const updates = { [`byRoblox/${ban.robloxUserId}`]: null };
      if (ban.discordUserId) updates[`byDiscord/${ban.discordUserId}`] = null;
      await this.gameBansRef.update(updates);
      return null;
    }

    return ban;
  }

  async getGameBanByDiscordUserId(discordUserId) {
    const pointer = await this.gameBansRef.child(`byDiscord/${String(discordUserId)}`).get();
    const robloxUserId = Number(pointer.val());
    if (!Number.isSafeInteger(robloxUserId) || robloxUserId <= 0) return null;
    return this.getGameBan(robloxUserId);
  }

  async removeGameBan(robloxUserId) {
    const existing = await this.getGameBan(robloxUserId);
    if (!existing) return null;
    const updates = { [`byRoblox/${existing.robloxUserId}`]: null };
    if (existing.discordUserId) updates[`byDiscord/${existing.discordUserId}`] = null;
    await this.gameBansRef.update(updates);
    return existing;
  }

  async countGameBans() {
    await this.purgeExpiredGameBans();
    const snapshot = await this.gameBansRef.child("byRoblox").get();
    return snapshot.numChildren();
  }

  async listGameBans({ limit = 6, offset = 0 } = {}) {
    await this.purgeExpiredGameBans();
    const snapshot = await this.gameBansRef.child("byRoblox").get();
    const bans = objectValues(snapshot.val())
      .map(([, value]) => normalizeGameBan(value))
      .filter(Boolean)
      .sort((a, b) => b.bannedAt - a.bannedAt);
    return bans.slice(offset, offset + limit);
  }

  async addWarning({ discordUserId, moderatorDiscordId, reason }) {
    const userRef = this.warningsRef.child(String(discordUserId));
    const warningRef = userRef.push();
    const warning = {
      discordUserId: String(discordUserId),
      moderatorDiscordId: String(moderatorDiscordId),
      reason: String(reason),
      createdAt: Date.now()
    };

    await warningRef.set(warning);
    const snapshot = await userRef.get();
    return {
      warning: normalizeWarning(warningRef.key, warning),
      count: snapshot.numChildren()
    };
  }

  async countWarnings(discordUserId) {
    const snapshot = await this.warningsRef.child(String(discordUserId)).get();
    return snapshot.numChildren();
  }

  async listWarnings(discordUserId, { limit = 10, offset = 0 } = {}) {
    const snapshot = await this.warningsRef.child(String(discordUserId)).get();
    return objectValues(snapshot.val())
      .map(([id, value]) => normalizeWarning(id, value))
      .filter(Boolean)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(offset, offset + limit);
  }

  async getTicket(discordUserId) {
    const snapshot = await this.ticketsRef.child(String(discordUserId)).get();
    return normalizeTicket(snapshot.val());
  }

  async openTicket(discordUserId, channelId) {
    const now = Date.now();
    const ticket = {
      discordUserId: String(discordUserId),
      channelId: String(channelId),
      openedAt: now,
      closedAt: null,
      updatedAt: now
    };
    await this.ticketsRef.child(String(discordUserId)).set(ticket);
    return ticket;
  }

  async closeTicket(discordUserId) {
    const ref = this.ticketsRef.child(String(discordUserId));
    const current = normalizeTicket((await ref.get()).val());
    if (!current) return null;
    const now = Date.now();
    const ticket = { ...current, channelId: null, closedAt: now, updatedAt: now };
    await ref.set(ticket);
    return ticket;
  }

  async cleanupRewards(now = Date.now()) {
    const [codesSnapshot, reservationsSnapshot] = await Promise.all([
      this.rewardsRef.child("codes").get(),
      this.rewardReservationsRef.get()
    ]);
    const updates = {};

    for (const [code, raw] of objectValues(codesSnapshot.val())) {
      const reward = normalizeReward(raw);
      if (!reward || reward.consumedAt || reward.expiresAt > now) continue;
      updates[`codes/${code}`] = null;
      updates[`reservations/${code}`] = null;
      if (reward.discordUserId) updates[`byDiscord/${reward.discordUserId}/${code}`] = null;
    }

    for (const [code, reservation] of objectValues(reservationsSnapshot.val())) {
      if (!reservation || typeof reservation !== "object") {
        updates[`reservations/${code}`] = null;
        continue;
      }

      if (Number(reservation.expiresAt ?? 0) <= now) {
        updates[`reservations/${code}`] = null;
      }
    }

    if (Object.keys(updates).length > 0) await this.rewardsRef.update(updates);
  }

  async getActiveRewardForDiscord(discordUserId, rewardType = null, source = null) {
    const now = Date.now();
    const snapshot = await this.rewardsRef.child(`byDiscord/${String(discordUserId)}`).get();
    const rewards = objectValues(snapshot.val())
      .map(([, value]) => normalizeReward(value))
      .filter((reward) => reward
        && !reward.consumedAt
        && reward.expiresAt > now
        && (!rewardType || reward.rewardType === rewardType)
        && (!source || reward.source === source))
      .sort((a, b) => b.createdAt - a.createdAt);
    return rewards[0] ?? null;
  }

  async getRewardByCode(code) {
    const snapshot = await this.rewardsRef.child(`codes/${String(code)}`).get();
    return normalizeReward(snapshot.val());
  }

  async getLastConsumedReward(discordUserId, rewardType) {
    const snapshot = await this.rewardsRef.child(`byDiscord/${String(discordUserId)}`).get();
    const rewards = objectValues(snapshot.val())
      .map(([, value]) => normalizeReward(value))
      .filter((reward) => reward
        && reward.rewardType === rewardType
        && reward.source === "daily"
        && reward.consumedAt)
      .sort((a, b) => b.consumedAt - a.consumedAt);
    return rewards[0] ?? null;
  }

  async createRewardCode({
    code,
    discordUserId = null,
    robloxUserId = null,
    rewardType,
    amount,
    expiresAt,
    source = "manual"
  }) {
    const numericRobloxId = Number(robloxUserId);
    const reward = {
      code: String(code),
      discordUserId: discordUserId ? String(discordUserId) : null,
      robloxUserId: Number.isSafeInteger(numericRobloxId) && numericRobloxId > 0 ? numericRobloxId : null,
      rewardType: String(rewardType),
      amount: Number(amount),
      source: String(source),
      createdAt: Date.now(),
      expiresAt: Number(expiresAt),
      reservationToken: null,
      reservedAt: null,
      consumedAt: null
    };

    const updates = {
      [`codes/${reward.code}`]: reward
    };
    if (reward.discordUserId) {
      updates[`byDiscord/${reward.discordUserId}/${reward.code}`] = reward;
    }

    await this.rewardsRef.update(updates);
    return reward;
  }

  async syncRewardIndex(reward) {
    if (!reward?.discordUserId) return;
    await this.rewardsRef.child(`byDiscord/${reward.discordUserId}/${reward.code}`).set(reward);
  }

  async getRewardReservation(code) {
    const snapshot = await this.rewardReservationsRef.child(String(code)).get();
    const value = snapshot.val();
    if (!value || typeof value !== "object") return null;

    const robloxUserId = Number(value.robloxUserId);
    return {
      robloxUserId: Number.isSafeInteger(robloxUserId) && robloxUserId > 0 ? robloxUserId : null,
      reservationToken: value.reservationToken ? String(value.reservationToken) : null,
      reservedAt: Number(value.reservedAt ?? 0),
      expiresAt: Number(value.expiresAt ?? 0)
    };
  }

  async reserveRewardCode({ code, robloxUserId, reservationToken, reservationTtlMs }) {
    const normalizedCode = String(code);
    const requesterId = Number(robloxUserId);
    const now = Date.now();
    const leaseExpiresAt = now + Number(reservationTtlMs);
    const ref = this.rewardReservationsRef.child(normalizedCode);

    // The lock lives in its own Firebase node. A null transaction value now means
    // "available" instead of aborting the transaction for a reward record that
    // Firebase has not loaded into the local transaction cache yet.
    const lockResult = await ref.transaction((current) => {
      const existing = current && typeof current === "object" ? current : null;
      const existingUserId = Number(existing?.robloxUserId);
      const existingExpiresAt = Number(existing?.expiresAt ?? 0);
      const active = Boolean(existing?.reservationToken && existingExpiresAt > now);

      if (active && existingUserId !== requesterId) return;

      if (active && existingUserId === requesterId) {
        return {
          robloxUserId: requesterId,
          reservationToken: String(existing.reservationToken),
          reservedAt: now,
          expiresAt: leaseExpiresAt
        };
      }

      return {
        robloxUserId: requesterId,
        reservationToken: String(reservationToken),
        reservedAt: now,
        expiresAt: leaseExpiresAt
      };
    });

    if (!lockResult.committed) return null;

    const reservation = await this.getRewardReservation(normalizedCode);
    const reward = await this.getRewardByCode(normalizedCode);
    const invalidReward = !reward
      || reward.consumedAt
      || reward.expiresAt <= now
      || (reward.robloxUserId && reward.robloxUserId !== requesterId);

    if (!reservation?.reservationToken || invalidReward) {
      if (reservation?.reservationToken) {
        const latest = await this.getRewardReservation(normalizedCode);
        if (latest?.reservationToken === reservation.reservationToken) await ref.remove();
      }
      return null;
    }

    return {
      ...reward,
      reservationToken: reservation.reservationToken,
      reservedAt: reservation.reservedAt
    };
  }

  async commitRewardCode({ code, reservationToken }) {
    const normalizedCode = String(code);
    const expectedToken = String(reservationToken);
    const reservation = await this.getRewardReservation(normalizedCode);
    if (!reservation?.reservationToken || reservation.reservationToken !== expectedToken) return null;

    const reward = await this.getRewardByCode(normalizedCode);
    if (!reward) return null;

    if (reward.consumedAt) {
      const latest = await this.getRewardReservation(normalizedCode);
      if (latest?.reservationToken === expectedToken) {
        await this.rewardReservationsRef.child(normalizedCode).remove();
      }
      return reward;
    }

    const committed = {
      ...reward,
      robloxUserId: reward.robloxUserId ?? reservation.robloxUserId,
      consumedAt: Date.now(),
      reservationToken: null,
      reservedAt: null
    };

    await this.rewardsRef.child(`codes/${normalizedCode}`).set(committed);
    await this.syncRewardIndex(committed);

    const latest = await this.getRewardReservation(normalizedCode);
    if (latest?.reservationToken === expectedToken) {
      await this.rewardReservationsRef.child(normalizedCode).remove();
    }

    return committed;
  }

  async releaseRewardCode({ code, reservationToken }) {
    const normalizedCode = String(code);
    const expectedToken = String(reservationToken);
    const reservation = await this.getRewardReservation(normalizedCode);
    if (!reservation?.reservationToken || reservation.reservationToken !== expectedToken) return false;

    await this.rewardReservationsRef.child(normalizedCode).remove();
    return true;
  }


  async getChannelLock(channelId) {
    const snapshot = await this.channelLocksRef.child(String(channelId)).get();
    const value = snapshot.val();
    return value && typeof value === "object" ? clone(value) : null;
  }

  async setChannelLock(channelId, record) {
    await this.channelLocksRef.child(String(channelId)).set(clone(record));
    return clone(record);
  }

  async removeChannelLock(channelId) {
    const ref = this.channelLocksRef.child(String(channelId));
    const snapshot = await ref.get();
    const value = snapshot.val();
    await ref.remove();
    return value && typeof value === "object" ? clone(value) : null;
  }

  async getSecurityState(key) {
    const snapshot = await this.securityRef.child(`state/${String(key)}`).get();
    return snapshot.val();
  }

  async setSecurityState(key, value) {
    await this.securityRef.child(`state/${String(key)}`).set(value);
  }

  async recordSecurityIncident(incident) {
    const ref = this.securityRef.child("incidents").push();
    const record = {
      ...clone(incident),
      id: ref.key,
      createdAt: Number(incident?.createdAt ?? Date.now())
    };
    await ref.set(record);
    return record;
  }

  async close() {
    // Firebase Admin owns the socket lifecycle; the app is closed by server.js.
  }
}
