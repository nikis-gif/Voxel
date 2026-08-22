import { PermissionFlagsBits } from "discord.js";
import { VOXEL_GUILD_CONFIG } from "../config/voxelGuildConfig.js";

export function hasPrivilegedRole(member) {
  const roleCache = member?.roles?.cache;
  if (roleCache) {
    return VOXEL_GUILD_CONFIG.privilegedRoleIds.some((roleId) => roleCache.has(roleId));
  }

  const roleIds = Array.isArray(member?.roles) ? member.roles : [];
  return VOXEL_GUILD_CONFIG.privilegedRoleIds.some((roleId) => roleIds.includes(roleId));
}

export function hasAdministratorAccess(member) {
  return Boolean(
    member?.permissions?.has(PermissionFlagsBits.Administrator)
    || hasPrivilegedRole(member)
  );
}

export function interactionHasAdministratorAccess(interaction) {
  return Boolean(
    interaction?.memberPermissions?.has(PermissionFlagsBits.Administrator)
    || hasPrivilegedRole(interaction?.member)
  );
}
