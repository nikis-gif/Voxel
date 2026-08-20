import { randomUUID } from "node:crypto";
import { isSupportedImageBuffer, normalizeMultiline, normalizeSingleLine } from "../utils/text.js";

export function createSupportController({
  discordSupportService,
  contentModerationService,
  supportAbuseService
}) {
  return async function submitSupport(req, res, next) {
    let abuseReservation = null;
    let delivered = false;

    try {
      if (typeof req.body.website === "string" && req.body.website.trim() !== "") {
        res.status(400).json({ error: "Solicitação inválida." });
        return;
      }

      const sender = normalizeSingleLine(req.body.sender, 80);
      const message = normalizeMultiline(req.body.message, 1800);
      const files = Array.isArray(req.files) ? req.files : [];

      if (!sender) {
        res.status(400).json({ error: "Informe seu nome ou usuário." });
        return;
      }

      if (!message) {
        res.status(400).json({ error: "Descreva o problema antes de enviar." });
        return;
      }

      const invalidFile = files.find((file) => !isSupportedImageBuffer(file));
      if (invalidFile) {
        res.status(400).json({ error: "Um dos anexos não é uma imagem válida." });
        return;
      }

      const ticketPayload = { sender, message, files };
      abuseReservation = supportAbuseService?.reserve(ticketPayload) ?? null;

      await contentModerationService?.assertSupportAllowed(ticketPayload);

      const ticketId = randomUUID().split("-")[0].toUpperCase();
      const result = await discordSupportService.sendTicket({
        id: ticketId,
        sender,
        message,
        files,
        createdAt: new Date()
      });

      delivered = true;

      const response = {
        ok: true,
        ticketId
      };

      if (result.failedAttachments.length > 0) {
        response.warning = `Solicitação ${ticketId} recebida, mas ${result.failedAttachments.length} imagem(ns) não puderam ser enviadas.`;
      }

      res.status(201).json(response);
    } catch (error) {
      next(error);
    } finally {
      // Failed moderation/network attempts must not poison the 30-minute duplicate cache.
      if (!delivered && abuseReservation) {
        supportAbuseService?.release(abuseReservation);
      }
    }
  };
}
