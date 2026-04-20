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
  .setDescription('Zeigt alle Backups an \u{2013} laden oder l\u{F6}schen')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .toJSON();

export async function handleList(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '\u{274C} Du brauchst Admin-Rechte.', ephemeral: true });
  }

  const backups = listBackups();

  if (backups.length === 0) {
    return interaction.reply({
      content: '\u{1F4ED} Keine Backups vorhanden. Erstelle zuerst eines mit /backup.',
      ephemeral: true,
    });
  }

  const options = backups.slice(0, 25).map(b => {
    const label = (b.name ?? 'Backup ' + b.id).slice(0, 100);
    const date  = b.createdAt ? new Date(b.createdAt).toLocaleString('de-DE') : '?';
    const desc  = (date + ' | ' + b.channelCount + ' Kan\u{E4}le | ' + b.roleCount + ' Rollen | ' + b.msgCount + ' Nachrichten').slice(0, 100);
    return new StringSelectMenuOptionBuilder()
      .setLabel(label)
      .setDescription(desc)
      .setValue(b.id);
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId('backup_select')
    .setPlaceholder('Backup ausw\u{E4}hlen...')
    .addOptions(options);

  await interaction.reply({
    content:
      '\u{1F4CB} **W\u{E4}hle ein Backup zum Laden aus:**\n' +
      '\u{26A0}\u{FE0F} Alle bestehenden Kan\u{E4}le und Rollen werden \u{FC}berschrieben!',
    components: [new ActionRowBuilder().addComponents(select)],
    ephemeral: true,
  });
}
