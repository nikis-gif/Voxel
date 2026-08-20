import { timingSafeEqual } from "node:crypto";

function secureEquals(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ""), "utf8");
  const rightBuffer = Buffer.from(String(right ?? ""), "utf8");

  if (leftBuffer.length !== rightBuffer.length || leftBuffer.length === 0) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createRobloxAuth(apiKey) {
  return function robloxAuth(req, res, next) {
    const provided = req.get("x-api-key");
    if (!secureEquals(provided, apiKey)) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    next();
  };
}
