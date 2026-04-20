import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { saveBackup } from './storage.js';

export const backupCommand = new SlashCommandBuilder()
  .setName('backup')
  .setDescription('Erstellt ein vollstaendiges Backup dieses Servers')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .toJSON();

export async function handleBackup(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: 'âŒ Du brauchst Admin-Rechte.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;

  try {
    await interaction.editReply('â³ Backup wird erstellt...');

    const roles = guild.roles.cache
      .filter(r => !r.managed && r.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map(r => ({
        name:        r.name,
        color:       r.color,
        hoist:       r.hoist,
        mentionable: r.mentionable,
        permissions: r.permissions.bitfield.toString(),
        position:    r.position,
      }));

    const channels = [];
    for (const channel of guild.channels.cache.values()) {
      const overwrites = channel.permissionOverwrites?.cache.map(o => ({
        id:    o.id,
        type:  o.type,
        allow: o.allow.bitfield.toString(),
        deny:  o.deny.bitfield.toString(),
      })) ?? [];

      const entry = {
        name:       channel.name,
        type:       channel.type,
        position:   channel.position,
        parentName: channel.parent?.name ?? null,
        topic:      channel.topic ?? null,
        nsfw:       channel.nsfw ?? false,
        bitrate:    channel.bitrate ?? null,
        userLimit:  channel.userLimit ?? null,
        overwrites,
        messages:   [],
      };

      if (channel.isTextBased() && !channel.isThread()) {
        try {
          let lastId;
          let fetched;
          do {
            fetched = await channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
            fetched.forEach(m => {
              entry.messages.push({
                author:      m.author.tag,
                content:     m.content,
                createdAt:   m.createdAt.toISOString(),
                attachments: [...m.attachments.values()].map(a => ({ name: a.name, url: a.url })),
              });
            });
            lastId = fetched.last()?.id;
          } while (fetched.size === 100);
        } catch { /* Kanal nicht lesbar */ }
      }

      channels.push(entry);
    }

    const iconURL = guild.iconURL({ size: 4096 }) ?? null;
    const backupId = guild.id + '-' + Date.now();
    const backup = {
      backupId,
      serverName: guild.name,
      serverIcon: iconURL,
      createdAt:  new Date().toISOString(),
      createdBy:  interaction.user.tag,
      roles,
      channels,
    };

    saveBackup(backupId, backup);

    const msgCount = channels.reduce((s, c) => s + c.messages.length, 0);
    await interaction.editReply(
      'âœ… **Backup erfolgreich erstellt!**\n' +
      'ðŸ†” ID: `' + backupId + '`\n' +
      'ðŸ“ KanÃ¤le: **' + channels.length + '**\n' +
      'ðŸŽ­ Rollen: **' + roles.length + '**\n' +
      'ðŸ’¬ Nachrichten: **' + msgCount + '**'
    );
  } catch (err) {
    console.error('[BACKUP FEHLER]', err);
    await interaction.editReply('âŒ Backup fehlgeschlagen. Pruefe die Bot-Berechtigungen.');
  }
}
