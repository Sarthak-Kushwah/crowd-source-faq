/**
 * bot/commands/ask.ts — /ask <question>
 *
 * Public. Calls POST {PUBLIC_URL}/api/ask-ai with the
 * question, returns the AI's answer as a Discord embed
 * with a citation footer showing which FAQs / knowledge
 * base entries the answer was sourced from.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import type { BotConfig } from '../discordBot.js';

export const askCommandData = new SlashCommandBuilder()
  .setName('ask')
  .setDescription('Ask the Yaksha knowledge base a question')
  .addStringOption((o) =>
    o.setName('question')
      .setDescription('Your question in plain English')
      .setRequired(true)
      .setMaxLength(500)
  )
  .toJSON();

export async function executeAsk(
  interaction: ChatInputCommandInteraction,
  config: BotConfig
): Promise<void> {
  const question = interaction.options.getString('question', true);
  // Don't make Discord wait longer than ~10s. We set ephemeral
  // early so the user sees a "thinking" state.
  await interaction.deferReply({ ephemeral: true });

  let answer = '(no answer)';
  let sources: { title: string; source: string }[] = [];
  try {
    const res = await fetch(`${config.publicUrl}/api/ask-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: question, topK: 3 }),
    });
    if (res.ok) {
      const data = await res.json() as { answer?: string; sources?: { title: string; source: string }[] };
      answer = (data.answer ?? '').trim() || '(no answer)';
      sources = data.sources ?? [];
    } else {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    await interaction.followUp({
      embeds: [errorEmbed(`/ask failed: ${(err as Error).message}`)],
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Yaksha says:')
    .setDescription(answer.slice(0, 3500))
    .setFooter({ text: `Q: ${question.slice(0, 80)}${question.length > 80 ? '…' : ''}` })
    .setTimestamp(new Date());
  if (sources.length > 0) {
    embed.addFields({
      name: 'Sources',
      value: sources
        .slice(0, 5)
        .map((s: { title: string; source: string }, i: number) => `${i + 1}. **${s.title.slice(0, 80)}** _(${s.source})_`)
        .join('\n')
        .slice(0, 1024),
    });
  }
  await interaction.followUp({ embeds: [embed] });
}

function errorEmbed(msg: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xff6b6b)
    .setTitle('Error')
    .setDescription(msg.slice(0, 1000));
}
