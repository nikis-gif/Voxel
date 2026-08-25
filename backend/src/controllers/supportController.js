import { randomUUID } from "node:crypto";
import { isSupportedImageBuffer, normalizeMultiline, normalizeSingleLine } from "../utils/text.js";

const SUPPORT_TYPES = new Set(["technical", "report", "revocation", "other"]);
const LEGACY_TYPE_PREFIX = /^\[\s*(Suporte técnico|Denúncia|Revogação de patente|Dúvida ou outro assunto)\s*\]\s*/iu;

function normalizeSupportType(value, message) {
  const raw = String(value ?? "").normalize("NFKC").trim().toLowerCase();
  if (SUPPORT_TYPES.has(raw)) return raw;
  if (raw === "denúncia" || raw === "denuncia") return "report";
  if (raw === "revogação" || raw === "revogacao" || raw === "revogação de patente" || raw === "revogacao de patente") return "revocation";

  const legacyType = String(message ?? "").match(LEGACY_TYPE_PREFIX)?.[1]?.toLowerCase();
  if (legacyType === "denúncia" || legacyType === "denuncia") return "report";
  if (legacyType === "revogação de patente" || legacyType === "revogacao de patente") return "revocation";
  if (legacyType === "dúvida ou outro assunto" || legacyType === "duvida ou outro assunto") return "other";
  return "technical";
}

function removeLegacyTypePrefix(message) {
  return String(message ?? "").replace(LEGACY_TYPE_PREFIX, "").trim();
}

function parseRobloxUsername(value) {
  const username = normalizeSingleLine(value, 64).replace(/^@/, "");
  return /^(?=.{3,20}$)(?=.*[A-Za-z])[A-Za-z0-9]+(?:_[A-Za-z0-9]+)?$/.test(username) ? username : null;
}

function parseRevocationRank(value) {
  const raw = String(value ?? "").trim();
  if (!/^[1-7]$/.test(raw)) return null;
  return Number(raw);
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
      const discordUsername = type === "technical"
        ? ""
        : normalizeSingleLine(req.body.discordUsername, 40).replace(/^@/, "");
      const robloxUsername = type === "revocation" ? parseRobloxUsername(req.body.robloxUsername) : null;
      const lastRank = type === "revocation" ? parseRevocationRank(req.body.lastRank) : null;
      const files = Array.isArray(req.files) ? req.files : [];

      if (!sender) {
        res.status(400).json({ error: "Informe seu nome ou usuário." });
        return;
      }

      if (type !== "technical" && !discordUsername) {
        res.status(400).json({ error: "Informe seu @username do Discord para receber o status da solicitação." });
        return;
      }

      if (type === "revocation" && !robloxUsername) {
        res.status(400).json({ error: "Informe um nickname válido do Roblox." });
        return;
      }

      if (type === "revocation" && !lastRank) {
        res.status(400).json({ error: "A revogação aceita somente patentes de [REC] até [S-BTN]." });
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

      if (type === "revocation" && files.length === 0) {
        res.status(400).json({ error: "Anexe ao menos uma prova da patente anterior." });
        return;
      }

      const ticketPayload = { type, sender, discordUsername, robloxUsername, lastRank, message, files };
      abuseReservation = await supportAbuseService?.reserve(ticketPayload) ?? null;

      await supportSafetyService?.assertSupportAllowed(ticketPayload);

      const ticketId = randomUUID().split("-")[0].toUpperCase();
      const result = await discordSupportService.sendTicket({
        id: ticketId,
        type,
        sender,
        discordUsername,
        robloxUsername,
        lastRank,
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
