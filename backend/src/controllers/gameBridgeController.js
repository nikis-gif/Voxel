export function createGameBridgeController(gameBridgeService, gamePresenceService = null, recruitmentService = null) {
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

      let action = gameBridgeService.poll(serverId, onlineUserIds);
      if (!action && recruitmentService) {
        action = await recruitmentService.claimPendingForOnline(serverId, onlineUserIds);
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

      const payload = {
        serverId,
        actionId,
        success,
        data: req.body?.data ?? null,
        error: typeof req.body?.error === "string" ? req.body.error : null
      };

      if (recruitmentService) {
        const recruitmentAccepted = await recruitmentService.completeBridgeAction(payload);
        if (recruitmentAccepted) {
          res.json({ success: true, data: { accepted: true } });
          return;
        }
      }

      const accepted = gameBridgeService.complete(payload);
      res.json({ success: true, data: { accepted } });
    }
  });
}
