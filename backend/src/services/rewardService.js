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

  async issuePoints(discordUserId) {
    await this.database.cleanupRewards();

    const link = await this.database.getByDiscordUserId(discordUserId);
    if (!link) {
      const error = new Error("Use `/verify` antes de solicitar uma recompensa externa.");
      error.code = "REWARD_NOT_VERIFIED";
      throw error;
    }

    const active = await this.database.getActiveRewardForDiscord(discordUserId);
    if (active) return { reward: active, reused: true };

    const lastConsumed = await this.database.getLastConsumedReward(discordUserId, REWARD_TYPE_POINTS);
    if (lastConsumed?.consumedAt) {
      const nextAt = lastConsumed.consumedAt + DAILY_COOLDOWN_MS;
      if (nextAt > Date.now()) {
        const error = new Error(`Sua próxima recompensa de pontos estará disponível <t:${Math.floor(nextAt / 1000)}:R>.`);
        error.code = "REWARD_DAILY_COOLDOWN";
        throw error;
      }
    }

    let code = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = generateCode();
      if (!await this.database.getRewardByCode(candidate)) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      const error = new Error("Não foi possível gerar um código de recompensa agora. Tente novamente.");
      error.code = "REWARD_CODE_UNAVAILABLE";
      throw error;
    }

    const reward = await this.database.createRewardCode({
      code,
      discordUserId,
      robloxUserId: link.robloxUserId,
      rewardType: REWARD_TYPE_POINTS,
      amount: POINTS_AMOUNT,
      expiresAt: Date.now() + CODE_TTL_MS
    });

    return { reward, reused: false };
  }

  async reserve({ code, robloxUserId }) {
    const normalizedCode = String(code ?? "").trim().toUpperCase();
    if (!/^PNT-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(normalizedCode)) {
      const error = new Error("Código de recompensa inválido.");
      error.statusCode = 400;
      throw error;
    }

    const reward = await this.database.getRewardByCode(normalizedCode);
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
    const reserved = await this.database.reserveRewardCode({
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

  async commit({ code, reservationToken }) {
    const reward = await this.database.commitRewardCode({
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

  async release({ code, reservationToken }) {
    await this.database.releaseRewardCode({
      code: String(code ?? "").trim().toUpperCase(),
      reservationToken: String(reservationToken ?? "")
    });
  }
}
