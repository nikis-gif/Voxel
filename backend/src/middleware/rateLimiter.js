import { rateLimit } from "express-rate-limit";

export const supportRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: "Muitas solicitações foram enviadas. Aguarde alguns minutos e tente novamente."
    });
  }
});
