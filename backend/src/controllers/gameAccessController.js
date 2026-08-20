export function createGameAccessController(gameBanService) {
  return {
    async check(req, res, next) {
      try {
        const result = await gameBanService.getStatus(req.body?.userId);

        res.status(200).json({
          success: true,
          data: result
        });
      } catch (error) {
        next(error);
      }
    }
  };
}
