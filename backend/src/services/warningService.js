const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SEVEN_DAYS_MS = 7 * DAY_MS;

function cleanReason(value) {
  const reason = typeof value === "string" ? value.trim() : "";
  return reason || "Não informado";
}

export class WarningService {
  constructor({ database, gameBanService }) {
    this.database = database;
    this.gameBanService = gameBanService;
  }

  register({ discordUserId, moderatorDiscordId, reason }) {
    const result = this.database.addWarning({
      discordUserId,
      moderatorDiscordId,
      reason: cleanReason(reason)
    });

    let escalation = null;
    if (result.count === 3) {
      escalation = { type: "discord-timeout", durationMs: HOUR_MS, label: "1 hora" };
    } else if (result.count === 6) {
      escalation = { type: "discord-timeout", durationMs: DAY_MS, label: "1 dia" };
    } else if (result.count === 12) {
      escalation = { type: "game-ban", durationMs: SEVEN_DAYS_MS, label: "7 dias" };
    }

    return {
      ...result,
      escalation
    };
  }

  applyGameEscalation({ discordUserId, moderatorDiscordId, reason, durationMs }) {
    return this.gameBanService.ban({
      discordUserId,
      moderatorDiscordId,
      reason: `Escalonamento automático por advertências: ${cleanReason(reason)}`,
      durationMs,
      source: "warnings"
    });
  }
}
