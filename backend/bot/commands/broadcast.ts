/**
 * bot/commands/broadcast.ts — /broadcast <message>
 *
 * Admin. Posts a message to the configured notification
 * channel. Use sparingly (e.g. planned downtime
 * announcements). The bot also tags the calling admin
 * so it's clear who sent it.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../events/interactionCreate.js';
import { logger } from '../../utils/http/logger.js';
import type { BotConfig } from '../discordBot.js';

export const broadcastCommandData = new SlashCommandBuilder()
  .setName('broadcast')
  .setDescription('[admin] Post an announcement to the notification channel')
  .addStringOption((o) =>
    o.setName('message')
      .setDescription('The message to post')
      .setRequired(true)
      .setMaxLength(2000)
  )
  .toJSON();

export async function executeBroadcast(
  interaction: ChatInputCommandInteraction,
  config: BotConfig
): Promise<void> {
  if (!isAdmin(interaction, config)) {
    await interaction.reply({ content: '🔒 admin only', ephemeral: true });
    return;
  }
  if (!config.notificationChannelId) {
    await interaction.reply({
      embeds: [errorEmbed('DISCORD_NOTIFICATION_CHANNEL_ID not set in .env')],
      ephemeral: true,
    });
    return;
  }
  await interaction.deferReply({ ephemeral: true });

  const message = interaction.options.getString('message', true);
  const { getDiscordClient } = await import('../discordBot.js');
  const client = getDiscordClient();
  if (!client) {
    await interaction.followUp({ embeds: [errorEmbed('Bot not connected')] });
    return;
  }
  try {
    const channel = await client.channels.fetch(config.notificationChannelId);
    if (!channel || !channel.isTextBased() || !('send' in channel)) {
      throw new Error(`Channel ${config.notificationChannelId} is not a text channel`);
    }
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📣 Announcement')
      .setDescription(message)
      .setFooter({ text: `Posted by ${interaction.user.tag}` })
      .setTimestamp(new Date());
    await channel.send({ embeds: [embed] });
  } catch (err) {
    logger.error(`[bot] /broadcast failed: ${(err as Error).message}`);
    await interaction.followUp({ embeds: [errorEmbed(`/broadcast failed: ${(err as Error).message}`)] });
    return;
  }
  await interaction.followUp({
    embeds: [new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('Broadcast sent')
      .setDescription(`Posted to <#${config.notificationChannelId}>`)],
  });
}

function errorEmbed(msg: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xff6b6b)
    .setTitle('Error')
    .setDescription(msg.slice(0, 1000));
}
