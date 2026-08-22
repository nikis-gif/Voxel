function bearerToken(req) {
  const header = String(req.headers.authorization ?? "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export function createOperationalAnnouncementController(service) {
  return Object.freeze({
    async submit(req, res, next) {
      try {
        const data = await service.submit({
          token: bearerToken(req),
          announcementType: req.body?.announcementType,
          assistants: req.body?.assistants,
          duration: req.body?.duration,
          tolerance: req.body?.tolerance,
          targetRanks: req.body?.targetRanks,
          locationType: req.body?.locationType,
          privateServerUrl: req.body?.privateServerUrl,
          formUrl: req.body?.formUrl
        });
        res.json({ success: true, data });
      } catch (error) {
        next(error);
      }
    }
  });
}
