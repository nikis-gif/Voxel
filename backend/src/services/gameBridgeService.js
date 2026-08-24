import { randomUUID } from "node:crypto";

const DEFAULT_TIMEOUT_MS = 15_000;
const CLAIM_TTL_MS = 12_000;

function now() {
  return Date.now();
}

export class GameBridgeService {
  constructor({ persistentStore = null } = {}) {
    this.actions = new Map();
    this.persistentStore = persistentStore;
  }

  request(type, payload, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const id = randomUUID();
    const createdAt = now();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const action = this.actions.get(id);
        if (!action) return;
        this.actions.delete(id);

        const error = new Error("Nenhum servidor ativo do jogo respondeu a tempo. Tente novamente quando houver um servidor disponível.");
        error.code = "GAME_BRIDGE_TIMEOUT";
        reject(error);
      }, timeoutMs);
      timer.unref?.();

      this.actions.set(id, {
        id,
        type,
        payload,
        createdAt,
        claimServerId: null,
        claimExpiresAt: 0,
        timer,
        resolve,
        reject
      });
    });
  }

  async poll(serverId, onlineUserIds = []) {
    if (this.persistentStore) {
      const persistentAction = await this.persistentStore.claimNext(serverId);
      if (persistentAction) return persistentAction;
    }

    const timestamp = now();
    const online = new Set(
      (onlineUserIds ?? [])
        .map((value) => Number(value))
        .filter((value) => Number.isSafeInteger(value) && value > 0)
    );

    for (const action of this.actions.values()) {
      if (timestamp - action.createdAt > DEFAULT_TIMEOUT_MS + CLAIM_TTL_MS) continue;
      if (action.claimServerId && action.claimExpiresAt > timestamp) continue;

      const targetUserId = Number(action.payload?.targetRobloxUserId ?? 0);
      if (targetUserId > 0 && !online.has(targetUserId)) continue;

      action.claimServerId = serverId;
      action.claimExpiresAt = timestamp + CLAIM_TTL_MS;
      return {
        id: action.id,
        type: action.type,
        payload: action.payload
      };
    }

    return null;
  }

  async complete({ serverId, actionId, success, data = null, error = null }) {
    const action = this.actions.get(actionId);
    if (action) {
      if (action.claimServerId !== serverId) return false;

      this.actions.delete(actionId);
      clearTimeout(action.timer);

      if (success) {
        action.resolve(data);
        return true;
      }

      const resultError = new Error(
        typeof error === "string" && error.trim()
          ? error.trim()
          : "O servidor do jogo recusou a ação."
      );
      resultError.code = "GAME_BRIDGE_ACTION_FAILED";
      action.reject(resultError);
      return true;
    }

    if (!this.persistentStore) return false;
    return this.persistentStore.complete({
      serverId,
      actionId,
      success,
      data,
      error
    });
  }
}
