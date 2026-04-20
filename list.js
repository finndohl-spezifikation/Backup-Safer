import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
} from 'discord.js';
import { listBackups } from './storage.js';

export const listCommand = new SlashCommandBuilder()
  .setName('list')
  .setDescription('Zeigt alle Backups an und lÃ¤sst dich eines laden')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .toJSON();

export async function handleList(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: 'âŒ Du brauchst Admin-Rechte.', ephemeral: true });
  }

  const backups = listBackups();

  if (backups.length === 0) {
    return interaction.reply({
      content: 'ðŸ“­ Keine Backups vorhanden. Erstelle zuerst eines mit /backup.',
      ephemeral: true,
    });
  }

  const options = backups.slice(0, 25).map(b => {
    const label = (b.name ?? 'Backup ' + b.id).slice(0, 100);
    const date  = b.createdAt ? new Date(b.createdAt).toLocaleString('de-DE') : '?';
    const desc  = (date + ' | ' + b.channelCount + ' KanÃ¤le | ' + b.roleCount + ' Rollen | ' + b.msgCount + ' Nachrichten').slice(0, 100);
    return new StringSelectMenuOptionBuilder()
      .setLabel(label)
      .setDescription(desc)
      .setValue(b.id);
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId('backup_select')
    .setPlaceholder('Backup auswÃ¤hlen...')
    .addOptions(options);

  await interaction.reply({
    content:
      'ðŸ“‹ **WÃ¤hle ein Backup zum Laden aus:**\n' +
      'âš ï¸ Alle bestehenden KanÃ¤le und Rollen werden Ã¼berschrieben!',
    components: [new ActionRowBuilder().addComponents(select)],
    ephemeral: true,
  });
}
