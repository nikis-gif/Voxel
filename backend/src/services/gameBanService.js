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

  resolveTarget({ discordUserId = null, robloxUserId = null }) {
    if (discordUserId && robloxUserId) {
      const error = new Error("Informe apenas um alvo: usuário do Discord ou Roblox User ID.");
      error.code = "MULTIPLE_GAME_BAN_TARGETS";
      throw error;
    }

    if (discordUserId) {
      const link = this.database.getByDiscordUserId(discordUserId);
      if (!link) {
        const existingBan = this.database.getGameBanByDiscordUserId(discordUserId);
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
      const link = this.database.getByRobloxUserId(parsedUserId);
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

  ban({ discordUserId = null, robloxUserId = null, moderatorDiscordId, reason }) {
    const target = this.resolveTarget({ discordUserId, robloxUserId });
    const ban = this.database.setGameBan({
      ...target,
      moderatorDiscordId,
      reason: cleanReason(reason)
    });

    console.log(
      `[game-ban] Roblox ${ban.robloxUserId} banned by Discord ${moderatorDiscordId}.`
    );

    return ban;
  }

  unban({ discordUserId = null, robloxUserId = null, moderatorDiscordId }) {
    let target;

    if (discordUserId && !robloxUserId) {
      const existingBan = this.database.getGameBanByDiscordUserId(discordUserId);
      target = existingBan
        ? { robloxUserId: existingBan.robloxUserId }
        : this.resolveTarget({ discordUserId });
    } else {
      target = this.resolveTarget({ discordUserId, robloxUserId });
    }

    const removed = this.database.removeGameBan(target.robloxUserId);
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

  getStatus(robloxUserId) {
    const parsedUserId = parseRobloxUserId(robloxUserId);
    if (!parsedUserId) {
      const error = new Error("Invalid Roblox user id");
      error.statusCode = 400;
      throw error;
    }

    const ban = this.database.getGameBan(parsedUserId);
    return {
      banned: Boolean(ban),
      ban
    };
  }

  list(page, pageSize = 6) {
    const count = this.database.countGameBans();
    const totalPages = Math.max(1, Math.ceil(count / pageSize));
    const safePage = Math.min(Math.max(0, page), totalPages - 1);

    return {
      items: this.database.listGameBans({
        limit: pageSize,
        offset: safePage * pageSize
      }),
      count,
      page: safePage,
      totalPages
    };
  }
}
