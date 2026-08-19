import { Router } from "express";
import { createSupportController } from "../controllers/supportController.js";
import { supportRateLimiter } from "../middleware/rateLimiter.js";
import { supportUpload } from "../middleware/upload.js";

export function createSupportRouter(discordSupportService) {
  const router = Router();
  const submitSupport = createSupportController(discordSupportService);

  router.post(
    "/",
    supportRateLimiter,
    supportUpload.array("images", 4),
    submitSupport
  );

  return router;
}
