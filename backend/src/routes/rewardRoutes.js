import { Router } from "express";
import { createRewardController } from "../controllers/rewardController.js";
import { createRobloxAuth } from "../middleware/robloxAuth.js";

export function createRewardRouter({ rewardService, robloxApiKey }) {
  const router = Router();
  const auth = createRobloxAuth(robloxApiKey);
  const controller = createRewardController(rewardService);

  router.post("/reserve", auth, controller.reserve);
  router.post("/commit", auth, controller.commit);
  router.post("/release", auth, controller.release);
  return router;
}
