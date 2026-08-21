const ROOT = "voxel/v1/moderationExtended";

function values(value) {
  return value && typeof value === "object" ? Object.entries(value) : [];
}

export class ModerationStore {
  constructor(database) {
    this.root = database.ref(ROOT);
  }

  async addCase({ type, targetDiscordId = null, moderatorDiscordId, reason, metadata = {} }) {
    const ref = this.root.child("cases").push();
    const record = {
      id: ref.key,
      type: String(type),
      targetDiscordId: targetDiscordId ? String(targetDiscordId) : null,
      moderatorDiscordId: String(moderatorDiscordId),
      reason: String(reason || "Não informado"),
      metadata,
      createdAt: Date.now()
    };
    await ref.set(record);
    if (record.targetDiscordId) {
      await this.root.child(`byUser/${record.targetDiscordId}/${record.id}`).set(record);
    }
    return record;
  }

  async listCases(discordUserId, limit = 20) {
    const snapshot = await this.root.child(`byUser/${String(discordUserId)}`).get();
    return values(snapshot.val())
      .map(([, value]) => value)
      .filter(Boolean)
      .sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0))
      .slice(0, limit);
  }

  async setModlogChannel(channelId) {
    if (!channelId) await this.root.child("config/modlogChannelId").remove();
    else await this.root.child("config/modlogChannelId").set(String(channelId));
  }

  async getModlogChannel() {
    const snapshot = await this.root.child("config/modlogChannelId").get();
    return snapshot.val() ? String(snapshot.val()) : null;
  }

  async setQuarantine(discordUserId, record) {
    await this.root.child(`quarantine/${String(discordUserId)}`).set(record);
  }

  async getQuarantine(discordUserId) {
    const snapshot = await this.root.child(`quarantine/${String(discordUserId)}`).get();
    return snapshot.val() ?? null;
  }

  async removeQuarantine(discordUserId) {
    const ref = this.root.child(`quarantine/${String(discordUserId)}`);
    const snapshot = await ref.get();
    await ref.remove();
    return snapshot.val() ?? null;
  }

  async listQuarantines() {
    const snapshot = await this.root.child("quarantine").get();
    return values(snapshot.val()).map(([discordUserId, value]) => ({ discordUserId, ...value }));
  }

  async setLockdownState(record) {
    await this.root.child("lockdown").set(record);
  }

  async getLockdownState() {
    const snapshot = await this.root.child("lockdown").get();
    return snapshot.val() ?? null;
  }

  async clearLockdownState() {
    await this.root.child("lockdown").remove();
  }
}
