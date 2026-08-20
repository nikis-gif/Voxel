export function createGameAccessController(gameBanService) {
  return {
    check(req, res, next) {
      try {
        const result = gameBanService.getStatus(req.body?.userId);

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
