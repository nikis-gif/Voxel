import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import { VOXEL_GUILD_CONFIG } from "../config/voxelGuildConfig.js";
import { safeAttachmentName } from "../utils/text.js";

const PRIMARY_COLOR = 0x3366ff;
const REPORT_COLOR = 0xed4245;
const ATTACHMENT_COLOR = 0x2b2d31;
const ERROR_COLOR = 0xed4245;

const SUPPORT_META = Object.freeze({
  technical: Object.freeze({
    label: "Suporte técnico",
    title: "Nova solicitação de suporte técnico",
    description: "Um erro ou problema técnico foi enviado pelo site do Voxel."
  }),
  report: Object.freeze({
    label: "Denúncia",
    title: "Nova denúncia de jogador",
    description: "Uma denúncia foi encaminhada para análise da equipe responsável."
  }),
  other: Object.freeze({
    label: "Dúvida ou outro assunto",
    title: "Nova solicitação de suporte",
    description: "Uma nova solicitação foi enviada pelo site do Voxel."
  })
});

function getSupportMeta(type) {
  return SUPPORT_META[type] ?? SUPPORT_META.technical;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";

  const units = ["B", "KB", "MB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** unitIndex);

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function buildAttachments(files) {
  return files.map((file, index) => {
    const name = safeAttachmentName(file.originalname, file.mimetype, index);

    return {
      name,
      size: file.size ?? file.buffer.length,
      attachment: new AttachmentBuilder(file.buffer, { name })
    };
  });
}

function buildTicketEmbed(ticket, botAvatar) {
  const createdAt = Math.floor(ticket.createdAt.getTime() / 1000);
  const meta = getSupportMeta(ticket.type);
  const attachmentText = ticket.files.length === 0
    ? "Nenhum anexo enviado."
    : `${ticket.files.length} ${ticket.files.length === 1 ? "imagem anexada" : "imagens anexadas"} abaixo.`;

  return new EmbedBuilder()
    .setColor(ticket.type === "report" ? REPORT_COLOR : PRIMARY_COLOR)
    .setAuthor({
      name: "Voxel • Central de Suporte",
      iconURL: botAvatar
    })
    .setTitle(meta.title)
    .setDescription(meta.description)
    .addFields(
      {
        name: "Tipo",
        value: meta.label,
        inline: true
      },
      {
        name: "Solicitante",
        value: `\`${ticket.sender}\``,
        inline: true
      },
      {
        name: "Ticket",
        value: `\`#${ticket.id}\``,
        inline: true
      },
      {
        name: ticket.type === "report" ? "Denúncia" : "Relato",
        value: ticket.message,
        inline: false
      },
      {
        name: "Anexos",
        value: attachmentText,
        inline: false
      },
      {
        name: "Recebido",
        value: `<t:${createdAt}:F> • <t:${createdAt}:R>`,
        inline: false
      }
    )
    .setFooter({
      text: `Voxel Support • Ticket #${ticket.id}`,
      iconURL: botAvatar
    })
    .setTimestamp(ticket.createdAt);
}

function buildAttachmentEmbed(ticket, file, index, total, botAvatar) {
  return new EmbedBuilder()
    .setColor(ATTACHMENT_COLOR)
    .setAuthor({
      name: `Anexo ${index + 1} de ${total}`,
      iconURL: botAvatar
    })
    .setDescription(`**Arquivo:** \`${file.name}\`\n**Tamanho:** ${formatBytes(file.size)}`)
    .setImage(`attachment://${file.name}`)
    .setFooter({ text: `Ticket #${ticket.id} • Voxel Support` });
}

export class DiscordSupportService {
  constructor(client, ownerId) {
    this.client = client;
    this.ownerId = ownerId;
  }

  async getDestination(ticket) {
    if (ticket.type === "report") {
      const channel = await this.client.channels.fetch(VOXEL_GUILD_CONFIG.supportReportChannelId).catch(() => null);
      if (!channel?.isTextBased()) {
        const error = new Error("O canal de denúncias está indisponível no momento. Tente novamente em alguns instantes.");
        error.statusCode = 503;
        throw error;
      }

      return channel;
    }

    return this.client.users.fetch(this.ownerId);
  }

  async sendTicket(ticket) {
    if (!this.client.isReady()) {
      const error = new Error("O suporte está iniciando. Tente novamente em alguns segundos.");
      error.statusCode = 503;
      throw error;
    }

    const destination = await this.getDestination(ticket);
    const botAvatar = this.client.user?.displayAvatarURL({ size: 128 }) ?? undefined;
    const preparedFiles = buildAttachments(ticket.files);
    const ticketEmbed = buildTicketEmbed(ticket, botAvatar);

    await destination.send({
      embeds: [ticketEmbed],
      allowedMentions: { parse: [] }
    });

    const failedAttachments = [];

    for (let index = 0; index < preparedFiles.length; index += 1) {
      const file = preparedFiles[index];
      const attachmentEmbed = buildAttachmentEmbed(
        ticket,
        file,
        index,
        preparedFiles.length,
        botAvatar
      );

      try {
        await destination.send({
          embeds: [attachmentEmbed],
          files: [file.attachment],
          allowedMentions: { parse: [] }
        });
      } catch (error) {
        failedAttachments.push(file.name);
        console.error(`[support:${ticket.id}] Failed to send attachment ${file.name}:`, error);
      }
    }

    if (failedAttachments.length > 0) {
      await destination.send({
        embeds: [
          new EmbedBuilder()
            .setColor(ERROR_COLOR)
            .setTitle("Alguns anexos não foram entregues")
            .setDescription([
              `${failedAttachments.length} arquivo(s) do ticket \`#${ticket.id}\` falharam durante o envio.`,
              "",
              failedAttachments.map((name) => `• \`${name}\``).join("\n")
            ].join("\n"))
            .setFooter({ text: "Voxel Support" })
        ],
        allowedMentions: { parse: [] }
      }).catch(() => {});
    }

    console.info(`[support:${ticket.id}] ${ticket.type === "report" ? "Report" : "Support"} delivered.`);
    return { failedAttachments };
  }
}

