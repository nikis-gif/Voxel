import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { createHealthRouter } from "./routes/healthRoutes.js";
import { createSupportRouter } from "./routes/supportRoutes.js";
import { createVerificationRouter } from "./routes/verificationRoutes.js";

export function createApp({
  env,
  discordClient,
  discordSupportService,
  verificationCodeStore,
  discordVerificationService
}) {
  const app = express();
  const allowedOrigins = new Set(env.allowedOrigins);

  if (env.trustProxy !== false) app.set("trust proxy", env.trustProxy);

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin.replace(/\/$/, ""))) {
        callback(null, true);
        return;
      }

      const error = new Error("Origin not allowed by CORS");
      error.statusCode = 403;
      callback(error);
    },
    methods: ["GET", "POST", "OPTIONS"],
    maxAge: 86400
  }));

  app.use(express.json({ limit: "32kb" }));
  app.use("/health", createHealthRouter(discordClient));
  app.use("/api/support", createSupportRouter(discordSupportService));

  if (env.verification.enabled && discordVerificationService) {
    app.use("/api/verification", createVerificationRouter({
      codeStore: verificationCodeStore,
      robloxApiKey: env.verification.robloxApiKey,
      discordVerificationService
    }));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
