import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import { getBackup } from '../utils/storage.js';

// Merkt sich, welches Backup der User ausgewählt hat
const pendingRestores = new Map();

export async function handleSelectMenu(interaction) {
  if (interaction.customId !== 'backup_select') return;

  const backupId = interaction.values[0];
  const backup   = getBackup(backupId);
  if (!backup) return interaction.reply({ content: '❌ Backup nicht gefunden.', ephemeral: true });

  pendingRestores.set(interaction.user.id, backupId);

  const confirm = new ButtonBuilder()
    .setCustomId('restore_confirm')
    .setLabel('✅ Ja, wiederherstellen')
    .setStyle(ButtonStyle.Danger);

  const cancel = new ButtonBuilder()
    .setCustomId('restore_cancel')
    .setLabel('❌ Abbrechen')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(confirm, cancel);

  await interaction.reply({
    content:
      `⚠️ **Bist du sicher?**\n` +
      `Du lädst Backup: **${backup.serverName}**\n` +
      `Erstellt am: ${new Date(backup.createdAt).toLocaleString('de-DE')}\n` +
      `📁 ${backup.channels.length} Kanäle | 🎭 ${backup.roles.length} Rollen\n\n` +
      `**Alle bestehenden Kanäle und Rollen werden gelöscht und neu erstellt!**`,
    components: [row],
    ephemeral: true,
  });
}

export async function handleButton(interaction) {
  if (interaction.customId === 'restore_cancel') {
    pendingRestores.delete(interaction.user.id);
    return interaction.update({ content: '❌ Wiederherstellung abgebrochen.', components: [] });
  }

  if (interaction.customId !== 'restore_confirm') return;

  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ Du brauchst Admin-Rechte.', ephemeral: true });
  }

  const backupId = pendingRestores.get(interaction.user.id);
  if (!backupId) return interaction.reply({ content: '❌ Kein Backup ausgewählt.', ephemeral: true });

  const backup = getBackup(backupId);
  if (!backup) return interaction.reply({ content: '❌ Backup nicht gefunden.', ephemeral: true });

  await interaction.update({ content: '⏳ Backup wird wiederhergestellt…', components: [] });

  const guild = interaction.guild;

  try {
    // 1. Server-Name & Icon wiederherstellen
    await guild.setName(backup.serverName).catch(() => {});
    if (backup.serverIcon) {
      await guild.setIcon(backup.serverIcon).catch(() => {});
    }

    // 2. Bestehende Kanäle löschen
    await interaction.editReply('⏳ Lösche bestehende Kanäle…');
    for (const channel of guild.channels.cache.values()) {
      if (channel.id !== guild.systemChannelId) {
        await channel.delete().catch(() => {});
      }
    }

    // 3. Bestehende Rollen löschen (außer @everyone und Bot-Rollen)
    await interaction.editReply('⏳ Lösche bestehende Rollen…');
    for (const role of guild.roles.cache.values()) {
      if (!role.managed && role.id !== guild.id) {
        await role.delete().catch(() => {});
      }
    }

    // 4. Rollen wiederherstellen
    await interaction.editReply('⏳ Erstelle Rollen…');
    const roleMap = new Map(); // name -> neue Role ID
    for (const r of backup.roles) {
      try {
        const newRole = await guild.roles.create({
          name:        r.name,
          color:       r.color,
          hoist:       r.hoist,
          mentionable: r.mentionable,
          permissions: BigInt(r.permissions),
        });
        roleMap.set(r.name, newRole.id);
      } catch { /* überspringen */ }
    }

    // 5. Kanäle wiederherstellen
    await interaction.editReply('⏳ Erstelle Kanäle…');
    const categoryMap = new Map(); // name -> Category Channel

    // Zuerst Kategorien erstellen
    const categories = backup.channels.filter(c => c.type === ChannelType.GuildCategory);
    for (const cat of categories.sort((a, b) => a.position - b.position)) {
      try {
        const newCat = await guild.channels.create({
          name: cat.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: buildOverwrites(cat.overwrites, roleMap, guild),
        });
        categoryMap.set(cat.name, newCat.id);
      } catch { /* überspringen */ }
    }

    // Dann alle anderen Kanäle
    const others = backup.channels.filter(c => c.type !== ChannelType.GuildCategory);
    for (const ch of others.sort((a, b) => a.position - b.position)) {
      try {
        const options = {
          name:   ch.name,
          type:   ch.type,
          topic:  ch.topic ?? undefined,
          nsfw:   ch.nsfw ?? false,
          permissionOverwrites: buildOverwrites(ch.overwrites, roleMap, guild),
        };
        if (ch.parentName && categoryMap.has(ch.parentName)) {
          options.parent = categoryMap.get(ch.parentName);
        }
        if (ch.bitrate)   options.bitrate   = ch.bitrate;
        if (ch.userLimit) options.userLimit  = ch.userLimit;

        const newChannel = await guild.channels.create(options);

        // Nachrichten als Webhook-Replay schicken (best-effort)
        if (ch.messages?.length > 0 && newChannel.isTextBased()) {
          const msgs = [...ch.messages].reverse(); // älteste zuerst
          for (const msg of msgs.slice(0, 50)) { // max 50 pro Kanal
            if (!msg.content && msg.embeds.length === 0) continue;
            await newChannel.send({
              content: `**[${msg.author}]** ${msg.content}`.slice(0, 2000),
            }).catch(() => {});
          }
        }
      } catch { /* überspringen */ }
    }

    pendingRestores.delete(interaction.user.id);
    await interaction.editReply(
      `✅ **Backup erfolgreich wiederhergestellt!**\n` +
      `🏷️ Server: **${backup.serverName}**\n` +
      `📁 Kanäle: **${backup.channels.length}**\n` +
      `🎭 Rollen: **${backup.roles.length}**`
    );
  } catch (err) {
    console.error('[RESTORE FEHLER]', err);
    await interaction.editReply('❌ Wiederherstellung fehlgeschlagen. Prüfe die Bot-Berechtigungen.');
  }
}

function buildOverwrites(overwrites, roleMap, guild) {
  return overwrites.map(o => {
    // Versuche die neue Rollen-ID zu finden
    const role = guild.roles.cache.find(r => r.id === o.id);
    const resolvedId = role ? role.id : (roleMap.get(o.id) ?? o.id);
    return {
      id:    resolvedId,
      type:  o.type,
      allow: BigInt(o.allow),
      deny:  BigInt(o.deny),
    };
  });
}
