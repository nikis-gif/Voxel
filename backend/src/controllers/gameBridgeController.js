export function createGameBridgeController(gameBridgeService, gamePresenceService = null) {
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
      try {
        action = await gameBridgeService.poll(serverId, onlineUserIds);
      } catch (error) {
        console.error(`[bridge] Queue poll failed for ${serverId}:`, error);
        const bridgeError = new Error("O servidor conectou ao Voxel, mas a fila de comunidades não pôde ser consultada.");
        bridgeError.statusCode = 503;
        throw bridgeError;
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

      const accepted = await gameBridgeService.complete({
        serverId,
        actionId,
        success,
        data: req.body?.data ?? null,
        error: typeof req.body?.error === "string" ? req.body.error : null
      });

      res.json({ success: true, data: { accepted } });
    }
  });
}
