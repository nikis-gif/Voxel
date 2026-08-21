import { Router } from "express";
import { createStaffReportController } from "../controllers/staffReportController.js";
import { reportUpload } from "../middleware/upload.js";
import { recruitmentActionRateLimiter, recruitmentStartRateLimiter } from "../middleware/rateLimiter.js";

export function createStaffReportRouter({ staffReportService }) {
  const router = Router();
  const controller = createStaffReportController(staffReportService);

  router.post("/auth", recruitmentStartRateLimiter, controller.authorize);
  router.get("/session", controller.session);
  router.post("/submit", recruitmentActionRateLimiter, reportUpload.array("proofs", 4), controller.submit);
  return router;
}
