import { ArenaReport } from "../types.js";

export class MarkdownArenaReporter {
  public static render(report: ArenaReport): string {
    const lines: string[] = [];
    const {
      tournamentId,
      mode,
      timestamp,
      totalMatches,
      scenariosCount,
      candidatesCount,
      leaderboard,
      crossTable,
      matches,
      topPerformer,
    } = report;

    lines.push(`# Multi-Agent Tournament Arena Report`);
    lines.push("");
    lines.push(`- **Tournament ID:** \`${tournamentId}\``);
    lines.push(`- **Tournament Mode:** \`${mode.toUpperCase()}\``);
    lines.push(`- **Timestamp:** \`${timestamp}\``);
    lines.push(`- **Candidates Count:** ${candidatesCount}`);
    lines.push(`- **Scenarios Evaluated:** ${scenariosCount}`);
    lines.push(`- **Total Matches:** ${totalMatches}`);
    lines.push(`- **Top Performer:** 🥇 **${topPerformer.name}** (\`${topPerformer.candidateId}\`) — Rating: **${topPerformer.rating}**`);
    lines.push("");

    // Leaderboard Table
    lines.push(`## 🏆 Leaderboard & Standings`);
    lines.push("");
    lines.push(`| Rank | Candidate | Rating | W-D-L | Win Rate | Success Rate | Avg Turns | Avg Tokens | Avg Duration | Score |`);
    lines.push(`| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |`);

    const medalIcons = ["🥇", "🥈", "🥉"];

    for (const st of leaderboard) {
      const medal = medalIcons[st.rank - 1] ?? `#${st.rank}`;
      lines.push(
        `| ${medal} | **${st.name}** (\`${st.candidateId}\`) | **${st.rating}** | ${st.wins}-${st.draws}-${st.losses} | ${(st.winRate * 100).toFixed(1)}% | ${(st.taskSuccessRate * 100).toFixed(1)}% | ${st.avgTurns.toFixed(1)} | ${st.avgTokens} | ${st.avgDurationMs}ms | ${(st.avgCompositeScore * 100).toFixed(1)} |`
      );
    }

    lines.push("");

    // Cross-Table Matrix
    lines.push(`## ⚔ Head-to-Head Cross Table`);
    lines.push("");
    const candIds = leaderboard.map((l) => l.candidateId);
    lines.push(`| Candidate | ${candIds.map((id) => `\`${id}\``).join(" | ")} |`);
    lines.push(`| :--- | ${candIds.map(() => ":---:").join(" | ")} |`);

    for (const rowId of candIds) {
      const cells: string[] = [];
      for (const colId of candIds) {
        if (rowId === colId) {
          cells.push("-");
        } else {
          const rec = crossTable[rowId]?.[colId];
          if (!rec || rec.matchCount === 0) {
            cells.push("N/A");
          } else {
            cells.push(`${rec.wins}/${rec.draws}/${rec.losses}`);
          }
        }
      }
      lines.push(`| \`${rowId}\` | ${cells.join(" | ")} |`);
    }

    lines.push("");

    // Match Log Summary
    if (matches.length > 0) {
      lines.push(`## 📝 Match Logs (Sample)`);
      lines.push("");
      lines.push(`| Match ID | Round | Scenario | Matchup | Outcome | Score | Delta (A / B) | Reason |`);
      lines.push(`| :---: | :---: | :--- | :--- | :---: | :---: | :---: | :--- |`);

      const displayMatches = matches.slice(0, 20);
      for (const m of displayMatches) {
        const deltaA = m.ratingDeltaA >= 0 ? `+${m.ratingDeltaA}` : `${m.ratingDeltaA}`;
        const deltaB = m.ratingDeltaB >= 0 ? `+${m.ratingDeltaB}` : `${m.ratingDeltaB}`;
        lines.push(
          `| \`${m.matchId}\` | ${m.round} | \`${m.scenarioId}\` | \`${m.candidateAId}\` vs \`${m.candidateBId}\` | **${m.outcome.toUpperCase()}** | ${m.scoreA}-${m.scoreB} | ${deltaA} / ${deltaB} | ${m.reason} |`
        );
      }
      lines.push("");
    }

    return lines.join("\n");
  }
}
