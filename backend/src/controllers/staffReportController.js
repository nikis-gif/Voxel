function bearerToken(req) {
  const header = String(req.headers.authorization ?? "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export function createStaffReportController(service) {
  return Object.freeze({
    async authorize(req, res, next) {
      try {
        const data = await service.authorize(req.body?.code);
        res.json({ success: true, data });
      } catch (error) {
        next(error);
      }
    },

    async session(req, res, next) {
      try {
        const { session } = await service.getSession(bearerToken(req));
        res.json({
          success: true,
          data: {
            expiresAt: Number(session.expiresAt),
            profile: {
              robloxUserId: Number(session.robloxUserId),
              username: String(session.username ?? ""),
              characterName: String(session.characterName ?? ""),
              militaryRank: Number(session.militaryRank ?? 0),
              militaryLabel: String(session.militaryLabel ?? ""),
              administrator: session.administrator === true,
              instructor: `${session.militaryLabel || `Rank ${session.militaryRank}`} ${session.characterName || session.username}`.trim()
            }
          }
        });
      } catch (error) {
        next(error);
      }
    },

    async submit(req, res, next) {
      try {
        const data = await service.submit({
          token: bearerToken(req),
          reportType: req.body?.reportType,
          assistants: req.body?.assistants,
          recruits: req.body?.recruits,
          promoted: req.body?.promoted,
          duration: req.body?.duration,
          files: req.files ?? []
        });
        res.json({ success: true, data });
      } catch (error) {
        next(error);
      }
    }
  });
}
