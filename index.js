import { Client, GatewayIntentBits, Partials, REST, Routes, Collection } from 'discord.js';
import { backupCommand, handleBackup } from './backup.js';
import { listCommand, handleList } from './list.js';
import { handleSelectMenu, handleButton } from './interactionHandler.js';

const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN)     { console.error('[FEHLER] DISCORD_TOKEN fehlt!'); process.exit(1); }
if (!CLIENT_ID) { console.error('[FEHLER] CLIENT_ID fehlt!');     process.exit(1); }

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.commands = new Collection();
client.commands.set('backup', { execute: handleBackup });
client.commands.set('list',   { execute: handleList });

client.once('ready', async () => {
  console.log('[READY] Eingeloggt als ' + client.user.tag);
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [backupCommand, listCommand] });
    console.log('[OK] Slash-Befehle registriert!');
  } catch (err) {
    console.error('[FEHLER] Befehle:', err);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) await cmd.execute(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    }
  } catch (err) {
    console.error('[FEHLER] Interaction:', err);
    const msg = { content: 'âŒ Ein Fehler ist aufgetreten.', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
    else await interaction.reply(msg).catch(() => {});
  }
});

client.login(TOKEN);
