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
  .setDescription('Erstellt ein vollst\u{E4}ndiges Backup dieses Servers')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .toJSON();

// Zwischenspeicher: userId -> guild
export const pendingBackupGuilds = new Map();

export async function handleBackup(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '\u{274C} Du brauchst Admin-Rechte.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;

  const textChannels = guild.channels.cache.filter(
    c => c.isTextBased() && !c.isThread() && c.type !== ChannelType.GuildCategory
  );

  if (textChannels.size === 0) {
    await doBackup(interaction, guild, new Set());
    return;
  }

  const options = [
    new StringSelectMenuOptionBuilder()
      .setLabel('Alle Kan\u{E4}le')
      .setDescription('Nachrichten aus ALLEN Textkan\u{E4}len sichern')
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
    .setPlaceholder('Kan\u{E4}le ausw\u{E4}hlen...')
    .setMinValues(1)
    .setMaxValues(Math.min(options.length, 25))
    .addOptions(options);

  pendingBackupGuilds.set(interaction.user.id, guild);

  await interaction.editReply({
    content: '\u{23F3} Aus welchen Kan\u{E4}len sollen Nachrichten gesichert werden?\nMehrere Kan\u{E4}le m\u{F6}glich.',
    components: [new ActionRowBuilder().addComponents(select)],
  });
}

export async function doBackup(interaction, guild, selectedChannelIds) {
  await interaction.editReply({ content: '\u{23F3} Backup wird erstellt...', components: [] });

  try {
    // Rollen (inkl. @everyone)
    const everyoneRole = guild.roles.everyone;
    const everyonePermissions = everyoneRole.permissions.bitfield.toString();

    const roles = [];
    for (const r of guild.roles.cache
      .filter(r2 => !r2.managed && r2.id !== guild.id)
      .sort((a, b) => a.position - b.position)
      .values()
    ) {
      roles.push({
        id:           r.id,
        name:         r.name,
        color:        r.color,
        hoist:        r.hoist,
        mentionable:  r.mentionable,
        permissions:  r.permissions.bitfield.toString(),
        position:     r.position,
      });
    }

    // Rollen-ID -> Name Map (f\u{FC}r Mention-Ersatz)
    const roleNameMap = {};
    guild.roles.cache.forEach(r => { roleNameMap[r.id] = r.name; });

    // Kan\u{E4}le
    const channels = [];
    for (const channel of guild.channels.cache
      .sort((a, b) => a.position - b.position)
      .values()
    ) {
      const overwrites = [];
      if (channel.permissionOverwrites?.cache) {
        for (const o of channel.permissionOverwrites.cache.values()) {
          overwrites.push({
            id:    o.id,
            type:  o.type,
            allow: o.allow.bitfield.toString(),
            deny:  o.deny.bitfield.toString(),
          });
        }
      }

      const entry = {
        id:               channel.id,
        name:             channel.name,
        type:             channel.type,
        position:         channel.position,
        parentId:         channel.parentId ?? null,
        parentName:       channel.parent?.name ?? null,
        topic:            channel.topic ?? null,
        nsfw:             channel.nsfw ?? false,
        bitrate:          channel.bitrate ?? null,
        userLimit:        channel.userLimit ?? null,
        rateLimitPerUser: channel.rateLimitPerUser ?? null,
        overwrites,
        messages: [],
      };

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
              const contentFixed = m.content.replace(/<@&(\d+)>/g, (match, id) => {
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

    const iconURL  = guild.iconURL({ size: 4096, extension: 'png' }) ?? null;
    const backupId = guild.id + '-' + Date.now();

    const { saveBackup } = await import('./storage.js');
    saveBackup(backupId, {
      backupId,
      serverName:          guild.name,
      serverIcon:          iconURL,
      createdAt:           new Date().toISOString(),
      createdBy:           interaction.user.tag,
      everyonePermissions,
      roleNameMap,
      roles,
      channels,
    });

    const msgCount = channels.reduce((s, c) => s + c.messages.length, 0);
    await interaction.editReply(
      '\u{2705} **Backup erfolgreich erstellt!**\n' +
      '\u{1F194} ID: ' + backupId + '\n' +
      '\u{1F4C1} Kan\u{E4}le: **' + channels.length + '**\n' +
      '\u{1F3AD} Rollen: **' + roles.length + '**\n' +
      '\u{1F4AC} Nachrichten: **' + msgCount + '**'
    );
  } catch (err) {
    console.error('[BACKUP FEHLER]', err);
    await interaction.editReply('\u{274C} Backup fehlgeschlagen. Pr\u{FC}fe die Bot-Berechtigungen.');
  }
}
