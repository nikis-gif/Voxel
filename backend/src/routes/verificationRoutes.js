import { Router } from "express";
import { createVerificationController } from "../controllers/verificationController.js";
import { createRobloxAuth } from "../middleware/robloxAuth.js";

export function createVerificationRouter({ codeStore, robloxApiKey, discordVerificationService }) {
  const router = Router();
  const controller = createVerificationController(codeStore, discordVerificationService);
  const auth = createRobloxAuth(robloxApiKey);

  router.post("/code", auth, controller.generateCode);
  router.post("/sync", auth, controller.syncProfile);
  return router;
}
