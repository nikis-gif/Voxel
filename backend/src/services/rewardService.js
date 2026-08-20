import { randomBytes, randomUUID } from "node:crypto";

const REWARD_TYPE_POINTS = "points";
const POINTS_AMOUNT = 5;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 30 * 60 * 1000;
const RESERVATION_TTL_MS = 60 * 1000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function tokenPart(length) {
  const bytes = randomBytes(length);
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += ALPHABET[bytes[index] % ALPHABET.length];
  }
  return output;
}

function generateCode() {
  return `PNT-${tokenPart(4)}-${tokenPart(4)}`;
}

export class RewardService {
  constructor(database) {
    this.database = database;
  }

  issuePoints(discordUserId) {
    const link = this.database.getByDiscordUserId(discordUserId);
    if (!link) {
      const error = new Error("Use `/verify` antes de solicitar uma recompensa externa.");
      error.code = "REWARD_NOT_VERIFIED";
      throw error;
    }

    const active = this.database.getActiveRewardForDiscord(discordUserId);
    if (active) return { reward: active, reused: true };

    const lastConsumed = this.database.getLastConsumedReward(discordUserId, REWARD_TYPE_POINTS);
    if (lastConsumed?.consumedAt) {
      const nextAt = lastConsumed.consumedAt + DAILY_COOLDOWN_MS;
      if (nextAt > Date.now()) {
        const error = new Error(`Sua próxima recompensa de pontos estará disponível <t:${Math.floor(nextAt / 1000)}:R>.`);
        error.code = "REWARD_DAILY_COOLDOWN";
        throw error;
      }
    }

    let code;
    do {
      code = generateCode();
    } while (this.database.getRewardByCode(code));

    const reward = this.database.createRewardCode({
      code,
      discordUserId,
      robloxUserId: link.robloxUserId,
      rewardType: REWARD_TYPE_POINTS,
      amount: POINTS_AMOUNT,
      expiresAt: Date.now() + CODE_TTL_MS
    });

    return { reward, reused: false };
  }

  reserve({ code, robloxUserId }) {
    const normalizedCode = String(code ?? "").trim().toUpperCase();
    if (!/^PNT-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(normalizedCode)) {
      const error = new Error("Código de recompensa inválido.");
      error.statusCode = 400;
      throw error;
    }

    const reward = this.database.getRewardByCode(normalizedCode);
    if (!reward || reward.consumedAt || reward.expiresAt <= Date.now()) {
      const error = new Error("Este código de recompensa expirou ou já foi utilizado.");
      error.statusCode = 404;
      throw error;
    }

    if (reward.robloxUserId !== Number(robloxUserId)) {
      const error = new Error("Este código pertence a outra conta do Roblox.");
      error.statusCode = 403;
      throw error;
    }

    const reservationToken = randomUUID();
    const reserved = this.database.reserveRewardCode({
      code: normalizedCode,
      robloxUserId: Number(robloxUserId),
      reservationToken,
      reservationTtlMs: RESERVATION_TTL_MS
    });

    if (!reserved) {
      const error = new Error("Este código já está sendo processado. Aguarde alguns segundos e tente novamente.");
      error.statusCode = 409;
      throw error;
    }

    return {
      code: reserved.code,
      reservationToken,
      rewardType: reserved.rewardType,
      amount: reserved.amount
    };
  }

  commit({ code, reservationToken }) {
    const reward = this.database.commitRewardCode({
      code: String(code ?? "").trim().toUpperCase(),
      reservationToken: String(reservationToken ?? "")
    });

    if (!reward) {
      const error = new Error("A confirmação desta recompensa não é mais válida.");
      error.statusCode = 409;
      throw error;
    }

    return reward;
  }

  release({ code, reservationToken }) {
    this.database.releaseRewardCode({
      code: String(code ?? "").trim().toUpperCase(),
      reservationToken: String(reservationToken ?? "")
    });
  }
}
