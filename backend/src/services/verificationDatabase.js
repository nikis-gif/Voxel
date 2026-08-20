import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

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

  getByRobloxUserId(robloxUserId) {
    const row = this.findByRoblox.get(robloxUserId);
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

  getByDiscordUserId(discordUserId) {
    const row = this.findByDiscord.get(discordUserId);
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

  updateProfile(robloxUserId, robloxUsername) {
    this.touchProfile.run(robloxUsername, Date.now(), robloxUserId);
  }

  close() {
    if (this.database.isOpen) this.database.close();
  }
}
