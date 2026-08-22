import { Router } from "express";
import { createOperationalAnnouncementController } from "../controllers/operationalAnnouncementController.js";
import { recruitmentActionRateLimiter } from "../middleware/rateLimiter.js";

export function createOperationalAnnouncementRouter({ operationalAnnouncementService }) {
  const router = Router();
  const controller = createOperationalAnnouncementController(operationalAnnouncementService);

  router.post("/submit", recruitmentActionRateLimiter, controller.submit);
  return router;
}
