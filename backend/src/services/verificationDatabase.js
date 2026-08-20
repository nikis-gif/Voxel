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
    updatedAt: Number(row.updated_at)
  };
}

export class VerificationDatabase {
  constructor(databasePath) {
    this.path = resolve(databasePath);
    mkdirSync(dirname(this.path), { recursive: true });

    this.database = new DatabaseSync(this.path, {
      timeout: 5_000
    });

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
        updated_at INTEGER NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_game_bans_discord_user
      ON game_bans(discord_user_id);
    `);

    this.findByRoblox = this.database.prepare(`
      SELECT roblox_user_id, discord_user_id, guild_id, roblox_username, linked_at, updated_at
      FROM verification_links
      WHERE roblox_user_id = ?
      LIMIT 1
    `);

    this.findByDiscord = this.database.prepare(`
      SELECT roblox_user_id, discord_user_id, guild_id, roblox_username, linked_at, updated_at
      FROM verification_links
      WHERE discord_user_id = ?
      LIMIT 1
    `);

    this.upsertLink = this.database.prepare(`
      INSERT INTO verification_links (
        roblox_user_id,
        discord_user_id,
        guild_id,
        roblox_username,
        linked_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(roblox_user_id) DO UPDATE SET
        discord_user_id = excluded.discord_user_id,
        guild_id = excluded.guild_id,
        roblox_username = excluded.roblox_username,
        updated_at = excluded.updated_at
    `);

    this.touchProfile = this.database.prepare(`
      UPDATE verification_links
      SET roblox_username = ?, updated_at = ?
      WHERE roblox_user_id = ?
    `);

    this.deleteLinkByDiscord = this.database.prepare(`
      DELETE FROM verification_links
      WHERE discord_user_id = ?
    `);

    this.saveProfileStatement = this.database.prepare(`
      INSERT INTO verification_profiles (roblox_user_id, profile_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(roblox_user_id) DO UPDATE SET
        profile_json = excluded.profile_json,
        updated_at = excluded.updated_at
    `);

    this.findProfile = this.database.prepare(`
      SELECT roblox_user_id, profile_json, updated_at
      FROM verification_profiles
      WHERE roblox_user_id = ?
      LIMIT 1
    `);

    this.deleteProfile = this.database.prepare(`
      DELETE FROM verification_profiles
      WHERE roblox_user_id = ?
    `);

    this.upsertGameBanStatement = this.database.prepare(`
      INSERT INTO game_bans (
        roblox_user_id,
        roblox_username,
        discord_user_id,
        moderator_discord_id,
        reason,
        banned_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(roblox_user_id) DO UPDATE SET
        roblox_username = excluded.roblox_username,
        discord_user_id = excluded.discord_user_id,
        moderator_discord_id = excluded.moderator_discord_id,
        reason = excluded.reason,
        updated_at = excluded.updated_at
    `);

    this.findGameBan = this.database.prepare(`
      SELECT roblox_user_id, roblox_username, discord_user_id, moderator_discord_id, reason, banned_at, updated_at
      FROM game_bans
      WHERE roblox_user_id = ?
      LIMIT 1
    `);

    this.findGameBanByDiscord = this.database.prepare(`
      SELECT roblox_user_id, roblox_username, discord_user_id, moderator_discord_id, reason, banned_at, updated_at
      FROM game_bans
      WHERE discord_user_id = ?
      LIMIT 1
    `);

    this.deleteGameBan = this.database.prepare(`
      DELETE FROM game_bans
      WHERE roblox_user_id = ?
    `);

    this.countGameBansStatement = this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM game_bans
    `);

    this.listGameBansStatement = this.database.prepare(`
      SELECT roblox_user_id, roblox_username, discord_user_id, moderator_discord_id, reason, banned_at, updated_at
      FROM game_bans
      ORDER BY banned_at DESC
      LIMIT ? OFFSET ?
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
    this.upsertLink.run(
      robloxUserId,
      discordUserId,
      guildId,
      robloxUsername,
      now,
      now
    );
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
    this.saveProfileStatement.run(
      profile.userId,
      JSON.stringify(profile),
      Date.now()
    );
  }

  getVerificationProfile(robloxUserId) {
    const row = this.findProfile.get(robloxUserId);
    if (!row) return null;

    const profile = safeJsonParse(row.profile_json);
    if (!profile || typeof profile !== "object") return null;

    return {
      profile,
      updatedAt: Number(row.updated_at)
    };
  }

  getVerificationProfileByDiscordUserId(discordUserId) {
    const link = this.getByDiscordUserId(discordUserId);
    if (!link) return null;

    const cached = this.getVerificationProfile(link.robloxUserId);
    if (!cached) return { link, profile: null, updatedAt: null };

    return {
      link,
      profile: cached.profile,
      updatedAt: cached.updatedAt
    };
  }

  setGameBan({
    robloxUserId,
    robloxUsername,
    discordUserId = null,
    moderatorDiscordId,
    reason
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
      now
    );

    return this.getGameBan(robloxUserId);
  }

  getGameBan(robloxUserId) {
    return mapGameBan(this.findGameBan.get(robloxUserId));
  }

  getGameBanByDiscordUserId(discordUserId) {
    return mapGameBan(this.findGameBanByDiscord.get(discordUserId));
  }

  removeGameBan(robloxUserId) {
    const existing = this.getGameBan(robloxUserId);
    if (!existing) return null;

    this.deleteGameBan.run(robloxUserId);
    return existing;
  }

  countGameBans() {
    return Number(this.countGameBansStatement.get()?.count ?? 0);
  }

  listGameBans({ limit = 6, offset = 0 } = {}) {
    return this.listGameBansStatement.all(limit, offset).map(mapGameBan);
  }

  close() {
    if (this.database.isOpen) this.database.close();
  }
}
