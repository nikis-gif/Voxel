import { Router } from "express";
import { createRecruitmentController } from "../controllers/recruitmentController.js";
import {
  recruitmentActionRateLimiter,
  recruitmentStartRateLimiter
} from "../middleware/rateLimiter.js";

export function createRecruitmentRouter({ recruitmentService }) {
  const router = Router();
  const controller = createRecruitmentController(recruitmentService);

  router.post("/start", recruitmentStartRateLimiter, controller.start);
  router.post("/retry", recruitmentActionRateLimiter, controller.retry);
  router.post("/submit", recruitmentActionRateLimiter, controller.submit);
  router.post("/complete", recruitmentActionRateLimiter, controller.complete);

  return router;
}
