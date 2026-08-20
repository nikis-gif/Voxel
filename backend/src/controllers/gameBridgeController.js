export function createGameBridgeController(gameBridgeService) {
  return Object.freeze({
    poll(req, res) {
      const serverId = typeof req.body?.serverId === "string" ? req.body.serverId.trim() : "";
      if (!serverId || serverId.length > 128) {
        res.status(400).json({ error: "Invalid server id" });
        return;
      }

      res.json({ success: true, data: gameBridgeService.poll(serverId) });
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
