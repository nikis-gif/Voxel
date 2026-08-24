import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import { VOXEL_GUILD_CONFIG } from "../config/voxelGuildConfig.js";
import { hasAdministratorAccess } from "../utils/staffAccess.js";
import { safeAttachmentName } from "../utils/text.js";

const PRIMARY_COLOR = 0x3366ff;
const REPORT_COLOR = 0xed4245;
const OTHER_COLOR = 0xfee75c;
const ATTACHMENT_COLOR = 0x2b2d31;
const ERROR_COLOR = 0xed4245;
const SUPPORT_TICKETS_PATH = "voxel/v1/support/tickets";
const STATUS_BUTTON_PREFIX = "voxel-support-status";
const STATUS_MODAL_PREFIX = "voxel-support-reply";
const PUBLIC_SUPPORT_TYPES = new Set(["report", "other"]);

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
    title: "Nova solicitação geral",
    description: "Uma solicitação geral foi encaminhada para análise da equipe responsável."
  })
});

const SUPPORT_STATUS = Object.freeze({
  done: Object.freeze({
    label: "Foi realizado",
    emoji: "✅",
    color: 0x57f287,
    style: ButtonStyle.Success
  }),
  progress: Object.freeze({
    label: "Está sendo realizado",
    emoji: "🛠️",
    color: 0x5865f2,
    style: ButtonStyle.Primary
  }),
  rejected: Object.freeze({
    label: "Não pode ser realizado",
    emoji: "❌",
    color: 0xed4245,
    style: ButtonStyle.Danger
  })
});

function getSupportMeta(type) {
  return SUPPORT_META[type] ?? SUPPORT_META.technical;
}

function isPublicSupport(type) {
  return PUBLIC_SUPPORT_TYPES.has(type);
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

function supportColor(type) {
  if (type === "report") return REPORT_COLOR;
  if (type === "other") return OTHER_COLOR;
  return PRIMARY_COLOR;
}

function buildTicketEmbed(ticket, botAvatar, discordMember = null) {
  const createdAt = Math.floor(ticket.createdAt.getTime() / 1000);
  const meta = getSupportMeta(ticket.type);
  const attachmentText = ticket.files.length === 0
    ? "Nenhum anexo enviado."
    : `${ticket.files.length} ${ticket.files.length === 1 ? "imagem anexada" : "imagens anexadas"} abaixo.`;

  const fields = [
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
    }
  ];

  if (discordMember) {
    fields.push({
      name: "Discord do solicitante",
      value: `<@${discordMember.id}>\n\`@${discordMember.user.username}\``,
      inline: false
    });
  }

  fields.push(
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
  );

  return new EmbedBuilder()
    .setColor(supportColor(ticket.type))
    .setAuthor({
      name: "Voxel • Central de Suporte",
      iconURL: botAvatar
    })
    .setTitle(meta.title)
    .setDescription(meta.description)
    .addFields(fields)
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

function buildStatusButtons(ticketId) {
  return new ActionRowBuilder().addComponents(
    ...Object.entries(SUPPORT_STATUS).map(([status, meta]) => (
      new ButtonBuilder()
        .setCustomId(`${STATUS_BUTTON_PREFIX}:${ticketId}:${status}`)
        .setLabel(meta.label)
        .setEmoji(meta.emoji)
        .setStyle(meta.style)
    ))
  );
}

function parseSupportInteraction(customId, prefix) {
  const parts = String(customId ?? "").split(":");
  if (parts.length !== 3 || parts[0] !== prefix) return null;

  const [, ticketId, status] = parts;
  if (!/^[A-Z0-9]{6,12}$/.test(ticketId) || !SUPPORT_STATUS[status]) return null;
  return { ticketId, status };
}

function normalizeDiscordUsername(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/^@/, "");
}

function memberHasRole(member, roleId) {
  if (!member || !roleId) return false;
  if (member.roles?.cache) return member.roles.cache.has(roleId);
  return Array.isArray(member.roles) && member.roles.includes(roleId);
}

export class DiscordSupportService {
  constructor({ client, ownerId, database, roleIds = {} }) {
    this.client = client;
    this.ownerId = ownerId;
    this.roleIds = roleIds;
    this.ticketsRef = database.ref(SUPPORT_TICKETS_PATH);
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    this.client.on(Events.InteractionCreate, (interaction) => {
      const isStatusButton = interaction.isButton()
        && interaction.customId.startsWith(`${STATUS_BUTTON_PREFIX}:`);
      const isStatusModal = interaction.isModalSubmit()
        && interaction.customId.startsWith(`${STATUS_MODAL_PREFIX}:`);

      if (!isStatusButton && !isStatusModal) return;

      const handler = isStatusButton
        ? this.handleStatusButton(interaction)
        : this.handleStatusModal(interaction);

      Promise.resolve(handler).catch((error) => {
        this.handleInteractionError(interaction, error).catch((replyError) => {
          console.error("[support] Failed to report interaction error:", replyError);
        });
      });
    });
  }

  isResponder(member, userId) {
    if (String(userId) === String(this.ownerId)) return true;
    if (hasAdministratorAccess(member)) return true;

    return VOXEL_GUILD_CONFIG.supportResponderRoleKeys
      .map((key) => this.roleIds[key])
      .filter(Boolean)
      .some((roleId) => memberHasRole(member, roleId));
  }

  assertResponder(interaction) {
    if (this.isResponder(interaction.member, interaction.user.id)) return;

    const error = new Error("Somente Oficiais, Superiores, Comandantes e Administradores podem atualizar este suporte.");
    error.code = "SUPPORT_STAFF_REQUIRED";
    throw error;
  }

  async getPublicChannel() {
    const channel = await this.client.channels.fetch(VOXEL_GUILD_CONFIG.supportReportChannelId).catch(() => null);
    if (!channel?.isTextBased() || typeof channel.send !== "function" || !channel.guild) {
      const error = new Error("O canal público de suporte está indisponível no momento. Tente novamente em alguns instantes.");
      error.statusCode = 503;
      throw error;
    }

    return channel;
  }

  async getDestination(ticket) {
    if (isPublicSupport(ticket.type)) return this.getPublicChannel();
    return this.client.users.fetch(this.ownerId);
  }

  async resolveDiscordMember(channel, rawUsername) {
    const username = normalizeDiscordUsername(rawUsername);
    if (!username) {
      const error = new Error("Informe seu @username do Discord para receber atualizações do suporte.");
      error.statusCode = 400;
      throw error;
    }

    const mentionMatch = username.match(/^<@!?(\d{17,20})>$/);
    const directId = mentionMatch?.[1] ?? (/^\d{17,20}$/.test(username) ? username : null);
    if (directId) {
      const member = await channel.guild.members.fetch(directId).catch(() => null);
      if (member && !member.user.bot) return member;
    }

    const normalized = username.toLowerCase();
    const cached = channel.guild.members.cache.find((member) => (
      !member.user.bot
      && [member.user.username, member.user.tag]
        .filter(Boolean)
        .some((candidate) => candidate.toLowerCase() === normalized)
    ));
    if (cached) return cached;

    const query = username.includes("#") ? username.split("#")[0] : username;
    const matches = await channel.guild.members.search({ query, limit: 25 }).catch((error) => {
      console.error("[support] Discord member search failed:", error);
      return null;
    });

    const exact = matches?.find((member) => (
      !member.user.bot
      && [member.user.username, member.user.tag]
        .filter(Boolean)
        .some((candidate) => candidate.toLowerCase() === normalized)
    ));

    if (exact) return exact;

    const error = new Error("Não encontrei esse @username no servidor. Use o usuário exato do Discord e confirme que sua conta está no servidor.");
    error.statusCode = 400;
    error.code = "DISCORD_SUPPORT_USER_NOT_FOUND";
    throw error;
  }

  async savePublicTicket(ticket, member, channelId) {
    const ref = this.ticketsRef.child(ticket.id);
    await ref.set({
      type: ticket.type,
      sender: ticket.sender,
      discordUserId: member.id,
      discordUsername: member.user.username,
      channelId: String(channelId),
      messageId: null,
      createdAt: ticket.createdAt.getTime(),
      latestStatus: null,
      updatedAt: ticket.createdAt.getTime()
    });
    return ref;
  }

  async handleStatusButton(interaction) {
    this.assertResponder(interaction);

    const parsed = parseSupportInteraction(interaction.customId, STATUS_BUTTON_PREFIX);
    if (!parsed) return;

    const ticketRef = this.ticketsRef.child(parsed.ticketId);
    const snapshot = await ticketRef.get();
    const ticket = snapshot.val();
    if (!ticket || String(ticket.channelId) !== String(interaction.channelId)) {
      throw new Error("Este ticket não está mais disponível para atualização.");
    }

    const previousResponse = await ticketRef.child(`responses/${interaction.user.id}`).get();
    if (previousResponse.exists()) {
      throw new Error("Você já respondeu este ticket. Cada administrador pode enviar apenas uma atualização por solicitação.");
    }

    const meta = SUPPORT_STATUS[parsed.status];
    const modal = new ModalBuilder()
      .setCustomId(`${STATUS_MODAL_PREFIX}:${parsed.ticketId}:${parsed.status}`)
      .setTitle(`Voxel • ${meta.label}`);

    const message = new TextInputBuilder()
      .setCustomId("message")
      .setLabel("Mensagem para o jogador")
      .setPlaceholder("Explique de forma objetiva o status desta solicitação.")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMinLength(5)
      .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder().addComponents(message));
    await interaction.showModal(modal);
  }

  async handleStatusModal(interaction) {
    this.assertResponder(interaction);

    const parsed = parseSupportInteraction(interaction.customId, STATUS_MODAL_PREFIX);
    if (!parsed) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const ticketRef = this.ticketsRef.child(parsed.ticketId);
    const snapshot = await ticketRef.get();
    const ticket = snapshot.val();
    if (!ticket || String(ticket.channelId) !== String(interaction.channelId)) {
      throw new Error("Este ticket não está mais disponível para atualização.");
    }

    const responseMessage = interaction.fields.getTextInputValue("message").trim();
    if (responseMessage.length < 5) throw new Error("Escreva uma resposta mais completa para o jogador.");

    const now = Date.now();
    const responseRef = ticketRef.child(`responses/${interaction.user.id}`);
    const reservation = await responseRef.transaction((current) => {
      if (current) return;
      return {
        status: parsed.status,
        message: responseMessage,
        staffId: interaction.user.id,
        createdAt: now,
        deliveredAt: null
      };
    });

    if (!reservation.committed) {
      throw new Error("Você já respondeu este ticket. Cada administrador pode enviar apenas uma atualização por solicitação.");
    }

    const meta = SUPPORT_STATUS[parsed.status];

    try {
      const user = await this.client.users.fetch(String(ticket.discordUserId));
      const dmEmbed = new EmbedBuilder()
        .setColor(meta.color)
        .setAuthor({
          name: "Voxel • Atualização de suporte",
          iconURL: this.client.user?.displayAvatarURL({ size: 128 }) ?? undefined
        })
        .setTitle(`${meta.emoji} ${meta.label}`)
        .setDescription(responseMessage)
        .addFields(
          { name: "Ticket", value: `\`#${parsed.ticketId}\``, inline: true },
          { name: "Tipo", value: getSupportMeta(ticket.type).label, inline: true }
        )
        .setFooter({ text: "Voxel Support • Resposta da equipe" })
        .setTimestamp(now);

      await user.send({ embeds: [dmEmbed], allowedMentions: { parse: [] } });
      await responseRef.update({ deliveredAt: Date.now() });
      await ticketRef.update({
        latestStatus: parsed.status,
        latestResponse: responseMessage,
        latestResponderId: interaction.user.id,
        updatedAt: Date.now()
      });

      await this.updateTicketMessage(ticket, parsed.ticketId, parsed.status, responseMessage, interaction.user.id);

      await interaction.editReply({
        content: `${meta.emoji} Status **${meta.label}** enviado por DM para <@${ticket.discordUserId}>.`
      });
    } catch (error) {
      await responseRef.remove().catch(() => {});

      if (error?.code === 50007) {
        throw new Error("Não foi possível enviar DM para esse jogador. Ele precisa permitir mensagens diretas de membros do servidor.");
      }

      throw error;
    }
  }

  async updateTicketMessage(ticket, ticketId, status, responseMessage, staffId) {
    if (!ticket.messageId || !ticket.channelId) return;

    const channel = await this.client.channels.fetch(String(ticket.channelId)).catch(() => null);
    if (!channel?.isTextBased() || !channel.messages) return;

    const message = await channel.messages.fetch(String(ticket.messageId)).catch(() => null);
    if (!message?.embeds?.[0]) return;

    const meta = SUPPORT_STATUS[status];
    const currentFields = message.embeds[0].fields.filter((field) => (
      field.name !== "Status atual" && field.name !== "Última resposta"
    ));

    const updatedEmbed = EmbedBuilder.from(message.embeds[0])
      .setFields(
        ...currentFields,
        {
          name: "Status atual",
          value: `${meta.emoji} **${meta.label}** • por <@${staffId}>`,
          inline: false
        },
        {
          name: "Última resposta",
          value: responseMessage.slice(0, 1000),
          inline: false
        }
      )
      .setTimestamp();

    await message.edit({ embeds: [updatedEmbed] }).catch((error) => {
      console.error(`[support:${ticketId}] Failed to update ticket status embed:`, error);
    });
  }

  async handleInteractionError(interaction, error) {
    const message = error instanceof Error ? error.message : "Não foi possível processar esta atualização.";

    if (interaction.deferred) {
      await interaction.editReply({ content: message });
      return;
    }

    if (interaction.replied) {
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
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
    let publicMember = null;
    let publicTicketRef = null;
    let ticketMessage = null;

    if (isPublicSupport(ticket.type)) {
      publicMember = await this.resolveDiscordMember(destination, ticket.discordUsername);
      publicTicketRef = await this.savePublicTicket(ticket, publicMember, destination.id);
    }

    const ticketEmbed = buildTicketEmbed(ticket, botAvatar, publicMember);

    try {
      ticketMessage = await destination.send({
        embeds: [ticketEmbed],
        components: isPublicSupport(ticket.type) ? [buildStatusButtons(ticket.id)] : [],
        allowedMentions: { parse: [] }
      });

      if (publicTicketRef) {
        await publicTicketRef.update({
          messageId: ticketMessage.id,
          updatedAt: Date.now()
        });
      }
    } catch (error) {
      await publicTicketRef?.remove().catch(() => {});
      await ticketMessage?.delete().catch(() => {});
      throw error;
    }

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

    console.info(`[support:${ticket.id}] ${isPublicSupport(ticket.type) ? "Public support" : "Technical support"} delivered.`);
    return { failedAttachments };
  }
}
