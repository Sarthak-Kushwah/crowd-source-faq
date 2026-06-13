/**
 * bot/events/interactionCreate.ts — single dispatch point for
 * all slash commands. The dispatcher is intentionally tiny:
 * the heavy lifting is in the per-command execute* files
 * under ./commands/.
 */

import { Interaction, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/http/logger.js';
import type { BotConfig } from '../discordBot.js';
import { executeAsk } from '../commands/ask.js';
import { executeSearch } from '../commands/search.js';
import { executeStatus } from '../commands/status.js';
import { executeHelp } from '../commands/help.js';
import { executeTickets } from '../commands/tickets.js';
import { executeResolve } from '../commands/resolve.js';
import { executeBan } from '../commands/ban.js';
import { executeBroadcast } from '../commands/broadcast.js';

export async function handleInteraction(
  interaction: Interaction,
  config: BotConfig
): Promise<void> {
  // We only handle ChatInputCommand (slash) interactions. Other
  // interaction types (autocomplete, modal submit, button
  // click) aren't used yet.
  if (!interaction.isChatInputCommand()) return;
  const cmd = interaction as ChatInputCommandInteraction;

  try {
    switch (cmd.commandName) {
      case 'ask':       return await executeAsk(cmd, config);
      case 'search':    return await executeSearch(cmd, config);
      case 'status':    return await executeStatus(cmd, config);
      case 'help':      return await executeHelp(cmd, config);
      case 'tickets':   return await executeTickets(cmd, config);
      case 'resolve':   return await executeResolve(cmd, config);
      case 'ban':       return await executeBan(cmd, config);
      case 'broadcast': return await executeBroadcast(cmd, config);
      default:
        await cmd.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xff6b6b)
            .setTitle('Unknown command')
            .setDescription(`\`/${cmd.commandName}\` isn't registered. Try \`/help\`.`)],
          ephemeral: true,
        });
    }
  } catch (err) {
    logger.error(`[bot] /${cmd.commandName} threw: ${(err as Error).message}`);
    // Best-effort error reply (the interaction may have been
    // already-replied-to or deferred; the discord.js lib
    // throws specific errors in that case which we swallow).
    try {
      const msg = `Something went wrong: \`${(err as Error).message}\``;
      if (cmd.deferred || cmd.replied) {
        await cmd.followUp({ content: msg, ephemeral: true });
      } else {
        await cmd.reply({ content: msg, ephemeral: true });
      }
    } catch {
      // give up
    }
  }
}

export function isAdmin(interaction: ChatInputCommandInteraction, config: BotConfig): boolean {
  if (config.adminUserIds.length === 0) return false;
  return config.adminUserIds.includes(interaction.user.id);
}
