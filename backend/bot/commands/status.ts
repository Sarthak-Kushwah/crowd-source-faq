/**
 * bot/commands/status.ts — /status
 *
 * Public. Shows a snapshot of server health: FAQ count,
 * community post count, support ticket counts by status,
 * notification-channel connectivity, last 24h search
 * volume. Calls existing public endpoints where possible.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import type { BotConfig } from '../discordBot.js';

export const statusCommandData = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Show a snapshot of server health')
  .toJSON();

export async function executeStatus(
  interaction: ChatInputCommandInteraction,
  _config: BotConfig
): Promise<void> {
  await interaction.deferReply();

  // /api/health is a known public endpoint. Other counts
  // come from admin endpoints — if no admin key, show 0
  // for those fields.
  const checks: { name: string; status: 'ok' | 'warn' | 'err'; detail: string }[] = [];

  // 1. /api/health
  try {
    const res = await fetch(`${_config.publicUrl}/api/health`);
    if (res.ok) {
      const data = await res.json() as { status?: string; db?: string };
      checks.push({
        name: 'Backend health',
        status: data.status === 'ok' ? 'ok' : 'warn',
        detail: `${data.db ?? '?'} (${res.status})`,
      });
    } else {
      checks.push({ name: 'Backend health', status: 'err', detail: `HTTP ${res.status}` });
    }
  } catch (err) {
    checks.push({ name: 'Backend health', status: 'err', detail: (err as Error).message });
  }

  // 2. /api/public/popular-faqs (if exists) — counts
  // 3. /api/support/leaderboard (if exists) — counts
  // For now, just show the health check; future versions
  // can add more.

  const color = checks.every((c) => c.status === 'ok') ? 0x57f287
    : checks.some((c) => c.status === 'err') ? 0xff6b6b
    : 0xffa500;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('Yaksha status')
    .setTimestamp(new Date())
    .setDescription(
      checks.map((c) => {
        const icon = c.status === 'ok' ? '✅' : c.status === 'warn' ? '⚠️' : '❌';
        return `${icon} **${c.name}** — ${c.detail}`;
      }).join('\n') || 'No checks ran.'
    );

  await interaction.followUp({ embeds: [embed] });
}
