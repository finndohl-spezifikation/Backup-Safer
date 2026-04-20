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
  .setDescription('Zeigt alle Backups an und laesst dich eines laden')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .toJSON();

export async function handleList(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '\u274C Du brauchst Admin-Rechte.', ephemeral: true });
  }

  const backups = listBackups();

  if (backups.length === 0) {
    return interaction.reply({
      content: '\uD83D\uDCED Keine Backups vorhanden. Erstelle zuerst eines mit /backup.',
      ephemeral: true,
    });
  }

  const options = backups.slice(0, 25).map(b =>
    new StringSelectMenuOptionBuilder()
      .setLabel(b.name.slice(0, 100))
      .setDescription(
        new Date(b.createdAt).toLocaleString('de-DE') +
        ' | ' + b.channelCount + ' Kanaele | ' +
        b.roleCount + ' Rollen | ' +
        b.msgCount + ' Nachrichten'
      )
      .setValue(b.id)
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId('backup_select')
    .setPlaceholder('Backup auswaehlen...')
    .addOptions(options);

  await interaction.reply({
    content:
      '\uD83D\uDCCB **Waehle ein Backup zum Laden aus:**\n' +
      '\u26A0\uFE0F Alle bestehenden Kanaele und Rollen werden ueberschrieben!',
    components: [new ActionRowBuilder().addComponents(select)],
    ephemeral: true,
  });
}
