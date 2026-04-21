import 'dotenv/config';
import { Client, Events, GatewayIntentBits, Partials, Collection } from 'discord.js';
import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTicketService } from './src/services/ticketService.js';
import { startWebServer } from './src/web/server.js';
import { Ticket } from './src/models/ticketPanel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args)
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.GuildMember, Partials.Channel, Partials.Message]
});

client.commands = new Collection();
const PREFIX = process.env.PREFIX || "-";

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function bootstrap() {
  const DISCORD_TOKEN = requireEnv("DISCORD_TOKEN");
  const MONGO_URI = requireEnv("MONGO_URI");

  await mongoose.connect(MONGO_URI);
  logger.info("Connected to MongoDB");

  const ticketService = createTicketService({ client, logger });

  const commandsPath = path.join(__dirname, 'src', 'commands');
  if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const fileUrl = `file://${filePath.replace(/\\/g, '/')}`;
      try {
        const { default: command } = await import(fileUrl);
        const name = command.name || file.split('.')[0];
        if (command) {
          client.commands.set(name, command);
          if (command.aliases) {
            command.aliases.forEach(alias => client.commands.set(alias, command));
          }
        }
      } catch (err) {
        logger.error(`فشل تحميل ${file}:`, err);
      }
    }
  }

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot && message.channel.name.startsWith('ticket-')) {
      if (message.content.includes("مقبولة من قبل:")) {
        const mentionMatch = message.content.match(/<@!?(\d+)>/);
        if (mentionMatch) {
          const claimerId = mentionMatch[1];
          try {
            await Ticket.updateOne(
              { channelId: message.channel.id },
              { $set: { claimedBy: claimerId } }
            );
            logger.info(`تم تحديث المستلم من رسالة البوت: ${claimerId}`);
          } catch (err) {
            logger.error("فشل تحديث المستلم تلقائياً:", err);
          }
        }
      }
    }

    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.get(commandName);
    if (!command) return;

    try {
      await command.execute(message, args, { ticketService });
    } catch (error) {
      logger.error(`خطأ في تنفيذ ${commandName}:`, error);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isStringSelectMenu() && interaction.customId.startsWith('ticket-panel:')) {
        await ticketService.handleSelectInteraction(interaction);
      } else if (interaction.isButton()) {
        await ticketService.handleTicketButton(interaction);
      }
    } catch (error) {
        logger.error('Interaction Error', error);
    }
  });

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || "0.0.0.0";
  await startWebServer({ client, logger, ticketService, port, host });
  await client.login(DISCORD_TOKEN);
}

bootstrap().catch(err => logger.error(err));
