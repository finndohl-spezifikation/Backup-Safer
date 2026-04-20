import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import { getBackup, deleteBackup } from './storage.js';
import { pendingBackupGuilds, doBackup } from './backup.js';

const pendingRestores = new Map();
const pendingDeletes  = new Map();

export async function handleSelectMenu(interaction) {

  // Kanalauswahl beim Backup
  if (interaction.customId === 'backup_channel_select') {
    const guild = pendingBackupGuilds.get(interaction.user.id);
    if (!guild) {
      return interaction.update({ content: 'Sitzung abgelaufen. Bitte /backup erneut ausf\u{FC}hren.', components: [] });
    }
    const selected = new Set(interaction.values);
    pendingBackupGuilds.delete(interaction.user.id);
    await interaction.update({ content: '\u{23F3} Backup l\u{E4}uft...', components: [] });
    await doBackup(interaction, guild, selected);
    return;
  }

  // Backup-Auswahl beim Wiederherstellen
  if (interaction.customId === 'backup_select') {
    const backupId = interaction.values[0];
    const backup   = getBackup(backupId);
    if (!backup) return interaction.update({ content: '\u{274C} Backup nicht gefunden.', components: [] });

    pendingRestores.set(interaction.user.id, backupId);
    pendingDeletes.set(interaction.user.id, backupId);

    const restore = new ButtonBuilder()
      .setCustomId('restore_confirm')
      .setLabel('Laden')
      .setStyle(ButtonStyle.Danger);

    const del = new ButtonBuilder()
      .setCustomId('backup_delete')
      .setLabel('L\u{F6}schen')
      .setStyle(ButtonStyle.Secondary);

    const cancel = new ButtonBuilder()
      .setCustomId('restore_cancel')
      .setLabel('Abbrechen')
      .setStyle(ButtonStyle.Secondary);

    await interaction.update({
      content:
        '\u{26A0}\u{FE0F} **Was m\u{F6}chtest du tun?**\n' +
        'Backup: **' + (backup.serverName ?? backupId) + '**\n' +
        'Erstellt: ' + (backup.createdAt ? new Date(backup.createdAt).toLocaleString('de-DE') : '?') + '\n' +
        '\u{1F4C1} ' + backup.channels.length + ' Kan\u{E4}le  \u{1F3AD} ' + backup.roles.length + ' Rollen',
      components: [new ActionRowBuilder().addComponents(restore, del, cancel)],
    });
    return;
  }
}

export async function handleButton(interaction) {

  // \u{2500}\u{2500} Abbrechen \u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}
  if (interaction.customId === 'restore_cancel') {
    pendingRestores.delete(interaction.user.id);
    pendingDeletes.delete(interaction.user.id);
    return interaction.update({ content: '\u{274C} Abgebrochen.', components: [] });
  }

  // \u{2500}\u{2500} Backup loeschen: Sicherheitsabfrage \u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}
  if (interaction.customId === 'backup_delete') {
    const backupId = pendingDeletes.get(interaction.user.id);
    if (!backupId) return interaction.update({ content: '\u{274C} Kein Backup ausgew\u{E4}hlt.', components: [] });
    const backup = getBackup(backupId);
    const confirmDel = new ButtonBuilder()
      .setCustomId('delete_confirm')
      .setLabel('Ja, endg\u{FC}ltig l\u{F6}schen')
      .setStyle(ButtonStyle.Danger);
    const cancelDel = new ButtonBuilder()
      .setCustomId('restore_cancel')
      .setLabel('Abbrechen')
      .setStyle(ButtonStyle.Secondary);
    await interaction.update({
      content:
        '\u{26A0}\u{FE0F} **Backup wirklich l\u{F6}schen?**\n' +
        'Backup: **' + (backup?.serverName ?? backupId) + '**\n' +
        'Diese Aktion kann nicht r\u{FC}ckg\u{E4}ngig gemacht werden!',
      components: [new ActionRowBuilder().addComponents(confirmDel, cancelDel)],
    });
    return;
  }

  // \u{2500}\u{2500} Backup loeschen: Bestaetigt \u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}
  if (interaction.customId === 'delete_confirm') {
    const backupId = pendingDeletes.get(interaction.user.id);
    if (!backupId) return interaction.update({ content: '\u{274C} Kein Backup ausgew\u{E4}hlt.', components: [] });
    pendingDeletes.delete(interaction.user.id);
    pendingRestores.delete(interaction.user.id);
    deleteBackup(backupId);
    return interaction.update({ content: '\u{2705} Backup wurde gel\u{F6}scht.', components: [] });
  }

  if (interaction.customId !== 'restore_confirm') return;

  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '\u{274C} Du brauchst Admin-Rechte.', ephemeral: true });
  }

  const backupId = pendingRestores.get(interaction.user.id);
  if (!backupId) return interaction.reply({ content: '\u{274C} Kein Backup ausgew\u{E4}hlt.', ephemeral: true });

  const backup = getBackup(backupId);
  if (!backup) return interaction.reply({ content: '\u{274C} Backup nicht gefunden.', ephemeral: true });

  await interaction.update({ content: '\u{23F3} Backup wird wiederhergestellt...', components: [] });

  const guild = interaction.guild;
  // Den Kanal der Interaktion NICHT sofort l\u{F6}schen \u{2013} sonst schlagen alle editReply fehl
  const interactionChannelId = interaction.channelId;

  try {
    await guild.setName(backup.serverName).catch(() => {});
    if (backup.serverIcon) await guild.setIcon(backup.serverIcon).catch(() => {});

    await interaction.editReply('\u{23F3} L\u{F6}sche Kan\u{E4}le...');
    for (const ch of guild.channels.cache.values()) {
      if (ch.id === interactionChannelId) continue; // zuletzt l\u{F6}schen
      await ch.delete().catch(() => {});
    }

    await interaction.editReply('\u{23F3} L\u{F6}sche Rollen...');
    for (const role of guild.roles.cache.values()) {
      if (!role.managed && role.id !== guild.id) {
        await role.delete().catch(() => {});
      }
    }

    // @everyone-Berechtigungen wiederherstellen
    if (backup.everyonePermissions) {
      await guild.roles.everyone.setPermissions(BigInt(backup.everyonePermissions)).catch(() => {});
    }

    await interaction.editReply('\u{23F3} Erstelle Rollen...');
    const roleNameToId = new Map();
    // Aufsteigend nach Position erstellen (niedrigste zuerst)
    const sortedRoles = [...backup.roles].sort((a, b) => a.position - b.position);
    for (const r of sortedRoles) {
      try {
        const newRole = await guild.roles.create({
          name:        r.name,
          color:       r.color,
          hoist:       r.hoist,
          mentionable: r.mentionable,
          permissions: BigInt(r.permissions),
        });
        roleNameToId.set(r.name, newRole.id);
      } catch { /* \u{FC}berspringen */ }
    }

    // Rollen-Reihenfolge exakt erzwingen
    await interaction.editReply('\u{23F3} Setze Rollen-Reihenfolge...');
    const positionUpdates = [];
    for (const r of sortedRoles) {
      const newId = roleNameToId.get(r.name);
      if (newId) positionUpdates.push({ role: newId, position: r.position });
    }
    if (positionUpdates.length > 0) {
      await guild.roles.setPositions(positionUpdates).catch(e => console.error('[RESTORE] setPositions:', e.message));
    }

    await interaction.editReply('\u{23F3} Erstelle Kan\u{E4}le...');
    const categoryNameToId = new Map();
    const categoryIdToNewId = new Map();

    const categories = backup.channels.filter(c => c.type === ChannelType.GuildCategory);
    for (const cat of categories.sort((a, b) => a.position - b.position)) {
      try {
        const newCat = await guild.channels.create({
          name:     cat.name,
          type:     ChannelType.GuildCategory,
          position: cat.position,
          permissionOverwrites: resolveOverwrites(cat.overwrites, guild, roleNameToId, backup.roles),
        });
        categoryNameToId.set(cat.name, newCat.id);
        categoryIdToNewId.set(cat.id, newCat.id);
      } catch { /* \u{FC}berspringen */ }
    }

    const others = backup.channels.filter(c => c.type !== ChannelType.GuildCategory);
    for (const ch of others.sort((a, b) => a.position - b.position)) {
      try {
        const opts = {
          name:     ch.name,
          type:     ch.type,
          position: ch.position,
          topic:    ch.topic ?? undefined,
          nsfw:     ch.nsfw ?? false,
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
      } catch { /* \u{FC}berspringen */ }
    }

    pendingRestores.delete(interaction.user.id);
    await interaction.editReply(
      '\u{2705} **Backup erfolgreich wiederhergestellt!**\n' +
      '\u{1F3F7}\u{FE0F} Server: **' + backup.serverName + '**\n' +
      '\u{1F4C1} Kan\u{E4}le: **' + backup.channels.length + '**\n' +
      '\u{1F3AD} Rollen: **' + backup.roles.length + '**'
    );
    // Jetzt den Interaktions-Kanal l\u{F6}schen (er war nicht im Backup)
    guild.channels.cache.get(interactionChannelId)?.delete().catch(() => {});
  } catch (err) {
    console.error('[RESTORE FEHLER]', err);
    await interaction.editReply('\u{274C} Wiederherstellung fehlgeschlagen. Pr\u{FC}fe die Bot-Berechtigungen.');
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
