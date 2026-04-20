import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import { getBackup } from './storage.js';

const pendingRestores = new Map();

export async function handleSelectMenu(interaction) {
  if (interaction.customId !== 'backup_select') return;

  const backupId = interaction.values[0];
  const backup = getBackup(backupId);
  if (!backup) return interaction.reply({ content: 'âŒ Backup nicht gefunden.', ephemeral: true });

  pendingRestores.set(interaction.user.id, backupId);

  const confirm = new ButtonBuilder()
    .setCustomId('restore_confirm')
    .setLabel('âœ… Ja, wiederherstellen')
    .setStyle(ButtonStyle.Danger);

  const cancel = new ButtonBuilder()
    .setCustomId('restore_cancel')
    .setLabel('âŒ Abbrechen')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(confirm, cancel);

  await interaction.reply({
    content:
      'âš ï¸ **Bist du sicher?**\n' +
      'Du laedt Backup: **' + backup.serverName + '**\n' +
      'Erstellt am: ' + new Date(backup.createdAt).toLocaleString('de-DE') + '\n' +
      'ðŸ“ ' + backup.channels.length + ' Kanaele | ðŸŽ­ ' + backup.roles.length + ' Rollen\n\n' +
      '**Alle bestehenden Kanaele und Rollen werden geloescht und neu erstellt!**',
    components: [row],
    ephemeral: true,
  });
}

export async function handleButton(interaction) {
  if (interaction.customId === 'restore_cancel') {
    pendingRestores.delete(interaction.user.id);
    return interaction.update({ content: 'âŒ Wiederherstellung abgebrochen.', components: [] });
  }

  if (interaction.customId !== 'restore_confirm') return;

  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: 'âŒ Du brauchst Admin-Rechte.', ephemeral: true });
  }

  const backupId = pendingRestores.get(interaction.user.id);
  if (!backupId) return interaction.reply({ content: 'âŒ Kein Backup ausgewaehlt.', ephemeral: true });

  const backup = getBackup(backupId);
  if (!backup) return interaction.reply({ content: 'âŒ Backup nicht gefunden.', ephemeral: true });

  await interaction.update({ content: 'â³ Backup wird wiederhergestellt...', components: [] });

  const guild = interaction.guild;

  try {
    await guild.setName(backup.serverName).catch(() => {});
    if (backup.serverIcon) await guild.setIcon(backup.serverIcon).catch(() => {});

    await interaction.editReply('â³ Loesche bestehende Kanaele...');
    for (const channel of guild.channels.cache.values()) {
      if (channel.id !== guild.systemChannelId) await channel.delete().catch(() => {});
    }

    await interaction.editReply('â³ Loesche bestehende Rollen...');
    for (const role of guild.roles.cache.values()) {
      if (!role.managed && role.id !== guild.id) await role.delete().catch(() => {});
    }

    await interaction.editReply('â³ Erstelle Rollen...');
    const roleMap = new Map();
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
      } catch { /* ueberspringen */ }
    }

    await interaction.editReply('â³ Erstelle Kanaele...');
    const categoryMap = new Map();

    const categories = backup.channels.filter(c => c.type === ChannelType.GuildCategory);
    for (const cat of categories.sort((a, b) => a.position - b.position)) {
      try {
        const newCat = await guild.channels.create({
          name: cat.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: buildOverwrites(cat.overwrites, guild),
        });
        categoryMap.set(cat.name, newCat.id);
      } catch { /* ueberspringen */ }
    }

    const others = backup.channels.filter(c => c.type !== ChannelType.GuildCategory);
    for (const ch of others.sort((a, b) => a.position - b.position)) {
      try {
        const options = {
          name:  ch.name,
          type:  ch.type,
          topic: ch.topic ?? undefined,
          nsfw:  ch.nsfw ?? false,
          permissionOverwrites: buildOverwrites(ch.overwrites, guild),
        };
        if (ch.parentName && categoryMap.has(ch.parentName)) options.parent = categoryMap.get(ch.parentName);
        if (ch.bitrate)   options.bitrate   = ch.bitrate;
        if (ch.userLimit) options.userLimit  = ch.userLimit;

        const newChannel = await guild.channels.create(options);

        if (ch.messages?.length > 0 && newChannel.isTextBased()) {
          const msgs = [...ch.messages].reverse();
          for (const msg of msgs.slice(0, 50)) {
            if (!msg.content) continue;
            await newChannel.send({
              content: ('**[' + msg.author + ']** ' + msg.content).slice(0, 2000),
            }).catch(() => {});
          }
        }
      } catch { /* ueberspringen */ }
    }

    pendingRestores.delete(interaction.user.id);
    await interaction.editReply(
      'âœ… **Backup erfolgreich wiederhergestellt!**\n' +
      'ðŸ·ï¸ Server: **' + backup.serverName + '**\n' +
      'ðŸ“ Kanaele: **' + backup.channels.length + '**\n' +
      'ðŸŽ­ Rollen: **' + backup.roles.length + '**'
    );
  } catch (err) {
    console.error('[RESTORE FEHLER]', err);
    await interaction.editReply('âŒ Wiederherstellung fehlgeschlagen. Pruefe die Bot-Berechtigungen.');
  }
}

function buildOverwrites(overwrites, guild) {
  return overwrites.map(o => {
    const role = guild.roles.cache.find(r => r.id === o.id);
    return {
      id:    role ? role.id : o.id,
      type:  o.type,
      allow: BigInt(o.allow),
      deny:  BigInt(o.deny),
    };
  });
}
