import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import { getBackup } from './storage.js';
import { pendingBackupGuilds, doBackup } from './backup.js';

const pendingRestores = new Map();

export async function handleSelectMenu(interaction) {

  // Kanalauswahl beim Backup
  if (interaction.customId === 'backup_channel_select') {
    const guild = pendingBackupGuilds.get(interaction.user.id);
    if (!guild) {
      return interaction.update({ content: 'Sitzung abgelaufen. Bitte /backup erneut ausfuehren.', components: [] });
    }
    const selected = new Set(interaction.values);
    pendingBackupGuilds.delete(interaction.user.id);
    await interaction.update({ content: '\u23F3 Backup laeuft...', components: [] });
    await doBackup(interaction, guild, selected);
    return;
  }

  // Backup-Auswahl beim Wiederherstellen
  if (interaction.customId === 'backup_select') {
    const backupId = interaction.values[0];
    const backup   = getBackup(backupId);
    if (!backup) return interaction.update({ content: '\u274C Backup nicht gefunden.', components: [] });

    pendingRestores.set(interaction.user.id, backupId);

    const confirm = new ButtonBuilder()
      .setCustomId('restore_confirm')
      .setLabel('Ja, wiederherstellen')
      .setStyle(ButtonStyle.Danger);

    const cancel = new ButtonBuilder()
      .setCustomId('restore_cancel')
      .setLabel('Abbrechen')
      .setStyle(ButtonStyle.Secondary);

    await interaction.update({
      content:
        '\u26A0\uFE0F **Bist du sicher?**\n' +
        'Backup: **' + backup.serverName + '**\n' +
        'Erstellt: ' + new Date(backup.createdAt).toLocaleString('de-DE') + '\n' +
        '\uD83D\uDCC1 ' + backup.channels.length + ' Kanaele  \uD83C\uDFAD ' + backup.roles.length + ' Rollen\n\n' +
        '**Alle bestehenden Kanaele und Rollen werden geloescht und neu erstellt!**',
      components: [new ActionRowBuilder().addComponents(confirm, cancel)],
    });
    return;
  }
}

export async function handleButton(interaction) {

  if (interaction.customId === 'restore_cancel') {
    pendingRestores.delete(interaction.user.id);
    return interaction.update({ content: '\u274C Wiederherstellung abgebrochen.', components: [] });
  }

  if (interaction.customId !== 'restore_confirm') return;

  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '\u274C Du brauchst Admin-Rechte.', ephemeral: true });
  }

  const backupId = pendingRestores.get(interaction.user.id);
  if (!backupId) return interaction.reply({ content: '\u274C Kein Backup ausgewaehlt.', ephemeral: true });

  const backup = getBackup(backupId);
  if (!backup) return interaction.reply({ content: '\u274C Backup nicht gefunden.', ephemeral: true });

  await interaction.update({ content: '\u23F3 Backup wird wiederhergestellt...', components: [] });

  const guild = interaction.guild;

  try {
    await guild.setName(backup.serverName).catch(() => {});
    if (backup.serverIcon) await guild.setIcon(backup.serverIcon).catch(() => {});

    await interaction.editReply('\u23F3 Loesche Kanaele...');
    for (const ch of guild.channels.cache.values()) {
      await ch.delete().catch(() => {});
    }

    await interaction.editReply('\u23F3 Loesche Rollen...');
    for (const role of guild.roles.cache.values()) {
      if (!role.managed && role.id !== guild.id) {
        await role.delete().catch(() => {});
      }
    }

    await interaction.editReply('\u23F3 Erstelle Rollen...');
    const roleNameToId = new Map();
    for (const r of backup.roles) {
      try {
        const newRole = await guild.roles.create({
          name:        r.name,
          color:       r.color,
          hoist:       r.hoist,
          mentionable: r.mentionable,
          permissions: BigInt(r.permissions),
          position:    r.position,
        });
        roleNameToId.set(r.name, newRole.id);
      } catch { /* ueberspringen */ }
    }

    await interaction.editReply('\u23F3 Erstelle Kanaele...');
    const categoryNameToId = new Map();

    const categories = backup.channels.filter(c => c.type === ChannelType.GuildCategory);
    for (const cat of categories.sort((a, b) => a.position - b.position)) {
      try {
        const newCat = await guild.channels.create({
          name: cat.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: resolveOverwrites(cat.overwrites, guild, roleNameToId, backup.roles),
        });
        categoryNameToId.set(cat.name, newCat.id);
      } catch { /* ueberspringen */ }
    }

    const others = backup.channels.filter(c => c.type !== ChannelType.GuildCategory);
    for (const ch of others.sort((a, b) => a.position - b.position)) {
      try {
        const opts = {
          name:  ch.name,
          type:  ch.type,
          topic: ch.topic ?? undefined,
          nsfw:  ch.nsfw ?? false,
          permissionOverwrites: resolveOverwrites(ch.overwrites, guild, roleNameToId, backup.roles),
        };
        if (ch.parentName && categoryNameToId.has(ch.parentName)) opts.parent = categoryNameToId.get(ch.parentName);
        if (ch.bitrate)           opts.bitrate           = ch.bitrate;
        if (ch.userLimit)         opts.userLimit          = ch.userLimit;
        if (ch.rateLimitPerUser)  opts.rateLimitPerUser   = ch.rateLimitPerUser;

        const newCh = await guild.channels.create(opts);

        if (ch.messages?.length > 0 && newCh.isTextBased()) {
          const msgs = [...ch.messages].reverse();
          for (const msg of msgs.slice(0, 100)) {
            if (!msg.content && !msg.attachments?.length) continue;
            const content = resolveRoleMentions(msg.content, roleNameToId);
            await newCh.send({
              content: ('[' + msg.author + '] ' + content).slice(0, 2000),
            }).catch(() => {});
          }
        }
      } catch { /* ueberspringen */ }
    }

    pendingRestores.delete(interaction.user.id);
    await interaction.editReply(
      '\u2705 **Backup erfolgreich wiederhergestellt!**\n' +
      '\uD83C\uDFF7\uFE0F Server: **' + backup.serverName + '**\n' +
      '\uD83D\uDCC1 Kanaele: **' + backup.channels.length + '**\n' +
      '\uD83C\uDFAD Rollen: **' + backup.roles.length + '**'
    );
  } catch (err) {
    console.error('[RESTORE FEHLER]', err);
    await interaction.editReply('\u274C Wiederherstellung fehlgeschlagen. Pruefe die Bot-Berechtigungen.');
  }
}

function resolveOverwrites(overwrites, guild, roleNameToId, backupRoles) {
  return overwrites.map(o => {
    let resolvedId = o.id;
    if (o.type === 0) {
      if (o.id === guild.id) {
        resolvedId = guild.id;
      } else {
        const backupRole = backupRoles.find(r => r.id === o.id);
        if (backupRole) {
          const newId = roleNameToId.get(backupRole.name);
          if (newId) resolvedId = newId;
        }
      }
    }
    return {
      id:    resolvedId,
      type:  o.type,
      allow: BigInt(o.allow),
      deny:  BigInt(o.deny),
    };
  });
}

function resolveRoleMentions(content, roleNameToId) {
  if (!content) return '';
  let result = content;
  for (const [name, id] of roleNameToId.entries()) {
    result = result.split('@' + name).join('<@&' + id + '>');
  }
  return result;
}
