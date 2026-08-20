const DEFAULT_REASON = "Não informado";

function parseRobloxUserId(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,20}$/.test(raw)) return null;

  const userId = Number(raw);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

function cleanReason(value) {
  const reason = typeof value === "string" ? value.trim() : "";
  return reason || DEFAULT_REASON;
}

export class GameBanService {
  constructor(database) {
    this.database = database;
  }

  async resolveTarget({ discordUserId = null, robloxUserId = null }) {
    if (discordUserId && robloxUserId) {
      const error = new Error("Informe apenas um alvo: usuário do Discord ou Roblox User ID.");
      error.code = "MULTIPLE_GAME_BAN_TARGETS";
      throw error;
    }

    if (discordUserId) {
      const link = await this.database.getByDiscordUserId(discordUserId);
      if (!link) {
        const existingBan = await this.database.getGameBanByDiscordUserId(discordUserId);
        if (existingBan) {
          return {
            robloxUserId: existingBan.robloxUserId,
            robloxUsername: existingBan.robloxUsername,
            discordUserId
          };
        }

        const error = new Error("Esse usuário ainda não possui uma conta do Roblox vinculada ao Voxel.");
        error.code = "GAME_TARGET_NOT_VERIFIED";
        throw error;
      }

      return {
        robloxUserId: link.robloxUserId,
        robloxUsername: link.robloxUsername,
        discordUserId
      };
    }

    const parsedUserId = parseRobloxUserId(robloxUserId);
    if (parsedUserId) {
      const link = await this.database.getByRobloxUserId(parsedUserId);
      return {
        robloxUserId: parsedUserId,
        robloxUsername: link?.robloxUsername ?? `Roblox ${parsedUserId}`,
        discordUserId: link?.discordUserId ?? null
      };
    }

    const error = new Error("Informe um usuário do Discord vinculado ou um Roblox User ID válido.");
    error.code = "GAME_TARGET_REQUIRED";
    throw error;
  }

  async ban({
    discordUserId = null,
    robloxUserId = null,
    moderatorDiscordId,
    reason,
    durationMs = null,
    source = "manual"
  }) {
    const target = await this.resolveTarget({ discordUserId, robloxUserId });
    const existing = await this.database.getGameBan(target.robloxUserId);

    if (existing && existing.expiresAt == null && durationMs != null) {
      return existing;
    }

    const expiresAt = durationMs == null ? null : Date.now() + Math.max(1, durationMs);
    const ban = await this.database.setGameBan({
      ...target,
      moderatorDiscordId,
      reason: cleanReason(reason),
      expiresAt,
      source
    });

    console.log(
      `[game-ban] Roblox ${ban.robloxUserId} banned by Discord ${moderatorDiscordId}${expiresAt ? ` until ${new Date(expiresAt).toISOString()}` : " permanently"}.`
    );

    return ban;
  }

  async unban({ discordUserId = null, robloxUserId = null, moderatorDiscordId }) {
    let target;

    if (discordUserId && !robloxUserId) {
      const existingBan = await this.database.getGameBanByDiscordUserId(discordUserId);
      target = existingBan
        ? { robloxUserId: existingBan.robloxUserId }
        : await this.resolveTarget({ discordUserId });
    } else {
      target = await this.resolveTarget({ discordUserId, robloxUserId });
    }

    const removed = await this.database.removeGameBan(target.robloxUserId);
    if (!removed) {
      const error = new Error("Essa conta não possui um banimento ativo no jogo.");
      error.code = "GAME_BAN_NOT_FOUND";
      throw error;
    }

    console.log(
      `[game-ban] Roblox ${removed.robloxUserId} unbanned by Discord ${moderatorDiscordId}.`
    );

    return removed;
  }

  async getStatus(robloxUserId) {
    const parsedUserId = parseRobloxUserId(robloxUserId);
    if (!parsedUserId) {
      const error = new Error("Invalid Roblox user id");
      error.statusCode = 400;
      throw error;
    }

    const ban = await this.database.getGameBan(parsedUserId);
    return { banned: Boolean(ban), ban };
  }

  async list(page, pageSize = 6) {
    const count = await this.database.countGameBans();
    const totalPages = Math.max(1, Math.ceil(count / pageSize));
    const safePage = Math.min(Math.max(0, page), totalPages - 1);

    return {
      items: await this.database.listGameBans({ limit: pageSize, offset: safePage * pageSize }),
      count,
      page: safePage,
      totalPages
    };
  }
}
