function validUserId(value) {
  const userId = Number(value);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

export function createRewardController(rewardService) {
  return Object.freeze({
    reserve(req, res, next) {
      try {
        const userId = validUserId(req.body?.userId);
        if (!userId) {
          res.status(400).json({ error: "Invalid Roblox user id" });
          return;
        }

        const data = rewardService.reserve({ code: req.body?.code, robloxUserId: userId });
        res.json({ success: true, data });
      } catch (error) {
        next(error);
      }
    },

    commit(req, res, next) {
      try {
        const data = rewardService.commit({
          code: req.body?.code,
          reservationToken: req.body?.reservationToken
        });
        res.json({ success: true, data });
      } catch (error) {
        next(error);
      }
    },

    release(req, res, next) {
      try {
        rewardService.release({
          code: req.body?.code,
          reservationToken: req.body?.reservationToken
        });
        res.json({ success: true, data: { released: true } });
      } catch (error) {
        next(error);
      }
    }
  });
}
