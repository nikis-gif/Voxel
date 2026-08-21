import { createHash, randomBytes } from "node:crypto";
import { AttachmentBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { EB_VERIFICATION_CONFIG } from "../config/ebVerificationConfig.js";
import { VOXEL_GUILD_CONFIG } from "../config/voxelGuildConfig.js";
import { safeAttachmentName } from "../utils/text.js";

const ROOT_PATH = "voxel/v1/staffReports";

function tokenKey(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function createToken() {
  return randomBytes(24).toString("base64url");
}

function clean(value, max) {
  const text = String(value ?? "").normalize("NFKC").trim();
  return text.slice(0, max);
}

function rankLabel(profile) {
  return clean(profile?.military?.label, 80) || `Rank ${Number(profile?.military?.rank ?? 0)}`;
}

function instructorLabel(profile) {
  const characterName = clean(profile?.characterName, 80) || clean(profile?.username, 80) || `Roblox ${profile?.userId}`;
  const rank = rankLabel(profile);
  return `${rank} ${characterName}`.trim();
}

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export class StaffReportService {
  constructor({ database, codeStore, client, guildId, verificationDatabase }) {
    this.root = database.ref(ROOT_PATH);
    this.sessionsRef = this.root.child("sessions");
    this.reportsRef = this.root.child("reports");
    this.codeStore = codeStore;
    this.client = client;
    this.guildId = guildId;
    this.verificationDatabase = verificationDatabase;
  }

  async isAdministrator(profile) {
    const link = await this.verificationDatabase.getByRobloxUserId(profile.userId).catch(() => null);
    if (!link?.discordUserId || !this.client.isReady()) return false;

    const guild = await this.client.guilds.fetch(this.guildId).catch(() => null);
    const member = guild ? await guild.members.fetch(String(link.discordUserId)).catch(() => null) : null;
    return Boolean(member?.permissions.has(PermissionFlagsBits.Administrator));
  }

  async authorize(code) {
    const claim = await this.codeStore.claim(code);
    if (!claim) throw createError("Código inválido, expirado ou já utilizado. Gere um novo código no Voxel dentro do jogo.", 400);

    try {
      const profile = claim.profile;
      const rank = Number(profile?.military?.rank ?? 0);
      const isMember = profile?.military?.isMember === true;
      const administrator = await this.isAdministrator(profile);

      if ((!isMember || rank < VOXEL_GUILD_CONFIG.staffReportMinimumRank) && !administrator) {
        throw createError("Esta área é restrita a Graduados, Oficiais, Superiores, Comandantes e Administradores.", 403);
      }

      const token = createToken();
      const key = tokenKey(token);
      const createdAt = Date.now();
      const expiresAt = createdAt + VOXEL_GUILD_CONFIG.staffReportSessionTtlMs;
      const session = {
        robloxUserId: Number(profile.userId),
        username: clean(profile.username, 80),
        characterName: clean(profile.characterName, 80),
        militaryRank: rank,
        militaryLabel: rankLabel(profile),
        administrator,
        createdAt,
        expiresAt,
        lastSubmitAt: 0
      };

      await this.sessionsRef.child(key).set(session);
      const committed = await this.codeStore.commit(claim);
      if (!committed) {
        await this.sessionsRef.child(key).remove().catch(() => {});
        throw createError("Não foi possível confirmar o código. Gere outro código e tente novamente.", 503);
      }

      return {
        token,
        expiresAt,
        profile: {
          robloxUserId: session.robloxUserId,
          username: session.username,
          characterName: session.characterName,
          militaryRank: session.militaryRank,
          militaryLabel: session.militaryLabel,
          administrator: session.administrator,
          instructor: instructorLabel(profile)
        }
      };
    } catch (error) {
      await this.codeStore.release(claim).catch(() => {});
      throw error;
    }
  }

  async getSession(token) {
    const raw = String(token ?? "").trim();
    if (!raw) throw createError("Sessão de relatórios inválida.", 401);
    const key = tokenKey(raw);
    const snapshot = await this.sessionsRef.child(key).get();
    const session = snapshot.val();
    if (!session || Number(session.expiresAt ?? 0) <= Date.now()) {
      if (session) await this.sessionsRef.child(key).remove().catch(() => {});
      throw createError("Sua sessão de relatórios expirou. Gere um novo código no jogo.", 401);
    }
    return { key, session };
  }

  async submit({ token, reportType, assistants, recruits, promoted, duration, files = [] }) {
    const { key, session } = await this.getSession(token);
    const timestamp = Date.now();
    const lastSubmitAt = Number(session.lastSubmitAt ?? 0);
    if (timestamp - lastSubmitAt < VOXEL_GUILD_CONFIG.staffReportSubmitCooldownMs) {
      throw createError("Aguarde alguns segundos antes de enviar outro relatório.", 429);
    }

    const type = reportType === "training" ? "training" : reportType === "recruitment" ? "recruitment" : null;
    if (!type) throw createError("Tipo de relatório inválido.", 400);

    const cleanAssistants = clean(assistants, 1000);
    const cleanDuration = clean(duration, 120);
    const cleanPeople = type === "recruitment" ? clean(recruits, 1000) : clean(promoted, 1000);
    if (!cleanAssistants || !cleanDuration || !cleanPeople) {
      throw createError("Preencha todos os campos obrigatórios do relatório.", 400);
    }

    if (!this.client.isReady()) throw createError("O Voxel ainda está conectando ao Discord. Tente novamente em alguns segundos.", 503);
    const guild = await this.client.guilds.fetch(this.guildId);
    const channelId = type === "recruitment"
      ? VOXEL_GUILD_CONFIG.recruitmentReportChannelId
      : VOXEL_GUILD_CONFIG.trainingReportChannelId;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) throw createError("O canal de destino deste relatório não foi encontrado.", 503);

    const instructor = `${session.militaryLabel || `Rank ${session.militaryRank}`} ${session.characterName || session.username}`.trim();
    const title = type === "recruitment" ? "Relatório de Recrutamento" : "Relatório de Treinamento de Patente";
    const peopleLabel = type === "recruitment" ? "Novos Recrutas" : "Promovidos";
    const attachmentText = files.length ? `${files.length} comprovação(ões) anexada(s).` : "Nenhuma comprovação anexada.";

    const embed = new EmbedBuilder()
      .setColor(EB_VERIFICATION_CONFIG.color)
      .setAuthor({ name: "Voxel • Relatórios Operacionais", iconURL: this.client.user?.displayAvatarURL({ size: 128 }) ?? undefined })
      .setTitle(title)
      .setDescription("Registro enviado pela área restrita do site oficial.")
      .addFields(
        { name: "Instrutor", value: `**${instructor}**\nRoblox ID: \`${session.robloxUserId}\``, inline: false },
        { name: "Auxiliares", value: cleanAssistants, inline: false },
        { name: peopleLabel, value: cleanPeople, inline: false },
        { name: "Comprovações", value: attachmentText, inline: true },
        { name: "Estimativa de tempo", value: cleanDuration, inline: true }
      )
      .setFooter({ text: `Voxel • ${type === "recruitment" ? "Recrutamento" : "Treinamento"}` })
      .setTimestamp(timestamp);

    const attachments = files.map((file, index) => {
      const name = safeAttachmentName(file.originalname, file.mimetype, index);
      return new AttachmentBuilder(file.buffer, { name });
    });

    if (attachments.length > 0) {
      const firstName = attachments[0].name;
      if (firstName) embed.setImage(`attachment://${firstName}`);
    }

    const sent = await channel.send({ embeds: [embed], files: attachments, allowedMentions: { parse: [] } });
    const reportRef = this.reportsRef.push();
    await Promise.all([
      reportRef.set({
        reportType: type,
        robloxUserId: session.robloxUserId,
        username: session.username,
        characterName: session.characterName,
        militaryRank: session.militaryRank,
        militaryLabel: session.militaryLabel,
        assistants: cleanAssistants,
        people: cleanPeople,
        duration: cleanDuration,
        proofCount: files.length,
        discordChannelId: channelId,
        discordMessageId: sent.id,
        createdAt: timestamp
      }),
      this.sessionsRef.child(key).update({ lastSubmitAt: timestamp })
    ]);

    console.info(`[staff-reports] ${type} report sent by Roblox ${session.robloxUserId}.`);
    return { id: reportRef.key, discordMessageId: sent.id, reportType: type };
  }
}
