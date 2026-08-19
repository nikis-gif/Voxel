import { Router } from "express";

export function createHealthRouter(discordClient) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({
      ok: true,
      discordReady: discordClient.isReady()
    });
  });

  return router;
}
