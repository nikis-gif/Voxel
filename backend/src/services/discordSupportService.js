import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import { safeAttachmentName } from "../utils/text.js";

const PRIMARY_COLOR = 0x3366ff;
const ATTACHMENT_COLOR = 0x2b2d31;
const ERROR_COLOR = 0xed4245;

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
  const attachmentText = ticket.files.length === 0
    ? "Nenhum anexo enviado."
    : `${ticket.files.length} ${ticket.files.length === 1 ? "imagem anexada" : "imagens anexadas"} abaixo.`;

  return new EmbedBuilder()
    .setColor(PRIMARY_COLOR)
    .setAuthor({
      name: "Voxel • Central de Suporte",
      iconURL: botAvatar
    })
    .setTitle("Nova solicitação de suporte")
    .setDescription("Um novo atendimento foi enviado pelo site do Voxel.")
    .addFields(
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
        name: "Problema relatado",
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

  async sendTicket(ticket) {
    const owner = await this.client.users.fetch(this.ownerId);
    const botAvatar = this.client.user?.displayAvatarURL({ size: 128 }) ?? undefined;
    const preparedFiles = buildAttachments(ticket.files);
    const ticketEmbed = buildTicketEmbed(ticket, botAvatar);

    await owner.send({
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
        await owner.send({
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
      await owner.send({
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

    return { failedAttachments };
  }
}
