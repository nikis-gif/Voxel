import { Router } from "express";
import { createGameAccessController } from "../controllers/gameAccessController.js";
import { createRobloxAuth } from "../middleware/robloxAuth.js";

export function createGameAccessRouter({ gameBanService, robloxApiKey }) {
  const router = Router();
  const controller = createGameAccessController(gameBanService);
  const auth = createRobloxAuth(robloxApiKey);

  router.post("/check", auth, controller.check);
  return router;
}
