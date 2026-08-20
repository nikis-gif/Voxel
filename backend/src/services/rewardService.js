import { randomBytes, randomUUID } from "node:crypto";

const REWARD_TYPES = Object.freeze({
  points: Object.freeze({ prefix: "PNT", amount: 5, label: "Points" }),
  money: Object.freeze({ prefix: "MNY", amount: 100, label: "Dinheiro" })
});
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MIN_GUILD_PRESENCE_MS = 60 * 60 * 1000;
const CODE_TTL_MS = 30 * 60 * 1000;
const MANUAL_CODE_TTL_MS = 24 * 60 * 60 * 1000;
const RESERVATION_TTL_MS = 30 * 1000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function tokenPart(length) {
  const bytes = randomBytes(length);
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += ALPHABET[bytes[index] % ALPHABET.length];
  }
  return output;
}

function generateCode(prefix) {
  return `${prefix}-${tokenPart(4)}-${tokenPart(4)}`;
}

function readRewardType(value) {
  const key = String(value ?? "").trim().toLowerCase();
  return REWARD_TYPES[key] ? key : null;
}

export class RewardService {
  constructor(database) {
    this.database = database;
  }

  async issueDaily({ discordUserId, rewardType, memberJoinedAt }) {
    const type = readRewardType(rewardType);
    if (!type) throw new Error("Tipo de recompensa inválido.");

    await this.database.cleanupRewards();

    const link = await this.database.getByDiscordUserId(discordUserId);
    if (!link) {
      const error = new Error("Use `/verify` antes de solicitar uma recompensa externa.");
      error.code = "REWARD_NOT_VERIFIED";
      throw error;
    }

    const joinedAt = Number(memberJoinedAt ?? 0);
    if (!Number.isFinite(joinedAt) || joinedAt <= 0 || Date.now() - joinedAt < MIN_GUILD_PRESENCE_MS) {
      const eligibleAt = joinedAt > 0 ? joinedAt + MIN_GUILD_PRESENCE_MS : Date.now() + MIN_GUILD_PRESENCE_MS;
      const error = new Error(`Você precisa permanecer no servidor por pelo menos **1 hora**. Tente novamente <t:${Math.floor(eligibleAt / 1000)}:R>.`);
      error.code = "REWARD_GUILD_PRESENCE";
      throw error;
    }

    const active = await this.database.getActiveRewardForDiscord(discordUserId, type, "daily");
    if (active) return { reward: active, reused: true };

    const lastConsumed = await this.database.getLastConsumedReward(discordUserId, type);
    if (lastConsumed?.consumedAt) {
      const nextAt = lastConsumed.consumedAt + DAILY_COOLDOWN_MS;
      if (nextAt > Date.now()) {
        const error = new Error(`Sua próxima recompensa de **${REWARD_TYPES[type].label}** estará disponível <t:${Math.floor(nextAt / 1000)}:R>.`);
        error.code = "REWARD_DAILY_COOLDOWN";
        throw error;
      }
    }

    const reward = await this.createUniqueReward({
      prefix: REWARD_TYPES[type].prefix,
      discordUserId,
      robloxUserId: link.robloxUserId,
      rewardType: type,
      amount: REWARD_TYPES[type].amount,
      expiresAt: Date.now() + CODE_TTL_MS,
      source: "daily"
    });

    return { reward, reused: false };
  }

  async issueManual({ rewardType, amount, discordUserId = null }) {
    const type = readRewardType(rewardType);
    const numericAmount = Number(amount);
    if (!type || !Number.isSafeInteger(numericAmount) || numericAmount < 1 || numericAmount > 1_000_000) {
      throw new Error("Tipo ou quantidade de recompensa inválida.");
    }

    let robloxUserId = null;
    if (discordUserId) {
      const link = await this.database.getByDiscordUserId(discordUserId);
      if (!link) {
        const error = new Error("O usuário selecionado precisa estar verificado para receber um código vinculado.");
        error.code = "REWARD_TARGET_NOT_VERIFIED";
        throw error;
      }
      robloxUserId = link.robloxUserId;
    }

    return this.createUniqueReward({
      prefix: REWARD_TYPES[type].prefix,
      discordUserId,
      robloxUserId,
      rewardType: type,
      amount: numericAmount,
      expiresAt: Date.now() + MANUAL_CODE_TTL_MS,
      source: "owner-manual"
    });
  }

  async createUniqueReward({ prefix, ...data }) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = generateCode(prefix);
      if (await this.database.getRewardByCode(code)) continue;
      return this.database.createRewardCode({ code, ...data });
    }

    const error = new Error("Não foi possível gerar um código de recompensa agora. Tente novamente.");
    error.code = "REWARD_CODE_UNAVAILABLE";
    throw error;
  }

  async reserve({ code, robloxUserId }) {
    const normalizedCode = String(code ?? "").trim().toUpperCase();
    if (!/^(?:PNT|MNY)-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(normalizedCode)) {
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

    if (reward.robloxUserId && reward.robloxUserId !== Number(robloxUserId)) {
      const error = new Error("Este código pertence a outra conta do Roblox.");
      error.statusCode = 403;
      throw error;
    }

    const requestedToken = randomUUID();
    const reserved = await this.database.reserveRewardCode({
      code: normalizedCode,
      robloxUserId: Number(robloxUserId),
      reservationToken: requestedToken,
      reservationTtlMs: RESERVATION_TTL_MS
    });

    if (!reserved?.reservationToken) {
      const current = await this.database.getRewardByCode(normalizedCode);
      console.warn(
        `[reward] Reservation denied for ${normalizedCode}: requester=${robloxUserId}, `
        + `owner=${current?.robloxUserId ?? "none"}, reservedAt=${current?.reservedAt ?? "none"}.`
      );

      const error = new Error("Este código está reservado por outra conta. Aguarde alguns segundos e tente novamente.");
      error.statusCode = 409;
      throw error;
    }

    const reused = reserved.reservationToken !== requestedToken;
    console.info(`[reward] ${reused ? "Resumed" : "Reserved"} ${normalizedCode} for Roblox ${robloxUserId}.`);

    return {
      code: reserved.code,
      reservationToken: reserved.reservationToken,
      rewardType: reserved.rewardType,
      amount: reserved.amount,
      resumed: reused
    };
  }

  async commit({ code, reservationToken }) {
    const normalizedCode = String(code ?? "").trim().toUpperCase();
    const reward = await this.database.commitRewardCode({
      code: normalizedCode,
      reservationToken: String(reservationToken ?? "")
    });

    if (!reward) {
      const error = new Error("A confirmação desta recompensa não é mais válida.");
      error.statusCode = 409;
      throw error;
    }

    console.info(`[reward] Committed ${normalizedCode} for Roblox ${reward.robloxUserId ?? "unknown"}.`);
    return reward;
  }

  async release({ code, reservationToken }) {
    const normalizedCode = String(code ?? "").trim().toUpperCase();
    const released = await this.database.releaseRewardCode({
      code: normalizedCode,
      reservationToken: String(reservationToken ?? "")
    });
    if (released) console.info(`[reward] Released ${normalizedCode}.`);
  }
}
