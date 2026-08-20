import { Events } from "discord.js";

const CLEAR_COMMAND = "clear";
const FETCH_LIMIT = 100;

function isOwnerClearCommand(message, ownerId) {
  if (message.author.bot) return false;
  if (message.author.id !== ownerId) return false;
  if (message.guildId !== null) return false;

  return message.content.trim().toLowerCase() === CLEAR_COMMAND;
}

async function deleteBotMessages(client, channel) {
  let before;
  let deletedCount = 0;

  while (true) {
    const options = before
      ? { limit: FETCH_LIMIT, before }
      : { limit: FETCH_LIMIT };

    const messages = await channel.messages.fetch(options);
    if (messages.size === 0) break;

    const page = [...messages.values()];
    before = page.at(-1)?.id;

    for (const message of page) {
      if (message.author.id !== client.user.id) continue;

      try {
        await message.delete();
        deletedCount += 1;
      } catch (error) {
        console.error(`[dm-clear] Failed to delete message ${message.id}:`, error);
      }
    }

    if (messages.size < FETCH_LIMIT || !before) break;
  }

  return deletedCount;
}

export function registerDiscordDmCommands(client, ownerId) {
  const activeChannels = new Set();

  client.on(Events.MessageCreate, async (message) => {
    if (!isOwnerClearCommand(message, ownerId)) return;
    if (activeChannels.has(message.channelId)) return;

    activeChannels.add(message.channelId);

    try {
      const deletedCount = await deleteBotMessages(client, message.channel);
      console.log(`[dm-clear] Removed ${deletedCount} bot message(s) from owner DM.`);
    } catch (error) {
      console.error("[dm-clear] Failed to clear owner DM:", error);
    } finally {
      activeChannels.delete(message.channelId);
    }
  });
}
