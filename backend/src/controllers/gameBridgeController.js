function safeQueueErrorCode(error) {
  const rawCode = typeof error?.code === "string" ? error.code : "QUEUE_BACKEND_ERROR";
  return rawCode.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "QUEUE_BACKEND_ERROR";
}

export function createGameBridgeController({
  gameBridgeService,
  gamePresenceService = null,
  communityOperationStore = null
}) {
  return Object.freeze({
    async poll(req, res) {
      const serverId = typeof req.body?.serverId === "string" ? req.body.serverId.trim() : "";
      if (!serverId || serverId.length > 128) {
        res.status(400).json({ error: "Invalid server id" });
        return;
      }

      const presence = req.body?.presence && typeof req.body.presence === "object" ? req.body.presence : null;
      const players = Array.isArray(presence?.players) ? presence.players : [];
      const onlineUserIds = Array.isArray(req.body?.onlineUserIds)
        ? req.body.onlineUserIds
        : players.map((player) => player?.userId);
      const placeId = Number(req.body?.placeId ?? 0);
      const bridgeVersion = typeof req.body?.bridgeVersion === "string"
        ? req.body.bridgeVersion.trim().slice(0, 40)
        : "legacy";

      if (gamePresenceService) {
        await gamePresenceService.recordBridgeHeartbeat({
          serverId,
          placeId,
          bridgeVersion,
          onlineUserIds
        }).catch((error) => console.error("[bridge] Failed to record bridge heartbeat:", error));
      }

      if (gamePresenceService && presence) {
        await gamePresenceService.recordHeartbeat({
          serverId,
          placeId,
          maxPlayers: Number(presence.maxPlayers ?? 0),
          players
        }).catch((error) => console.error("[presence] Failed to record game heartbeat:", error));
      }

      let action = null;
      let persistentDelivered = false;
      try {
        if (communityOperationStore) {
          action = await communityOperationStore.claimNext(serverId);
          persistentDelivered = Boolean(action);
        }

        if (!action) {
          action = gameBridgeService.pollTransient(serverId, onlineUserIds);
        }

        if (communityOperationStore) {
          await communityOperationStore.recordBridgePoll({
            serverId,
            placeId,
            bridgeVersion,
            stage: action
              ? (persistentDelivered ? "persistent-delivered" : "transient-delivered")
              : "queue-empty",
            actionId: action?.id ?? null
          });
        }
      } catch (error) {
        console.error(`[bridge] Queue poll failed for ${serverId}:`, error);
        await communityOperationStore?.recordBridgePoll({
          serverId,
          placeId,
          bridgeVersion,
          stage: "queue-error",
          error: error?.message ?? String(error)
        }).catch(() => {});

        res.status(503).json({
          success: false,
          error: `A fila de comunidades está indisponível no backend (${safeQueueErrorCode(error)}).`
        });
        return;
      }

      res.json({ success: true, data: action });
    },

    async result(req, res) {
      const serverId = typeof req.body?.serverId === "string" ? req.body.serverId.trim() : "";
      const actionId = typeof req.body?.actionId === "string" ? req.body.actionId.trim() : "";
      const success = req.body?.success === true;

      if (!serverId || !actionId) {
        res.status(400).json({ error: "Invalid action result" });
        return;
      }

      const resultPayload = {
        serverId,
        actionId,
        success,
        data: req.body?.data ?? null,
        error: typeof req.body?.error === "string" ? req.body.error : null
      };

      let accepted = false;
      if (communityOperationStore) {
        accepted = await communityOperationStore.complete(resultPayload);
      }
      if (!accepted) {
        accepted = gameBridgeService.completeTransient(resultPayload);
      }

      res.json({ success: true, data: { accepted } });
    }
  });
}
