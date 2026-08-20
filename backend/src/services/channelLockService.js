import { PermissionFlagsBits } from "discord.js";

const LOCKED_PERMISSIONS = Object.freeze([
  ["sendMessages", PermissionFlagsBits.SendMessages],
  ["addReactions", PermissionFlagsBits.AddReactions],
  ["createPublicThreads", PermissionFlagsBits.CreatePublicThreads],
  ["createPrivateThreads", PermissionFlagsBits.CreatePrivateThreads],
  ["sendMessagesInThreads", PermissionFlagsBits.SendMessagesInThreads]
]);

function permissionState(overwrite, permission) {
  if (!overwrite) return null;
  if (overwrite.allow.has(permission)) return true;
  if (overwrite.deny.has(permission)) return false;
  return null;
}

function stateToEdit(record) {
  return Object.fromEntries(LOCKED_PERMISSIONS.map(([name]) => [name, record?.[name] ?? null]));
}

export class ChannelLockService {
  constructor(database) {
    this.database = database;
  }

  validateChannel(channel) {
    if (!channel?.guild || !channel.permissionOverwrites || !channel.isTextBased()) {
      throw new Error("Este comando precisa ser usado em um canal de texto do servidor.");
    }

    const botMember = channel.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      throw new Error("O Voxel precisa da permissão Gerenciar Cargos para alterar permissões de chat.");
    }
  }

  async lock(channel, moderatorDiscordId) {
    this.validateChannel(channel);

    const everyoneId = channel.guild.roles.everyone.id;
    const existingStored = await this.database.getChannelLock(channel.id);
    if (existingStored?.locked === true) {
      return { alreadyLocked: true, record: existingStored };
    }

    const overwrite = channel.permissionOverwrites.cache.get(everyoneId) ?? null;
    const previous = {};
    for (const [name, permission] of LOCKED_PERMISSIONS) {
      previous[name] = permissionState(overwrite, permission);
    }

    const record = {
      locked: true,
      channelId: channel.id,
      guildId: channel.guild.id,
      moderatorDiscordId: String(moderatorDiscordId),
      lockedAt: Date.now(),
      previous
    };

    await this.database.setChannelLock(channel.id, record);

    try {
      await channel.permissionOverwrites.edit(everyoneId, {
        SendMessages: false,
        AddReactions: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
        SendMessagesInThreads: false
      }, { reason: `Voxel chat lock by ${moderatorDiscordId}` });
    } catch (error) {
      await this.database.removeChannelLock(channel.id).catch(() => {});
      throw error;
    }

    return { alreadyLocked: false, record };
  }

  async unlock(channel, moderatorDiscordId) {
    this.validateChannel(channel);

    const everyoneId = channel.guild.roles.everyone.id;
    const stored = await this.database.getChannelLock(channel.id);
    if (!stored) {
      const error = new Error("Este canal não possui um bloqueio registrado pelo Voxel.");
      error.code = "CHANNEL_NOT_LOCKED";
      throw error;
    }

    const previous = stateToEdit(stored.previous ?? {});

    await channel.permissionOverwrites.edit(everyoneId, {
      SendMessages: previous.sendMessages,
      AddReactions: previous.addReactions,
      CreatePublicThreads: previous.createPublicThreads,
      CreatePrivateThreads: previous.createPrivateThreads,
      SendMessagesInThreads: previous.sendMessagesInThreads
    }, { reason: `Voxel chat unlock by ${moderatorDiscordId}` });

    await this.database.removeChannelLock(channel.id);
    return { wasTracked: Boolean(stored) };
  }
}
