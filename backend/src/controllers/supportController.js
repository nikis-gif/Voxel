import { randomUUID } from "node:crypto";
import { isSupportedImageBuffer, normalizeMultiline, normalizeSingleLine } from "../utils/text.js";

const SUPPORT_TYPES = new Set(["technical", "report", "other"]);
const LEGACY_TYPE_PREFIX = /^\[\s*(Suporte técnico|Denúncia|Dúvida ou outro assunto)\s*\]\s*/iu;

function normalizeSupportType(value, message) {
  const raw = String(value ?? "").normalize("NFKC").trim().toLowerCase();
  if (SUPPORT_TYPES.has(raw)) return raw;
  if (raw === "denúncia" || raw === "denuncia") return "report";

  const legacyType = String(message ?? "").match(LEGACY_TYPE_PREFIX)?.[1]?.toLowerCase();
  if (legacyType === "denúncia" || legacyType === "denuncia") return "report";
  if (legacyType === "dúvida ou outro assunto" || legacyType === "duvida ou outro assunto") return "other";
  return "technical";
}

function removeLegacyTypePrefix(message) {
  return String(message ?? "").replace(LEGACY_TYPE_PREFIX, "").trim();
}

export function createSupportController({
  discordSupportService,
  supportSafetyService,
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
      const rawMessage = normalizeMultiline(req.body.message, 1800);
      const type = normalizeSupportType(req.body.type, rawMessage);
      const message = normalizeMultiline(removeLegacyTypePrefix(rawMessage), 1800);
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

      const ticketPayload = { type, sender, message, files };
      abuseReservation = await supportAbuseService?.reserve(ticketPayload) ?? null;

      await supportSafetyService?.assertSupportAllowed(ticketPayload);

      const ticketId = randomUUID().split("-")[0].toUpperCase();
      const result = await discordSupportService.sendTicket({
        id: ticketId,
        type,
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
      // Failed safety/network attempts must not poison the 30-minute duplicate cache.
      if (!delivered && abuseReservation) {
        await supportAbuseService?.release(abuseReservation);
      }
    }
  };
}
