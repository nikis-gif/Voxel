import {
  AuditLogEvent,
  EmbedBuilder,
  Events,
  PermissionFlagsBits
} from "discord.js";
import { VOXEL_OWNER_IDS, VOXEL_SECURITY_CONFIG } from "../config/voxelSecurityConfig.js";
import { EB_VERIFICATION_CONFIG } from "../config/ebVerificationConfig.js";

const ACTION_WEIGHTS = new Map([
  [AuditLogEvent.ChannelDelete, { weight: 2, label: "Canal removido" }],
  [AuditLogEvent.RoleDelete, { weight: 2, label: "Cargo removido" }],
  [AuditLogEvent.MemberBanAdd, { weight: 2, label: "Membro banido" }],
  [AuditLogEvent.MemberKick, { weight: 2, label: "Membro expulso" }],
  [AuditLogEvent.BotAdd, { weight: 3, label: "Bot adicionado" }],
  [AuditLogEvent.WebhookCreate, { weight: 2, label: "Webhook criado" }],
  [AuditLogEvent.WebhookDelete, { weight: 2, label: "Webhook removido" }],
  [AuditLogEvent.ChannelCreate, { weight: 1, label: "Canal criado" }],
  [AuditLogEvent.RoleCreate, { weight: 1, label: "Cargo criado" }],
  [AuditLogEvent.MemberRoleUpdate, { weight: 1, label: "Cargos de membro alterados" }]
]);

function now() {
  return Date.now();
}

export class GuildSecurityService {
  constructor({ client, guildId, database, supportOwnerId }) {
    this.client = client;
    this.guildId = guildId;
    this.database = database;
    this.ownerIds = new Set([...VOXEL_OWNER_IDS, String(supportOwnerId)]);
    this.joinEvents = [];
    this.executorActions = new Map();
    this.executorCooldowns = new Map();
    this.raidModeUntil = 0;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    const storedRaidUntil = Number(await this.database.getSecurityState("raidModeUntil") ?? 0);
    if (storedRaidUntil > now()) this.raidModeUntil = storedRaidUntil;

    this.client.on(Events.GuildMemberAdd, (member) => {
      if (member.guild.id !== this.guildId) return;
      this.handleJoin(member).catch((error) => {
        console.error("[security] Anti-raid join handler failed:", error);
      });
    });

    this.client.on(Events.GuildAuditLogEntryCreate, (entry, guild) => {
      if (guild.id !== this.guildId) return;
      this.handleAuditEntry(entry, guild).catch((error) => {
        console.error("[security] Anti-nuke audit handler failed:", error);
      });
    });

    console.log("[security] Anti-Raid and Anti-Nuke protection enabled.");
  }

  async notifyOwner(guild, title, description, fields = []) {
    const embed = new EmbedBuilder()
      .setColor(EB_VERIFICATION_CONFIG.color)
      .setAuthor({
        name: "Voxel • Segurança",
        iconURL: this.client.user?.displayAvatarURL({ size: 128 }) ?? undefined
      })
      .setTitle(title)
      .setDescription(description)
      .addFields(fields)
      .setFooter({ text: guild.name })
      .setTimestamp();

    for (const ownerId of this.ownerIds) {
      const user = await this.client.users.fetch(ownerId).catch(() => null);
      if (!user) continue;
      await user.send({ embeds: [embed] }).catch(() => {});
    }
  }

  async handleJoin(member) {
    const config = VOXEL_SECURITY_CONFIG.antiRaid;
    const timestamp = now();
    this.joinEvents.push(timestamp);
    this.joinEvents = this.joinEvents.filter((value) => timestamp - value <= config.joinWindowMs);

    if (this.joinEvents.length >= config.joinThreshold && this.raidModeUntil <= timestamp) {
      this.raidModeUntil = timestamp + config.raidModeMs;
      await this.database.setSecurityState("raidModeUntil", this.raidModeUntil);
      await this.database.recordSecurityIncident({
        type: "anti-raid-triggered",
        guildId: member.guild.id,
        joinCount: this.joinEvents.length,
        windowMs: config.joinWindowMs,
        raidModeUntil: this.raidModeUntil
      });

      console.warn(`[security] Anti-Raid enabled after ${this.joinEvents.length} joins in ${config.joinWindowMs}ms.`);
      await this.notifyOwner(
        member.guild,
        "Anti-Raid ativado",
        "O Voxel detectou uma entrada anormal de contas e ativou contenção temporária para novos membros.",
        [
          { name: "Entradas detectadas", value: String(this.joinEvents.length), inline: true },
          { name: "Modo de contenção", value: `<t:${Math.floor(this.raidModeUntil / 1000)}:R>`, inline: true }
        ]
      );
    }

    if (this.raidModeUntil <= timestamp) return;
    if (!member.moderatable) return;

    await member.timeout(config.newcomerTimeoutMs, "Voxel Anti-Raid: contenção temporária de novas entradas").catch(() => {});
  }

  isTrustedExecutor(guild, executorId) {
    if (!executorId) return true;
    if (executorId === this.client.user?.id) return true;
    if (executorId === guild.ownerId) return true;
    return this.ownerIds.has(String(executorId));
  }

  actionScore(executorId, weight) {
    const config = VOXEL_SECURITY_CONFIG.antiNuke;
    const timestamp = now();
    const previous = this.executorActions.get(executorId) ?? [];
    const active = previous.filter((item) => timestamp - item.at <= config.actionWindowMs);
    active.push({ at: timestamp, weight });
    this.executorActions.set(executorId, active);
    return active.reduce((total, item) => total + item.weight, 0);
  }

  async handleAuditEntry(entry, guild) {
    const descriptor = ACTION_WEIGHTS.get(entry.action);
    if (!descriptor) return;

    const executorId = entry.executorId ? String(entry.executorId) : null;
    if (this.isTrustedExecutor(guild, executorId)) return;

    const score = this.actionScore(executorId, descriptor.weight);
    const config = VOXEL_SECURITY_CONFIG.antiNuke;
    if (score < config.scoreThreshold) return;

    const cooldownUntil = this.executorCooldowns.get(executorId) ?? 0;
    if (cooldownUntil > now()) return;
    this.executorCooldowns.set(executorId, now() + config.incidentCooldownMs);

    const incident = await this.quarantineExecutor(guild, executorId, descriptor.label, score);
    await this.database.recordSecurityIncident(incident);
  }

  async quarantineExecutor(guild, executorId, lastAction, score) {
    const member = await guild.members.fetch(executorId).catch(() => null);
    const removedRoles = [];
    let timedOut = false;

    if (member) {
      const removable = member.roles.cache.filter((role) =>
        role.id !== guild.roles.everyone.id
        && !role.managed
        && role.editable
      );

      if (removable.size > 0) {
        await member.roles.remove(removable.map((role) => role.id), "Voxel Anti-Nuke: atividade destrutiva em sequência").catch(() => {});
        removedRoles.push(...removable.map((role) => role.name));
      }

      if (member.moderatable) {
        await member.timeout(
          VOXEL_SECURITY_CONFIG.antiNuke.quarantineTimeoutMs,
          "Voxel Anti-Nuke: atividade destrutiva em sequência"
        ).then(() => { timedOut = true; }).catch(() => {});
      }
    }

    console.error(`[security] Anti-Nuke triggered for Discord ${executorId}; score=${score}.`);

    await this.notifyOwner(
      guild,
      "Anti-Nuke acionado",
      "O Voxel detectou uma sequência de ações administrativas potencialmente destrutivas e tentou conter o executor.",
      [
        { name: "Executor", value: `<@${executorId}>\n\`${executorId}\``, inline: true },
        { name: "Pontuação", value: String(score), inline: true },
        { name: "Última ação", value: lastAction, inline: false },
        { name: "Cargos removidos", value: removedRoles.length > 0 ? removedRoles.join(", ").slice(0, 1024) : "Nenhum cargo removível", inline: false },
        { name: "Timeout", value: timedOut ? "24 horas" : "Não foi possível aplicar", inline: true }
      ]
    );

    return {
      type: "anti-nuke-triggered",
      guildId: guild.id,
      executorDiscordId: executorId,
      score,
      lastAction,
      removedRoles,
      timedOut
    };
  }
}
