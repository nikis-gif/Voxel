import { EmbedBuilder } from "discord.js";
import { EB_VERIFICATION_CONFIG } from "../config/ebVerificationConfig.js";
import { OPERATIONAL_ANNOUNCEMENT_CONFIG } from "../config/operationalAnnouncementConfig.js";
import { VOXEL_GUILD_CONFIG } from "../config/voxelGuildConfig.js";

const ROOT_PATH = "voxel/v1/operationalAnnouncements";
const URL_PATTERN = /^https:\/\/[a-z0-9.-]+(?:\:[0-9]+)?(?:[/?#][^\s]*)?$/i;

function clean(value, max) {
  return String(value ?? "").normalize("NFKC").trim().slice(0, max);
}

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseRanks(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  const requested = [...new Set(raw.map(Number).filter(Number.isInteger))];
  const allowed = new Map(OPERATIONAL_ANNOUNCEMENT_CONFIG.eligibleRanks.map((item) => [item.rank, item.label]));
  const selected = requested.filter((rank) => allowed.has(rank)).sort((a, b) => a - b);

  if (!selected.length || selected.length !== requested.length) {
    throw createError("Selecione ao menos uma patente válida para esta publicação.");
  }

  return selected.map((rank) => ({ rank, label: allowed.get(rank) }));
}

function validateUrl(value, label) {
  const url = clean(value, 500);
  if (!url || !URL_PATTERN.test(url)) throw createError(`${label} inválido. Use um link HTTPS completo.`);
  return url;
}

export class OperationalAnnouncementService {
  constructor({ database, client, guildId, staffReportService }) {
    this.root = database.ref(ROOT_PATH);
    this.announcementsRef = this.root.child("entries");
    this.client = client;
    this.guildId = guildId;
    this.staffReportService = staffReportService;
  }

  async submit({ token, announcementType, assistants, duration, tolerance, targetRanks, locationType, privateServerUrl, formUrl }) {
    const { key, session } = await this.staffReportService.getSession(token);
    const timestamp = Date.now();
    const lastSubmitAt = Number(session.lastAnnouncementAt ?? 0);
    if (timestamp - lastSubmitAt < OPERATIONAL_ANNOUNCEMENT_CONFIG.submitCooldownMs) {
      throw createError("Aguarde alguns segundos antes de publicar outro aviso.", 429);
    }

    const type = announcementType === "training" ? "training" : announcementType === "exam" ? "exam" : null;
    if (!type) throw createError("Tipo de publicação inválido.");

    const cleanAssistants = clean(assistants, 1000);
    const cleanDuration = clean(duration, 120);
    const cleanTolerance = clean(tolerance, 120);
    const ranks = parseRanks(targetRanks);
    if (!cleanAssistants || !cleanDuration || !cleanTolerance) {
      throw createError("Preencha todos os campos obrigatórios da publicação.");
    }

    let location = null;
    let externalUrl = null;
    if (type === "training") {
      location = locationType === "private" ? "Servidor Privado" : locationType === "public" ? "Servidor Público" : null;
      if (!location) throw createError("Selecione a localidade do treinamento.");
      if (locationType === "private") externalUrl = validateUrl(privateServerUrl, "Link do servidor privado");
    } else {
      externalUrl = validateUrl(formUrl, "Link do formulário");
    }

    if (!this.client.isReady()) throw createError("O Voxel ainda está conectando ao Discord. Tente novamente em alguns segundos.", 503);
    const guild = await this.client.guilds.fetch(this.guildId);
    const channelId = type === "training"
      ? VOXEL_GUILD_CONFIG.trainingAnnouncementChannelId
      : VOXEL_GUILD_CONFIG.examAnnouncementChannelId;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) throw createError("O canal de destino desta publicação não foi encontrado.", 503);

    const presenter = `${session.militaryLabel || `Rank ${session.militaryRank}`} ${session.characterName || session.username}`.trim();
    const title = type === "training" ? "Treinamento de Patente" : "Exame de Patente";
    const presenterLabel = type === "training" ? "Instrutor" : "Aplicador";
    const assistantsLabel = type === "training" ? "Auxiliares" : "Corretores";
    const ranksText = ranks.map((item) => `• ${item.label}`).join("\n");

    const fields = [
      { name: presenterLabel, value: `**${presenter}**\nRoblox ID: \`${session.robloxUserId}\``, inline: false },
      { name: assistantsLabel, value: cleanAssistants, inline: false },
      { name: "Duração estimada", value: cleanDuration, inline: true },
      { name: "Tempo de tolerância", value: cleanTolerance, inline: true }
    ];

    if (type === "training") {
      const locationValue = externalUrl ? `${location}\n${externalUrl}` : location;
      fields.splice(1, 0, { name: "Localidade", value: locationValue, inline: false });
    } else {
      fields.splice(1, 0, { name: "Formulário", value: externalUrl, inline: false });
    }

    fields.push({ name: "Treinamento destinado às patentes", value: ranksText, inline: false });

    const embed = new EmbedBuilder()
      .setColor(EB_VERIFICATION_CONFIG.color)
      .setAuthor({ name: "Voxel • Operações", iconURL: this.client.user?.displayAvatarURL({ size: 128 }) ?? undefined })
      .setTitle(title)
      .setDescription(type === "training"
        ? "Um novo treinamento de patente foi programado. Confira os dados abaixo antes de participar."
        : "Um novo exame de patente foi programado. Confira os dados e utilize somente o formulário indicado pelo aplicador.")
      .addFields(fields)
      .setFooter({ text: `Voxel • ${type === "training" ? "Treinamento" : "Exame"}` })
      .setTimestamp(timestamp);

    const sent = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    const entryRef = this.announcementsRef.push();
    await Promise.all([
      entryRef.set({
        announcementType: type,
        robloxUserId: session.robloxUserId,
        username: session.username,
        characterName: session.characterName,
        militaryRank: session.militaryRank,
        militaryLabel: session.militaryLabel,
        assistants: cleanAssistants,
        duration: cleanDuration,
        tolerance: cleanTolerance,
        targetRanks: ranks.map((item) => item.rank),
        locationType: type === "training" ? locationType : null,
        externalUrl,
        discordChannelId: channelId,
        discordMessageId: sent.id,
        createdAt: timestamp
      }),
      this.staffReportService.sessionsRef.child(key).update({ lastAnnouncementAt: timestamp })
    ]);

    console.info(`[operational-announcements] ${type} published by Roblox ${session.robloxUserId}.`);
    return { id: entryRef.key, discordMessageId: sent.id, announcementType: type };
  }
}
