import { PermissionFlagsBits } from "discord.js";
import { EB_VERIFICATION_CONFIG, getRankRoleKey } from "../config/ebVerificationConfig.js";

const DISCORD_NICKNAME_MAX_LENGTH = 32;
const RANK_TAG_BY_RANK = Object.freeze({
  1: "[REC]",
  2: "[SLD]",
  3: "[CB]",
  4: "[T-SGT]",
  5: "[S-SGT]",
  6: "[P-SGT]",
  7: "[S-BTN]",
  8: "[AAO]",
  9: "[S-TN]",
  10: "[P-TN]",
  11: "[CAP]",
  12: "[MAJ]",
  13: "[TEN-C]",
  14: "[COR]",
  15: "[GEN-B]",
  16: "[GEN-D]",
  17: "[GEN-E]",
  18: "[S-COM]",
  19: "[COM]"
});

function normalizeName(value) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("pt-BR");
}

function roleOverrideId(roleIds, key) {
  const value = roleIds?.[key];
  return typeof value === "string" && /^\d{17,20}$/.test(value) ? value : null;
}

function cleanCharacterName(value) {
  if (typeof value !== "string") return "";

  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateNickname(value) {
  return Array.from(value).slice(0, DISCORD_NICKNAME_MAX_LENGTH).join("").trimEnd();
}

function rankTag(profile) {
  if (!profile?.military?.isMember) return "";

  const label = typeof profile.military.label === "string" ? profile.military.label.trim() : "";
  const labelTag = label.match(/^\[[A-Z0-9-]+\]/i)?.[0];
  if (labelTag) return labelTag.toUpperCase();

  return RANK_TAG_BY_RANK[profile.military.rank] ?? "";
}

function desiredNickname(profile) {
  if (!Object.prototype.hasOwnProperty.call(profile, "characterName")) {
    return { managed: false, value: null };
  }

  const characterName = cleanCharacterName(profile.characterName);
  if (!characterName) {
    return { managed: true, value: null };
  }

  const prefix = rankTag(profile);
  const nickname = prefix ? `${prefix} ${characterName}` : characterName;

  return {
    managed: true,
    value: truncateNickname(nickname)
  };
}

export class DiscordRoleSyncService {
  constructor({ guildId, roleIds = {} }) {
    this.guildId = guildId;
    this.roleIds = roleIds;
  }

  async resolveManagedRoles(guild) {
    await guild.roles.fetch();
    const resolved = new Map();

    for (const [key, definition] of Object.entries(EB_VERIFICATION_CONFIG.roles)) {
      const overrideId = roleOverrideId(this.roleIds, key);
      let role = overrideId ? guild.roles.cache.get(overrideId) ?? null : null;

      if (!role) {
        const acceptedNames = new Set(definition.names.map(normalizeName));
        role = guild.roles.cache.find((candidate) => acceptedNames.has(normalizeName(candidate.name))) ?? null;
      }

      if (role) resolved.set(key, role);
    }

    return resolved;
  }

  desiredRoleKeys(profile) {
    const desired = new Set(["verificado"]);

    if (!profile.military.isMember) {
      desired.add("civil");
      return desired;
    }

    const rankRoleKey = getRankRoleKey(profile.military.rank);
    if (!rankRoleKey) {
      const error = new Error(`Posto ou graduação EB não mapeado: rank ${profile.military.rank}.`);
      error.code = "EB_RANK_UNMAPPED";
      throw error;
    }
    desired.add(rankRoleKey);

    if (profile.division.isMember) {
      const divisionRoleKey = EB_VERIFICATION_CONFIG.divisions[profile.division.key];
      if (divisionRoleKey) desired.add(divisionRoleKey);
    }

    return desired;
  }

  validateBotAccess(guild, managedRoles, requiredKeys, member) {
    const botMember = guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      const error = new Error("O Voxel precisa da permissão Gerenciar Cargos neste servidor.");
      error.code = "MISSING_MANAGE_ROLES";
      throw error;
    }

    const missing = [...requiredKeys].filter((key) => !managedRoles.has(key));
    if (missing.length > 0) {
      const error = new Error(`Cargos do Voxel não encontrados: ${missing.join(", ")}.`);
      error.code = "ROLE_NOT_FOUND";
      throw error;
    }

    const involvedRoles = new Map();
    for (const key of requiredKeys) {
      const role = managedRoles.get(key);
      if (role) involvedRoles.set(role.id, role);
    }
    for (const role of managedRoles.values()) {
      if (member.roles.cache.has(role.id)) involvedRoles.set(role.id, role);
    }

    const blocked = [...involvedRoles.values()].filter((role) => !role.editable);
    if (blocked.length > 0) {
      const error = new Error(
        `O cargo do bot precisa ficar acima destes cargos: ${blocked.map((role) => role.name).join(", ")}.`
      );
      error.code = "ROLE_HIERARCHY_BLOCKED";
      throw error;
    }
  }

  async syncNickname(member, profile, reason) {
    const desired = desiredNickname(profile);
    if (!desired.managed) {
      return { managed: false, changed: false, value: member.nickname ?? null };
    }

    const botMember = member.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageNicknames)) {
      console.warn(`[verification] Voxel cannot manage nicknames in guild ${member.guild.id}.`);
      return {
        managed: true,
        changed: false,
        value: member.nickname ?? null,
        skipped: "missing-manage-nicknames"
      };
    }

    if (member.id === member.guild.ownerId || !member.manageable) {
      console.warn(`[verification] Nickname hierarchy blocked for Discord ${member.id}.`);
      return {
        managed: true,
        changed: false,
        value: member.nickname ?? null,
        skipped: "hierarchy"
      };
    }

    const currentNickname = member.nickname ?? null;
    if (currentNickname === desired.value) {
      return { managed: true, changed: false, value: desired.value };
    }

    await member.setNickname(desired.value, reason);
    return { managed: true, changed: true, value: desired.value };
  }

  async sync(member, profile) {
    if (member.guild.id !== this.guildId) {
      const error = new Error("Servidor de verificação inválido.");
      error.code = "WRONG_GUILD";
      throw error;
    }

    const managedRoles = await this.resolveManagedRoles(member.guild);
    const desiredKeys = this.desiredRoleKeys(profile);
    this.validateBotAccess(member.guild, managedRoles, desiredKeys, member);

    const desiredIds = new Set(
      [...desiredKeys]
        .map((key) => managedRoles.get(key)?.id)
        .filter(Boolean)
    );
    const managedIds = new Set([...managedRoles.values()].map((role) => role.id));

    const removeIds = [...member.roles.cache.keys()].filter(
      (roleId) => managedIds.has(roleId) && !desiredIds.has(roleId)
    );
    const addIds = [...desiredIds].filter((roleId) => !member.roles.cache.has(roleId));
    const reason = `Voxel verification for Roblox user ${profile.userId}`;

    if (removeIds.length > 0) await member.roles.remove(removeIds, reason);
    if (addIds.length > 0) await member.roles.add(addIds, reason);

    const nickname = await this.syncNickname(member, profile, reason);

    return {
      added: addIds.map((id) => managedRoles.size > 0
        ? [...managedRoles.values()].find((role) => role.id === id)?.name ?? id
        : id),
      removed: removeIds.map((id) => [...managedRoles.values()].find((role) => role.id === id)?.name ?? id),
      active: [...desiredIds].map((id) => [...managedRoles.values()].find((role) => role.id === id)?.name ?? id),
      nickname
    };
  }

  async assignCivil(member) {
    if (member.guild.id !== this.guildId || member.user.bot) return;

    const managedRoles = await this.resolveManagedRoles(member.guild);
    const civil = managedRoles.get("civil");
    if (!civil) {
      console.error("[verification] Civil role was not found in the EB guild.");
      return;
    }

    const botMember = member.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles) || !civil.editable) {
      console.error("[verification] Voxel cannot assign the Civil role. Check Manage Roles and hierarchy.");
      return;
    }

    if (!member.roles.cache.has(civil.id)) {
      await member.roles.add(civil, "Voxel automatic Civil role");
    }
  }
}
