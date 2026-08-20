import { rateLimit } from "express-rate-limit";

const handler = (_req, res) => {
  res.status(429).json({
    error: "Muitas solicitações foram enviadas. Aguarde alguns minutos e tente novamente."
  });
};

export const supportGlobalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,
  keyGenerator: () => "voxel-support-global",
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler
});

export const supportRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler
});
