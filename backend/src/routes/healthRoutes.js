import { Router } from "express";

export function createHealthRouter(discordClient) {
  const router = Router();

  router.get("/", (_req, res) => {
    const discordReady = discordClient.isReady();

    res.status(200).json({
      ok: true,
      discordReady,
      status: discordReady ? "ready" : "discord-connecting"
    });
  });

  return router;
}
