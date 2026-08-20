import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

function safeJsonParse(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mapLink(row) {
  if (!row) return null;
  return {
    robloxUserId: Number(row.roblox_user_id),
    discordUserId: String(row.discord_user_id),
    guildId: String(row.guild_id),
    robloxUsername: String(row.roblox_username),
    linkedAt: Number(row.linked_at),
    updatedAt: Number(row.updated_at)
  };
}

function mapGameBan(row) {
  if (!row) return null;
  return {
    robloxUserId: Number(row.roblox_user_id),
    robloxUsername: String(row.roblox_username),
    discordUserId: row.discord_user_id ? String(row.discord_user_id) : null,
    moderatorDiscordId: String(row.moderator_discord_id),
    reason: String(row.reason),
    bannedAt: Number(row.banned_at),
    updatedAt: Number(row.updated_at),
    expiresAt: row.expires_at == null ? null : Number(row.expires_at),
    source: row.source ? String(row.source) : "manual"
  };
}

function mapWarning(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    discordUserId: String(row.discord_user_id),
    moderatorDiscordId: String(row.moderator_discord_id),
    reason: String(row.reason),
    createdAt: Number(row.created_at)
  };
}

function mapTicket(row) {
  if (!row) return null;
  return {
    discordUserId: String(row.discord_user_id),
    channelId: row.channel_id ? String(row.channel_id) : null,
    openedAt: Number(row.opened_at),
    closedAt: row.closed_at == null ? null : Number(row.closed_at),
    updatedAt: Number(row.updated_at)
  };
}

function mapRewardCode(row) {
  if (!row) return null;
  return {
    code: String(row.code),
    discordUserId: String(row.discord_user_id),
    robloxUserId: Number(row.roblox_user_id),
    rewardType: String(row.reward_type),
    amount: Number(row.amount),
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    reservationToken: row.reservation_token ? String(row.reservation_token) : null,
    reservedAt: row.reserved_at == null ? null : Number(row.reserved_at),
    consumedAt: row.consumed_at == null ? null : Number(row.consumed_at)
  };
}

export class VerificationDatabase {
  constructor(databasePath) {
    this.path = resolve(databasePath);
    mkdirSync(dirname(this.path), { recursive: true });

    this.database = new DatabaseSync(this.path, { timeout: 5_000 });
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS verification_links (
        roblox_user_id INTEGER PRIMARY KEY,
        discord_user_id TEXT NOT NULL UNIQUE,
        guild_id TEXT NOT NULL,
        roblox_username TEXT NOT NULL,
        linked_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS verification_profiles (
        roblox_user_id INTEGER PRIMARY KEY,
        profile_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS game_bans (
        roblox_user_id INTEGER PRIMARY KEY,
        roblox_username TEXT NOT NULL,
        discord_user_id TEXT,
        moderator_discord_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        banned_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER,
        source TEXT NOT NULL DEFAULT 'manual'
      ) STRICT;

      CREATE TABLE IF NOT EXISTS member_warnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_user_id TEXT NOT NULL,
        moderator_discord_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS support_tickets (
        discord_user_id TEXT PRIMARY KEY,
        channel_id TEXT,
        opened_at INTEGER NOT NULL,
        closed_at INTEGER,
        updated_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS reward_codes (
        code TEXT PRIMARY KEY,
        discord_user_id TEXT NOT NULL,
        roblox_user_id INTEGER NOT NULL,
        reward_type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        reservation_token TEXT,
        reserved_at INTEGER,
        consumed_at INTEGER
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_game_bans_discord_user ON game_bans(discord_user_id);
      CREATE INDEX IF NOT EXISTS idx_member_warnings_user ON member_warnings(discord_user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_reward_codes_discord ON reward_codes(discord_user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_reward_codes_roblox ON reward_codes(roblox_user_id, created_at DESC);
    `);

    this.ensureColumn("game_bans", "expires_at", "INTEGER");
    this.ensureColumn("game_bans", "source", "TEXT NOT NULL DEFAULT 'manual'");

    this.prepareStatements();
  }

  ensureColumn(tableName, columnName, definition) {
    const columns = this.database.prepare(`PRAGMA table_info(${tableName})`).all();
    if (columns.some((column) => column.name === columnName)) return;
    this.database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }

  prepareStatements() {
    this.findByRoblox = this.database.prepare(`
      SELECT roblox_user_id, discord_user_id, guild_id, roblox_username, linked_at, updated_at
      FROM verification_links WHERE roblox_user_id = ? LIMIT 1
    `);
    this.findByDiscord = this.database.prepare(`
      SELECT roblox_user_id, discord_user_id, guild_id, roblox_username, linked_at, updated_at
      FROM verification_links WHERE discord_user_id = ? LIMIT 1
    `);
    this.upsertLink = this.database.prepare(`
      INSERT INTO verification_links (roblox_user_id, discord_user_id, guild_id, roblox_username, linked_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(roblox_user_id) DO UPDATE SET
        discord_user_id = excluded.discord_user_id,
        guild_id = excluded.guild_id,
        roblox_username = excluded.roblox_username,
        updated_at = excluded.updated_at
    `);
    this.touchProfile = this.database.prepare(`
      UPDATE verification_links SET roblox_username = ?, updated_at = ? WHERE roblox_user_id = ?
    `);
    this.deleteLinkByDiscord = this.database.prepare(`DELETE FROM verification_links WHERE discord_user_id = ?`);
    this.saveProfileStatement = this.database.prepare(`
      INSERT INTO verification_profiles (roblox_user_id, profile_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(roblox_user_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at
    `);
    this.findProfile = this.database.prepare(`
      SELECT roblox_user_id, profile_json, updated_at FROM verification_profiles WHERE roblox_user_id = ? LIMIT 1
    `);
    this.deleteProfile = this.database.prepare(`DELETE FROM verification_profiles WHERE roblox_user_id = ?`);

    this.upsertGameBanStatement = this.database.prepare(`
      INSERT INTO game_bans (
        roblox_user_id, roblox_username, discord_user_id, moderator_discord_id,
        reason, banned_at, updated_at, expires_at, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(roblox_user_id) DO UPDATE SET
        roblox_username = excluded.roblox_username,
        discord_user_id = excluded.discord_user_id,
        moderator_discord_id = excluded.moderator_discord_id,
        reason = excluded.reason,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at,
        source = excluded.source
    `);
    this.findGameBan = this.database.prepare(`
      SELECT roblox_user_id, roblox_username, discord_user_id, moderator_discord_id, reason,
             banned_at, updated_at, expires_at, source
      FROM game_bans WHERE roblox_user_id = ? LIMIT 1
    `);
    this.findGameBanByDiscord = this.database.prepare(`
      SELECT roblox_user_id, roblox_username, discord_user_id, moderator_discord_id, reason,
             banned_at, updated_at, expires_at, source
      FROM game_bans WHERE discord_user_id = ? LIMIT 1
    `);
    this.deleteGameBan = this.database.prepare(`DELETE FROM game_bans WHERE roblox_user_id = ?`);
    this.deleteExpiredGameBans = this.database.prepare(`DELETE FROM game_bans WHERE expires_at IS NOT NULL AND expires_at <= ?`);
    this.countGameBansStatement = this.database.prepare(`SELECT COUNT(*) AS count FROM game_bans`);
    this.listGameBansStatement = this.database.prepare(`
      SELECT roblox_user_id, roblox_username, discord_user_id, moderator_discord_id, reason,
             banned_at, updated_at, expires_at, source
      FROM game_bans ORDER BY banned_at DESC LIMIT ? OFFSET ?
    `);

    this.insertWarningStatement = this.database.prepare(`
      INSERT INTO member_warnings (discord_user_id, moderator_discord_id, reason, created_at)
      VALUES (?, ?, ?, ?)
    `);
    this.countWarningsStatement = this.database.prepare(`
      SELECT COUNT(*) AS count FROM member_warnings WHERE discord_user_id = ?
    `);
    this.listWarningsStatement = this.database.prepare(`
      SELECT id, discord_user_id, moderator_discord_id, reason, created_at
      FROM member_warnings WHERE discord_user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
    `);

    this.findTicketStatement = this.database.prepare(`
      SELECT discord_user_id, channel_id, opened_at, closed_at, updated_at
      FROM support_tickets WHERE discord_user_id = ? LIMIT 1
    `);
    this.upsertTicketStatement = this.database.prepare(`
      INSERT INTO support_tickets (discord_user_id, channel_id, opened_at, closed_at, updated_at)
      VALUES (?, ?, ?, NULL, ?)
      ON CONFLICT(discord_user_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        opened_at = excluded.opened_at,
        closed_at = NULL,
        updated_at = excluded.updated_at
    `);
    this.closeTicketStatement = this.database.prepare(`
      UPDATE support_tickets SET channel_id = NULL, closed_at = ?, updated_at = ? WHERE discord_user_id = ?
    `);

    this.findActiveRewardForDiscord = this.database.prepare(`
      SELECT * FROM reward_codes
      WHERE discord_user_id = ? AND consumed_at IS NULL AND expires_at > ?
      ORDER BY created_at DESC LIMIT 1
    `);
    this.findRewardByCode = this.database.prepare(`SELECT * FROM reward_codes WHERE code = ? LIMIT 1`);
    this.findLastConsumedReward = this.database.prepare(`
      SELECT * FROM reward_codes
      WHERE discord_user_id = ? AND reward_type = ? AND consumed_at IS NOT NULL
      ORDER BY consumed_at DESC LIMIT 1
    `);
    this.insertRewardCodeStatement = this.database.prepare(`
      INSERT INTO reward_codes (
        code, discord_user_id, roblox_user_id, reward_type, amount, created_at, expires_at,
        reservation_token, reserved_at, consumed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
    `);
    this.reserveRewardStatement = this.database.prepare(`
      UPDATE reward_codes SET reservation_token = ?, reserved_at = ?
      WHERE code = ? AND roblox_user_id = ? AND consumed_at IS NULL AND expires_at > ?
        AND (reservation_token IS NULL OR reserved_at IS NULL OR reserved_at <= ?)
    `);
    this.commitRewardStatement = this.database.prepare(`
      UPDATE reward_codes SET consumed_at = ?, reservation_token = NULL, reserved_at = NULL
      WHERE code = ? AND reservation_token = ? AND consumed_at IS NULL
    `);
    this.releaseRewardStatement = this.database.prepare(`
      UPDATE reward_codes SET reservation_token = NULL, reserved_at = NULL
      WHERE code = ? AND reservation_token = ? AND consumed_at IS NULL
    `);
    this.deleteExpiredRewardCodes = this.database.prepare(`
      DELETE FROM reward_codes WHERE consumed_at IS NULL AND expires_at <= ?
    `);
  }

  assertLinkAvailable(robloxUserId, discordUserId) {
    const existingRoblox = this.getByRobloxUserId(robloxUserId);
    if (existingRoblox && existingRoblox.discordUserId !== discordUserId) {
      const error = new Error("Esta conta do Roblox já está vinculada a outra conta do Discord.");
      error.code = "ROBLOX_ALREADY_LINKED";
      throw error;
    }

    const existingDiscord = this.getByDiscordUserId(discordUserId);
    if (existingDiscord && existingDiscord.robloxUserId !== robloxUserId) {
      const error = new Error("Esta conta do Discord já está vinculada a outra conta do Roblox.");
      error.code = "DISCORD_ALREADY_LINKED";
      throw error;
    }
  }

  link({ robloxUserId, discordUserId, guildId, robloxUsername }) {
    this.assertLinkAvailable(robloxUserId, discordUserId);
    const now = Date.now();
    this.upsertLink.run(robloxUserId, discordUserId, guildId, robloxUsername, now, now);
  }

  unlinkByDiscordUserId(discordUserId) {
    const link = this.getByDiscordUserId(discordUserId);
    if (!link) return null;

    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.deleteLinkByDiscord.run(discordUserId);
      this.deleteProfile.run(link.robloxUserId);
      this.database.exec("COMMIT");
      return link;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getByRobloxUserId(robloxUserId) {
    return mapLink(this.findByRoblox.get(robloxUserId));
  }

  getByDiscordUserId(discordUserId) {
    return mapLink(this.findByDiscord.get(discordUserId));
  }

  updateProfile(robloxUserId, robloxUsername) {
    this.touchProfile.run(robloxUsername, Date.now(), robloxUserId);
  }

  saveVerificationProfile(profile) {
    this.saveProfileStatement.run(profile.userId, JSON.stringify(profile), Date.now());
  }

  getVerificationProfile(robloxUserId) {
    const row = this.findProfile.get(robloxUserId);
    if (!row) return null;
    const profile = safeJsonParse(row.profile_json);
    if (!profile || typeof profile !== "object") return null;
    return { profile, updatedAt: Number(row.updated_at) };
  }

  getVerificationProfileByDiscordUserId(discordUserId) {
    const link = this.getByDiscordUserId(discordUserId);
    if (!link) return null;
    const cached = this.getVerificationProfile(link.robloxUserId);
    if (!cached) return { link, profile: null, updatedAt: null };
    return { link, profile: cached.profile, updatedAt: cached.updatedAt };
  }

  setGameBan({
    robloxUserId,
    robloxUsername,
    discordUserId = null,
    moderatorDiscordId,
    reason,
    expiresAt = null,
    source = "manual"
  }) {
    const now = Date.now();
    const existing = this.getGameBan(robloxUserId);
    this.upsertGameBanStatement.run(
      robloxUserId,
      robloxUsername,
      discordUserId,
      moderatorDiscordId,
      reason,
      existing?.bannedAt ?? now,
      now,
      expiresAt,
      source
    );
    return this.getGameBan(robloxUserId);
  }

  purgeExpiredGameBans(now = Date.now()) {
    return Number(this.deleteExpiredGameBans.run(now).changes ?? 0);
  }

  getGameBan(robloxUserId) {
    this.purgeExpiredGameBans();
    return mapGameBan(this.findGameBan.get(robloxUserId));
  }

  getGameBanByDiscordUserId(discordUserId) {
    this.purgeExpiredGameBans();
    return mapGameBan(this.findGameBanByDiscord.get(discordUserId));
  }

  removeGameBan(robloxUserId) {
    const existing = this.getGameBan(robloxUserId);
    if (!existing) return null;
    this.deleteGameBan.run(robloxUserId);
    return existing;
  }

  countGameBans() {
    this.purgeExpiredGameBans();
    return Number(this.countGameBansStatement.get()?.count ?? 0);
  }

  listGameBans({ limit = 6, offset = 0 } = {}) {
    this.purgeExpiredGameBans();
    return this.listGameBansStatement.all(limit, offset).map(mapGameBan);
  }

  addWarning({ discordUserId, moderatorDiscordId, reason }) {
    const now = Date.now();
    const result = this.insertWarningStatement.run(discordUserId, moderatorDiscordId, reason, now);
    return {
      warning: {
        id: Number(result.lastInsertRowid),
        discordUserId,
        moderatorDiscordId,
        reason,
        createdAt: now
      },
      count: this.countWarnings(discordUserId)
    };
  }

  countWarnings(discordUserId) {
    return Number(this.countWarningsStatement.get(discordUserId)?.count ?? 0);
  }

  listWarnings(discordUserId, { limit = 10, offset = 0 } = {}) {
    return this.listWarningsStatement.all(discordUserId, limit, offset).map(mapWarning);
  }

  getTicket(discordUserId) {
    return mapTicket(this.findTicketStatement.get(discordUserId));
  }

  openTicket(discordUserId, channelId) {
    const now = Date.now();
    this.upsertTicketStatement.run(discordUserId, channelId, now, now);
    return this.getTicket(discordUserId);
  }

  closeTicket(discordUserId) {
    const now = Date.now();
    this.closeTicketStatement.run(now, now, discordUserId);
    return this.getTicket(discordUserId);
  }

  cleanupRewards(now = Date.now()) {
    this.deleteExpiredRewardCodes.run(now);
  }

  getActiveRewardForDiscord(discordUserId) {
    const now = Date.now();
    this.cleanupRewards(now);
    return mapRewardCode(this.findActiveRewardForDiscord.get(discordUserId, now));
  }

  getRewardByCode(code) {
    return mapRewardCode(this.findRewardByCode.get(code));
  }

  getLastConsumedReward(discordUserId, rewardType) {
    return mapRewardCode(this.findLastConsumedReward.get(discordUserId, rewardType));
  }

  createRewardCode({ code, discordUserId, robloxUserId, rewardType, amount, expiresAt }) {
    const now = Date.now();
    this.insertRewardCodeStatement.run(
      code,
      discordUserId,
      robloxUserId,
      rewardType,
      amount,
      now,
      expiresAt
    );
    return this.getRewardByCode(code);
  }

  reserveRewardCode({ code, robloxUserId, reservationToken, reservationTtlMs }) {
    const now = Date.now();
    const staleBefore = now - reservationTtlMs;
    const result = this.reserveRewardStatement.run(
      reservationToken,
      now,
      code,
      robloxUserId,
      now,
      staleBefore
    );
    if (Number(result.changes ?? 0) === 0) return null;
    return this.getRewardByCode(code);
  }

  commitRewardCode({ code, reservationToken }) {
    const now = Date.now();
    const result = this.commitRewardStatement.run(now, code, reservationToken);
    if (Number(result.changes ?? 0) === 0) return null;
    return this.getRewardByCode(code);
  }

  releaseRewardCode({ code, reservationToken }) {
    this.releaseRewardStatement.run(code, reservationToken);
  }

  close() {
    if (this.database.isOpen) this.database.close();
  }
}
