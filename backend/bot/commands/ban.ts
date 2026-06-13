/**
 * bot/commands/ban.ts — /ban <user_id_or_email> <reason>
 *
 * Admin. Calls POST {PUBLIC_URL}/api/admin/users/ban with
 * the user identifier and reason. The endpoint already
 * exists (referenced in authController) and produces a
 * structured ALERT log + a Notification row for the
 * affected user.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../events/interactionCreate.js';
import { logger } from '../../utils/http/logger.js';
import type { BotConfig } from '../discordBot.js';

export const banCommandData = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('[admin] Ban a user (by id or email)')
  .addStringOption((o) =>
    o.setName('user')
      .setDescription('User id (Mongo _id) or email address')
      .setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('reason')
      .setDescription('Reason for the ban (logged + shown to user)')
      .setRequired(true)
      .setMaxLength(300)
  )
  .toJSON();

export async function executeBan(
  interaction: ChatInputCommandInteraction,
  config: BotConfig
): Promise<void> {
  if (!isAdmin(interaction, config)) {
    await interaction.reply({ content: '🔒 admin only', ephemeral: true });
    return;
  }
  if (!config.internalApiKey) {
    await interaction.reply({ embeds: [errorEmbed('INTERNAL_API_KEY not set')], ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });

  const user = interaction.options.getString('user', true).trim();
  const reason = interaction.options.getString('reason', true);

  try {
    const res = await fetch(`${config.publicUrl}/api/admin/users/ban`, {
      method: 'POST',
      headers: { 'X-Internal-API-Key': config.internalApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, reason, bannedBy: interaction.user.tag }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    logger.error(`[bot] /ban failed: ${(err as Error).message}`);
    await interaction.followUp({ embeds: [errorEmbed(`/ban failed: ${(err as Error).message}`)] });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('User banned')
    .addFields(
      { name: 'User', value: user },
      { name: 'Banned by', value: `<@${interaction.user.id}>` },
      { name: 'Reason', value: reason.slice(0, 500) },
    )
    .setTimestamp(new Date());
  await interaction.followUp({ embeds: [embed] });
}

function errorEmbed(msg: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xff6b6b)
    .setTitle('Error')
    .setDescription(msg.slice(0, 1000));
}
