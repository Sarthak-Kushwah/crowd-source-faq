/**
 * bot/commands/resolve.ts — /resolve <ticket_id> <note>
 *
 * Admin. Calls PATCH {PUBLIC_URL}/api/admin/support/requests/:id
 * to mark a support ticket resolved. The note goes into
 * the resolution. Triggers a notification-channel post.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../events/interactionCreate.js';
import { logger } from '../../utils/http/logger.js';
import type { BotConfig } from '../discordBot.js';

export const resolveCommandData = new SlashCommandBuilder()
  .setName('resolve')
  .setDescription('[admin] Mark a support ticket as resolved')
  .addStringOption((o) =>
    o.setName('ticket_id')
      .setDescription('The Mongo _id of the ticket (from /tickets)')
      .setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('note')
      .setDescription('Resolution note (visible to the user)')
      .setRequired(true)
      .setMaxLength(500)
  )
  .toJSON();

export async function executeResolve(
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

  const ticketId = interaction.options.getString('ticket_id', true).trim();
  const note = interaction.options.getString('note', true);

  try {
    const res = await fetch(
      `${config.publicUrl}/api/admin/support/requests/${encodeURIComponent(ticketId)}`,
      {
        method: 'PATCH',
        headers: { 'X-Internal-API-Key': config.internalApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved', resolutionNote: note, resolvedBy: interaction.user.tag }),
      }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    logger.error(`[bot] /resolve failed: ${(err as Error).message}`);
    await interaction.followUp({ embeds: [errorEmbed(`/resolve failed: ${(err as Error).message}`)] });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('Ticket resolved')
    .addFields(
      { name: 'Ticket', value: `\`${ticketId}\`` },
      { name: 'Resolved by', value: `<@${interaction.user.id}>` },
      { name: 'Note', value: note.slice(0, 500) },
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
