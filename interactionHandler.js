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
      return interaction.update({ content: 'Sitzung abgelaufen. Bitte /backup erneut ausfÃ¼hren.', components: [] });
    }
    const selected = new Set(interaction.values);
    pendingBackupGuilds.delete(interaction.user.id);
    await interaction.update({ content: 'â³ Backup lÃ¤uft...', components: [] });
    await doBackup(interaction, guild, selected);
    return;
  }

  // Backup-Auswahl beim Wiederherstellen
  if (interaction.customId === 'backup_select') {
    const backupId = interaction.values[0];
    const backup   = getBackup(backupId);
    if (!backup) return interaction.update({ content: 'âŒ Backup nicht gefunden.', components: [] });

    pendingRestores.set(interaction.user.id, backupId);
    pendingDeletes.set(interaction.user.id, backupId);

    const restore = new ButtonBuilder()
      .setCustomId('restore_confirm')
      .setLabel('Laden')
      .setStyle(ButtonStyle.Danger);

    const del = new ButtonBuilder()
      .setCustomId('backup_delete')
      .setLabel('LÃ¶schen')
      .setStyle(ButtonStyle.Secondary);

    const cancel = new ButtonBuilder()
      .setCustomId('restore_cancel')
      .setLabel('Abbrechen')
      .setStyle(ButtonStyle.Secondary);

    await interaction.update({
      content:
        'âš ï¸ **Was mÃ¶chtest du tun?**\n' +
        'Backup: **' + (backup.serverName ?? backupId) + '**\n' +
        'Erstellt: ' + (backup.createdAt ? new Date(backup.createdAt).toLocaleString('de-DE') : '?') + '\n' +
        'ðŸ“ ' + backup.channels.length + ' KanÃ¤le  ðŸŽ­ ' + backup.roles.length + ' Rollen',
      components: [new ActionRowBuilder().addComponents(restore, del, cancel)],
    });
    return;
  }
}

export async function handleButton(interaction) {

  // â”€â”€ Abbrechen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (interaction.customId === 'restore_cancel') {
    pendingRestores.delete(interaction.user.id);
    pendingDeletes.delete(interaction.user.id);
    return interaction.update({ content: 'âŒ Abgebrochen.', components: [] });
  }

  // â”€â”€ Backup loeschen: Sicherheitsabfrage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (interaction.customId === 'backup_delete') {
    const backupId = pendingDeletes.get(interaction.user.id);
    if (!backupId) return interaction.update({ content: 'âŒ Kein Backup ausgewÃ¤hlt.', components: [] });
    const backup = getBackup(backupId);
    const confirmDel = new ButtonBuilder()
      .setCustomId('delete_confirm')
      .setLabel('Ja, endgÃ¼ltig lÃ¶schen')
      .setStyle(ButtonStyle.Danger);
    const cancelDel = new ButtonBuilder()
      .setCustomId('restore_cancel')
      .setLabel('Abbrechen')
      .setStyle(ButtonStyle.Secondary);
    await interaction.update({
      content:
        'âš ï¸ **Backup wirklich lÃ¶schen?**\n' +
        'Backup: **' + (backup?.serverName ?? backupId) + '**\n' +
        'Diese Aktion kann nicht rÃ¼ckgÃ¤ngig gemacht werden!',
      components: [new ActionRowBuilder().addComponents(confirmDel, cancelDel)],
    });
    return;
  }

  // â”€â”€ Backup loeschen: Bestaetigt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (interaction.customId === 'delete_confirm') {
    const backupId = pendingDeletes.get(interaction.user.id);
    if (!backupId) return interaction.update({ content: 'âŒ Kein Backup ausgewÃ¤hlt.', components: [] });
    pendingDeletes.delete(interaction.user.id);
    pendingRestores.delete(interaction.user.id);
    deleteBackup(backupId);
    return interaction.update({ content: 'âœ… Backup wurde gelÃ¶scht.', components: [] });
  }

  if (interaction.customId !== 'restore_confirm') return;

  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: 'âŒ Du brauchst Admin-Rechte.', ephemeral: true });
  }

  const backupId = pendingRestores.get(interaction.user.id);
  if (!backupId) return interaction.reply({ content: 'âŒ Kein Backup ausgewÃ¤hlt.', ephemeral: true });

  const backup = getBackup(backupId);
  if (!backup) return interaction.reply({ content: 'âŒ Backup nicht gefunden.', ephemeral: true });

  await interaction.update({ content: 'â³ Backup wird wiederhergestellt...', components: [] });

  const guild = interaction.guild;
  // Den Kanal der Interaktion NICHT sofort lÃ¶schen â€“ sonst schlagen alle editReply fehl
  const interactionChannelId = interaction.channelId;

  try {
    await guild.setName(backup.serverName).catch(() => {});
    if (backup.serverIcon) await guild.setIcon(backup.serverIcon).catch(() => {});

    await interaction.editReply('â³ LÃ¶sche KanÃ¤le...');
    for (const ch of guild.channels.cache.values()) {
      if (ch.id === interactionChannelId) continue; // zuletzt lÃ¶schen
      await ch.delete().catch(() => {});
    }

    await interaction.editReply('â³ LÃ¶sche Rollen...');
    for (const role of guild.roles.cache.values()) {
      if (!role.managed && role.id !== guild.id) {
        await role.delete().catch(() => {});
      }
    }

    await interaction.editReply('â³ Erstelle Rollen...');
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
      } catch { /* Ã¼berspringen */ }
    }

    await interaction.editReply('â³ Erstelle KanÃ¤le...');
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
      } catch { /* Ã¼berspringen */ }
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
      } catch { /* Ã¼berspringen */ }
    }

    pendingRestores.delete(interaction.user.id);
    await interaction.editReply(
      'âœ… **Backup erfolgreich wiederhergestellt!**\n' +
      'ðŸ·ï¸ Server: **' + backup.serverName + '**\n' +
      'ðŸ“ KanÃ¤le: **' + backup.channels.length + '**\n' +
      'ðŸŽ­ Rollen: **' + backup.roles.length + '**'
    );
    // Jetzt den Interaktions-Kanal lÃ¶schen (er war nicht im Backup)
    guild.channels.cache.get(interactionChannelId)?.delete().catch(() => {});
  } catch (err) {
    console.error('[RESTORE FEHLER]', err);
    await interaction.editReply('âŒ Wiederherstellung fehlgeschlagen. PrÃ¼fe die Bot-Berechtigungen.');
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
