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
      if (gamePresenceService && presence) {
        await gamePresenceService.recordHeartbeat({
          serverId,
          placeId: Number(req.body?.placeId ?? 0),
          maxPlayers: Number(presence.maxPlayers ?? 0),
          players
        }).catch((error) => console.error("[presence] Failed to record game heartbeat:", error));
      }

      res.json({ success: true, data: gameBridgeService.poll(serverId, onlineUserIds) });
    },

    result(req, res) {
      const serverId = typeof req.body?.serverId === "string" ? req.body.serverId.trim() : "";
      const actionId = typeof req.body?.actionId === "string" ? req.body.actionId.trim() : "";
      const success = req.body?.success === true;

      if (!serverId || !actionId) {
        res.status(400).json({ error: "Invalid action result" });
        return;
      }

      const accepted = gameBridgeService.complete({
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
