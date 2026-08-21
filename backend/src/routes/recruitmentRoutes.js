import { Router } from "express";
import { createRecruitmentController } from "../controllers/recruitmentController.js";
import { createRobloxAuth } from "../middleware/robloxAuth.js";
import {
  recruitmentActionRateLimiter,
  recruitmentStartRateLimiter
} from "../middleware/rateLimiter.js";

export function createRecruitmentRouter({ recruitmentService, robloxApiKey }) {
  const router = Router();
  const controller = createRecruitmentController(recruitmentService);
  const robloxAuth = createRobloxAuth(robloxApiKey);

  router.post("/start", recruitmentStartRateLimiter, controller.start);
  router.post("/retry", recruitmentActionRateLimiter, controller.retry);
  router.post("/submit", recruitmentActionRateLimiter, controller.submit);
  router.post("/complete", recruitmentActionRateLimiter, controller.complete);
  router.post("/pending", robloxAuth, controller.pending);
  router.post("/confirm-pending", robloxAuth, controller.confirmPending);

  return router;
}
