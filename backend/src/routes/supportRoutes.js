import { Router } from "express";
import { createSupportController } from "../controllers/supportController.js";
import { supportGlobalRateLimiter, supportRateLimiter } from "../middleware/rateLimiter.js";
import { supportUpload } from "../middleware/upload.js";

export function createSupportRouter({
  discordSupportService,
  supportSafetyService,
  supportAbuseService
}) {
  const router = Router();
  const submitSupport = createSupportController({
    discordSupportService,
    supportSafetyService,
    supportAbuseService
  });

  router.post(
    "/",
    supportGlobalRateLimiter,
    supportRateLimiter,
    supportUpload.array("images", 4),
    submitSupport
  );

  return router;
}
