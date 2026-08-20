import { Router } from "express";
import { createGameBridgeController } from "../controllers/gameBridgeController.js";
import { createRobloxAuth } from "../middleware/robloxAuth.js";

export function createGameBridgeRouter({ gameBridgeService, robloxApiKey }) {
  const router = Router();
  const auth = createRobloxAuth(robloxApiKey);
  const controller = createGameBridgeController(gameBridgeService);

  router.post("/poll", auth, controller.poll);
  router.post("/result", auth, controller.result);
  return router;
}
