import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelType,
} from 'discord.js';

export const backupCommand = new SlashCommandBuilder()
  .setName('backup')
  .setDescription('Erstellt ein vollstaendiges Backup dieses Servers')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .toJSON();

// Zwischenspeicher: userId -> guild (wird benoetigt fuer spaetere Schritte)
export const pendingBackupGuilds = new Map();

export async function handleBackup(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: 'Du brauchst Admin-Rechte.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;

  // Alle Text-Kanaele sammeln (keine Kategorien, keine Voice)
  const textChannels = guild.channels.cache.filter(
    c => c.isTextBased() && !c.isThread() && c.type !== ChannelType.GuildCategory
  );

  if (textChannels.size === 0) {
    // Keine TextkanÃ¤le -> Backup direkt ohne Nachrichten
    await doBackup(interaction, guild, new Set());
    return;
  }

  // Optionen fÃ¼r Select-Menu (max 25)
  const options = [
    new StringSelectMenuOptionBuilder()
      .setLabel('Alle Kanaele')
      .setDescription('Nachrichten aus ALLEN TextkanÃ¤len sichern')
      .setValue('__ALL__'),
    new StringSelectMenuOptionBuilder()
      .setLabel('Keine Nachrichten')
      .setDescription('Nur Struktur sichern, keine Nachrichten')
      .setValue('__NONE__'),
    ...textChannels
      .sort((a, b) => a.position - b.position)
      .first(23)
      .map(c =>
        new StringSelectMenuOptionBuilder()
          .setLabel('#' + c.name.slice(0, 95))
          .setDescription('Nachrichten aus diesem Kanal sichern')
          .setValue(c.id)
      ),
  ];

  const select = new StringSelectMenuBuilder()
    .setCustomId('backup_channel_select')
    .setPlaceholder('Kanaele auswaehlen...')
    .setMinValues(1)
    .setMaxValues(Math.min(options.length, 25))
    .addOptions(options);

  pendingBackupGuilds.set(interaction.user.id, guild);

  await interaction.editReply({
    content:
      'Aus welchen Kanaelen sollen Nachrichten gesichert werden?\n' +
      'Du kannst mehrere auswaehlen. Dann auf Senden klicken.',
    components: [new ActionRowBuilder().addComponents(select)],
  });
}

export async function doBackup(interaction, guild, selectedChannelIds) {
  await interaction.editReply({ content: 'Backup wird erstellt...', components: [] });

  try {
    // â”€â”€ Rollen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const roles = [];
    for (const r of guild.roles.cache
      .filter(r2 => !r2.managed && r2.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .values()
    ) {
      roles.push({
        id:          r.id,
        name:        r.name,
        color:       r.color,
        hoist:       r.hoist,
        mentionable: r.mentionable,
        permissions: r.permissions.bitfield.toString(),
        position:    r.position,
        icon:        r.icon ?? null,
        unicodeEmoji: r.unicodeEmoji ?? null,
      });
    }

    // Rollen-ID -> Name Map fuer Nachrichten-Mentions
    const roleNameMap = {};
    guild.roles.cache.forEach(r => { roleNameMap[r.id] = r.name; });

    // â”€â”€ Kanaele â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const channels = [];
    for (const channel of guild.channels.cache
      .sort((a, b) => a.position - b.position)
      .values()
    ) {
      // Alle Permission-Overwrites exakt kopieren
      const overwrites = [];
      if (channel.permissionOverwrites?.cache) {
        for (const o of channel.permissionOverwrites.cache.values()) {
          overwrites.push({
            id:    o.id,
            type:  o.type,   // 0 = Rolle, 1 = Mitglied
            allow: o.allow.bitfield.toString(),
            deny:  o.deny.bitfield.toString(),
          });
        }
      }

      const entry = {
        id:           channel.id,
        name:         channel.name,
        type:         channel.type,
        position:     channel.position,
        parentId:     channel.parentId ?? null,
        parentName:   channel.parent?.name ?? null,
        topic:        channel.topic ?? null,
        nsfw:         channel.nsfw ?? false,
        bitrate:      channel.bitrate ?? null,
        userLimit:    channel.userLimit ?? null,
        rateLimitPerUser: channel.rateLimitPerUser ?? null,
        overwrites,
        messages: [],
      };

      // Nachrichten nur aus ausgewaehlten Kanaelen
      const backupMessages =
        selectedChannelIds.has('__ALL__') ||
        selectedChannelIds.has(channel.id);

      if (backupMessages && channel.isTextBased() && !channel.isThread()) {
        try {
          let lastId;
          let fetched;
          do {
            fetched = await channel.messages.fetch({
              limit: 100,
              ...(lastId ? { before: lastId } : {}),
            });
            for (const m of fetched.values()) {
              // Rollen-Mentions im Inhalt durch Namen ersetzen (fuer spaetere Wiederherstellung)
              const contentFixed = m.content.replace(/<@&(d+)>/g, (match, id) => {
                const name = roleNameMap[id];
                return name ? '@' + name : match;
              });
              entry.messages.push({
                author:      m.author.tag,
                content:     contentFixed,
                createdAt:   m.createdAt.toISOString(),
                attachments: [...m.attachments.values()].map(a => ({ name: a.name, url: a.url })),
              });
            }
            lastId = fetched.last()?.id;
          } while (fetched.size === 100);
        } catch { /* Kanal nicht lesbar */ }
      }

      channels.push(entry);
    }

    const iconURL = guild.iconURL({ size: 4096, extension: 'png' }) ?? null;
    const backupId = guild.id + '-' + Date.now();
    const backup = {
      backupId,
      serverName: guild.name,
      serverIcon: iconURL,
      createdAt:  new Date().toISOString(),
      createdBy:  interaction.user.tag,
      roleNameMap,
      roles,
      channels,
    };

    const { saveBackup } = await import('./storage.js');
    saveBackup(backupId, backup);

    const msgCount = channels.reduce((s, c) => s + c.messages.length, 0);
    await interaction.editReply(
      'Backup erfolgreich erstellt!\n' +
      'ID: ' + backupId + '\n' +
      'Kanaele: ' + channels.length + '\n' +
      'Rollen: ' + roles.length + '\n' +
      'Nachrichten: ' + msgCount
    );
  } catch (err) {
    console.error('[BACKUP FEHLER]', err);
    await interaction.editReply('Backup fehlgeschlagen. Pruefe die Bot-Berechtigungen.');
  }
}
