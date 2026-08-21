function readString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function createRecruitmentController(recruitmentService) {
  return Object.freeze({
    async start(req, res, next) {
      try {
        const data = await recruitmentService.start(readString(req.body?.code, 32));
        res.status(201).json({ success: true, data });
      } catch (error) {
        next(error);
      }
    },

    async retry(req, res, next) {
      try {
        const data = await recruitmentService.retry(readString(req.body?.candidateToken, 128));
        res.status(201).json({ success: true, data });
      } catch (error) {
        next(error);
      }
    },

    async submit(req, res, next) {
      try {
        const data = await recruitmentService.submit({
          candidateToken: readString(req.body?.candidateToken, 128),
          sessionId: readString(req.body?.sessionId, 80),
          answers: req.body?.answers
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        next(error);
      }
    },

    async complete(req, res, next) {
      try {
        const data = await recruitmentService.complete(readString(req.body?.candidateToken, 128));
        res.status(200).json({ success: true, data });
      } catch (error) {
        next(error);
      }
    }
  });
}
