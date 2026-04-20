import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
} from 'discord.js';
import { listBackups } from '../utils/storage.js';

export const listCommand = new SlashCommandBuilder()
  .setName('list')
  .setDescription('Zeigt alle Backups an und lässt dich eines laden')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .toJSON();

export async function handleList(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ Du brauchst Admin-Rechte.', ephemeral: true });
  }

  const backups = listBackups();

  if (backups.length === 0) {
    return interaction.reply({ content: '📭 Keine Backups vorhanden. Erstelle zuerst eines mit `/backup`.', ephemeral: true });
  }

  const options = backups.slice(0, 25).map(b =>
    new StringSelectMenuOptionBuilder()
      .setLabel(b.name.slice(0, 100))
      .setDescription(`${new Date(b.createdAt).toLocaleString('de-DE')} | ${b.channelCount} Kanäle | ${b.roleCount} Rollen | ${b.msgCount} Nachrichten`)
      .setValue(b.id)
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId('backup_select')
    .setPlaceholder('Backup auswählen…')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);

  await interaction.reply({
    content: '📋 **Wähle ein Backup zum Laden aus:**\n⚠️ Das aktuelle Laden überschreibt Rollen und Kanäle auf diesem Server!',
    components: [row],
    ephemeral: true,
  });
}
