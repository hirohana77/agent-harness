import chalk from "chalk";
import { ArenaReport } from "../types.js";

export class TerminalArenaReporter {
  public static render(report: ArenaReport): string {
    const lines: string[] = [];
    const {
      tournamentId,
      mode,
      totalMatches,
      scenariosCount,
      candidatesCount,
      leaderboard,
      crossTable,
      topPerformer,
    } = report;

    lines.push("");
    lines.push(chalk.bold("════════════════════════════════════════════════════════════════════"));
    lines.push(chalk.bold(`  MULTI-AGENT TOURNAMENT ARENA REPORT: ${chalk.cyan(tournamentId)}`));
    lines.push(chalk.bold("════════════════════════════════════════════════════════════════════"));
    lines.push(`Mode:                 ${chalk.magenta.bold(mode.toUpperCase())}`);
    lines.push(`Total Candidates:     ${chalk.bold(candidatesCount)}`);
    lines.push(`Scenarios Tested:     ${chalk.bold(scenariosCount)}`);
    lines.push(`Total Matches:        ${chalk.bold(totalMatches)}`);
    lines.push(`Top Performer:        ${chalk.green.bold(`🥇 ${topPerformer.name} (${topPerformer.candidateId})`)} [Rating: ${chalk.yellow.bold(topPerformer.rating)}]`);
    lines.push("");

    // Leaderboard
    lines.push(chalk.bold.underline("🏆 Leaderboard & Standings:"));
    lines.push(
      chalk.gray(
        "Rank  Agent Name              Rating    W-D-L      WinRate   Success%   Turns   Tokens   Score"
      )
    );
    lines.push(
      chalk.gray(
        "──────────────────────────────────────────────────────────────────────────────────────────"
      )
    );

    const medalIcons = ["🥇", "🥈", "🥉"];

    for (const st of leaderboard) {
      const medal = medalIcons[st.rank - 1] ?? ` #${st.rank}`;
      const rankStr = medal.padEnd(5, " ");
      const nameStr = (st.name.length > 20 ? st.name.slice(0, 19) + "…" : st.name).padEnd(22, " ");
      const ratingStr = `${st.rating}`.padEnd(9, " ");
      const recordStr = `${st.wins}-${st.draws}-${st.losses}`.padEnd(10, " ");
      const winRateStr = `${(st.winRate * 100).toFixed(1)}%`.padEnd(9, " ");
      const successStr = `${(st.taskSuccessRate * 100).toFixed(0)}%`.padEnd(10, " ");
      const turnsStr = `${st.avgTurns.toFixed(1)}`.padEnd(7, " ");
      const tokensStr = `${st.avgTokens}`.padEnd(8, " ");
      const scoreStr = `${(st.avgCompositeScore * 100).toFixed(1)}`;

      const coloredRank = st.rank === 1 ? chalk.yellow.bold(rankStr) : rankStr;
      const coloredRating = chalk.cyan.bold(ratingStr);

      lines.push(
        `${coloredRank} ${chalk.bold(nameStr)} ${coloredRating} ${recordStr} ${winRateStr} ${successStr} ${turnsStr} ${tokensStr} ${chalk.green(scoreStr)}`
      );
    }

    lines.push("");

    // Cross-Table Matrix
    lines.push(chalk.bold.underline("⚔  Head-to-Head Cross Table (Row vs Col):"));
    const candIds = leaderboard.map((l) => l.candidateId);
    const headerRow = "Agent".padEnd(14, " ") + candIds.map((id) => id.slice(0, 8).padStart(9, " ")).join(" ");
    lines.push(chalk.gray(headerRow));
    lines.push(chalk.gray("─".repeat(headerRow.length)));

    for (const rowId of candIds) {
      const rowName = (rowId.length > 12 ? rowId.slice(0, 11) + "…" : rowId).padEnd(14, " ");
      const cells: string[] = [];

      for (const colId of candIds) {
        if (rowId === colId) {
          cells.push(chalk.gray("    -    "));
        } else {
          const rec = crossTable[rowId]?.[colId];
          if (!rec || rec.matchCount === 0) {
            cells.push(chalk.gray("   N/A   "));
          } else {
            const str = `${rec.wins}/${rec.draws}/${rec.losses}`.padStart(9, " ");
            if (rec.wins > rec.losses) {
              cells.push(chalk.green(str));
            } else if (rec.losses > rec.wins) {
              cells.push(chalk.red(str));
            } else {
              cells.push(chalk.yellow(str));
            }
          }
        }
      }

      lines.push(`${rowName}${cells.join(" ")}`);
    }

    lines.push("");
    lines.push(chalk.bold("════════════════════════════════════════════════════════════════════"));
    lines.push("");

    return lines.join("\n");
  }
}
