import { AgentHarness, AgentExecutionContext } from "../core/harness.js";
import { HarnessReport } from "../core/types.js";
import {
  ArenaConfig,
  ArenaExecutionOptions,
  ArenaReport,
  AgentStanding,
  MatchRecord,
  CandidateWithTarget,
  HeadToHeadPair,
} from "./types.js";
import { ArenaConfigSchema, ArenaReportSchema } from "./schemas.js";
import { MatchEvaluator } from "./evaluator.js";
import { createRatingEngine, IRatingEngine } from "./rating.js";
import { MatchScheduler } from "./scheduler.js";

export class ArenaTournamentRunner {
  private config: ArenaConfig;
  private evaluator: MatchEvaluator;
  private ratingEngine: IRatingEngine;
  private scheduler: MatchScheduler;

  constructor(config?: Partial<ArenaConfig>) {
    this.config = ArenaConfigSchema.parse(config ?? {});
    this.evaluator = new MatchEvaluator(this.config.weights);
    this.ratingEngine = createRatingEngine(this.config.ratingSystem, {
      kFactor: this.config.kFactor,
      dynamicKFactor: this.config.dynamicKFactor,
    });
    this.scheduler = new MatchScheduler(this.config.seed);
  }

  /**
   * Run the tournament with the provided candidates and scenarios.
   */
  public async run(options: ArenaExecutionOptions): Promise<ArenaReport> {
    const { candidates, scenarios, onMatchStart, onMatchComplete, onRoundComplete } = options;

    if (candidates.length < 2) {
      throw new Error(`Tournament requires at least 2 candidates, got ${candidates.length}`);
    }
    if (scenarios.length === 0) {
      throw new Error("Tournament requires at least 1 scenario");
    }

    const tournamentId = `tournament-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const standingsMap = new Map<string, AgentStanding>();
    const crossTable: Record<string, Record<string, HeadToHeadPair>> = {};

    // Initialize standings and cross-table
    for (const c of candidates) {
      standingsMap.set(c.id, {
        rank: 1,
        candidateId: c.id,
        name: c.name,
        rating: c.initialRating ?? 1500,
        ratingDeviation: c.initialRd ?? 350,
        volatility: c.initialVolatility ?? 0.06,
        matchesPlayed: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        winRate: 0,
        avgCompositeScore: 0,
        taskSuccessRate: 0,
        avgTurns: 0,
        avgTokens: 0,
        avgDurationMs: 0,
      });

      crossTable[c.id] = {};
      for (const other of candidates) {
        if (other.id !== c.id) {
          crossTable[c.id][other.id] = { wins: 0, draws: 0, losses: 0, matchCount: 0 };
        }
      }
    }

    // Schedule pairings
    const pairings = this.scheduler.schedule(
      candidates,
      scenarios,
      this.config.mode,
      this.config.rounds
    );

    const matchRecords: MatchRecord[] = [];
    const executionCache = new Map<string, HarnessReport>();

    // Helper to run or reuse candidate on scenario
    const runCandidateOnScenario = async (
      candidate: CandidateWithTarget,
      scenarioId: string,
      round: number
    ): Promise<HarnessReport> => {
      const cacheKey = `${candidate.id}-${scenarioId}-r${round}`;
      if (executionCache.has(cacheKey)) {
        return executionCache.get(cacheKey)!;
      }

      const originalScenario = scenarios.find((s) => s.id === scenarioId)!;
      const scenarioCopy = JSON.parse(JSON.stringify(originalScenario));

      const harnessResult = await AgentHarness.runScenario(
        scenarioCopy,
        async (ctx: AgentExecutionContext) => {
          if (typeof candidate.target === "function") {
            await candidate.target(ctx);
            return;
          }

          const runContext = {
            scenario: ctx.scenario,
            workspacePath: ctx.workspacePath,
            signal: new AbortController().signal,
            executeCommand: async (cmd: string, timeoutMs?: number) => {
              return ctx.executor.execute(cmd, timeoutMs ? { timeoutMs } : {});
            },
            readFile: async (p: string) => ctx.workspace.readFile(p),
            writeFile: async (p: string, c: string) => ctx.workspace.writeFile(p, c),
            recordTurn: (turnData: any) => {
              ctx.recorder.startTurn(turnData.prompt || "Agent turn", turnData.thought);
              if (turnData.toolCalls) {
                for (const tc of turnData.toolCalls) {
                  ctx.recorder.recordToolCall(
                    tc.toolName,
                    tc.arguments,
                    tc.result,
                    tc.durationMs || 0,
                    tc.callId
                  );
                }
              }
              ctx.recorder.completeTurn(turnData.assistantMessage || "Turn complete");
            },
          };

          await candidate.target.run(runContext);
        }
      );

      executionCache.set(cacheKey, harnessResult.report);
      return harnessResult.report;
    };

    let currentRound = 1;

    for (const pairing of pairings) {
      if (pairing.round !== currentRound) {
        if (onRoundComplete) {
          onRoundComplete(currentRound, this.buildLeaderboard(standingsMap));
        }
        currentRound = pairing.round;
      }

      if (onMatchStart) {
        onMatchStart(pairing);
      }

      // Execute both candidates on the scenario
      const reportA = await runCandidateOnScenario(
        pairing.candidateA,
        pairing.scenario.id,
        pairing.round
      );
      const reportB = await runCandidateOnScenario(
        pairing.candidateB,
        pairing.scenario.id,
        pairing.round
      );

      // Compute performance metrics
      const metricsA = this.evaluator.computeMetrics(reportA, pairing.scenario);
      const metricsB = this.evaluator.computeMetrics(reportB, pairing.scenario);

      // Evaluate match outcome
      const evalResult = this.evaluator.evaluate(metricsA, metricsB, {
        drawThreshold: this.config.drawThreshold,
      });

      const standingA = standingsMap.get(pairing.candidateA.id)!;
      const standingB = standingsMap.get(pairing.candidateB.id)!;

      // Update ratings
      const ratingUpdate = this.ratingEngine.calculateUpdate(
        standingA,
        standingB,
        evalResult.scoreA,
        evalResult.scoreB
      );

      // Update standings
      this.updateStanding(standingA, evalResult.scoreA, metricsA, ratingUpdate.newRatingA, ratingUpdate.newRdA, ratingUpdate.newVolatilityA);
      this.updateStanding(standingB, evalResult.scoreB, metricsB, ratingUpdate.newRatingB, ratingUpdate.newRdB, ratingUpdate.newVolatilityB);

      // Update cross table
      const pairA = crossTable[pairing.candidateA.id][pairing.candidateB.id];
      const pairB = crossTable[pairing.candidateB.id][pairing.candidateA.id];
      pairA.matchCount++;
      pairB.matchCount++;

      if (evalResult.outcome === "win_a") {
        pairA.wins++;
        pairB.losses++;
      } else if (evalResult.outcome === "win_b") {
        pairA.losses++;
        pairB.wins++;
      } else {
        pairA.draws++;
        pairB.draws++;
      }

      const record: MatchRecord = {
        matchId: pairing.matchId,
        round: pairing.round,
        scenarioId: pairing.scenario.id,
        candidateAId: pairing.candidateA.id,
        candidateBId: pairing.candidateB.id,
        outcome: evalResult.outcome,
        scoreA: evalResult.scoreA,
        scoreB: evalResult.scoreB,
        margin: evalResult.margin,
        ratingDeltaA: ratingUpdate.deltaA,
        ratingDeltaB: ratingUpdate.deltaB,
        metricsA,
        metricsB,
        reason: evalResult.reason,
        timestamp: new Date().toISOString(),
      };

      matchRecords.push(record);

      if (onMatchComplete) {
        onMatchComplete(record);
      }
    }

    if (onRoundComplete) {
      onRoundComplete(currentRound, this.buildLeaderboard(standingsMap));
    }

    const leaderboard = this.buildLeaderboard(standingsMap);
    const topPerformer = leaderboard[0];

    const report: ArenaReport = {
      tournamentId,
      mode: this.config.mode,
      timestamp: new Date().toISOString(),
      totalMatches: matchRecords.length,
      scenariosCount: scenarios.length,
      candidatesCount: candidates.length,
      leaderboard,
      crossTable,
      matches: matchRecords,
      topPerformer,
    };

    return ArenaReportSchema.parse(report);
  }

  private updateStanding(
    standing: AgentStanding,
    score: number,
    metrics: { passed: boolean; turns: number; tokens: number; durationMs: number; compositeScore: number },
    newRating: number,
    newRd?: number,
    newVol?: number
  ): void {
    const prevMatches = standing.matchesPlayed;
    standing.matchesPlayed++;

    if (score === 1.0) {
      standing.wins++;
    } else if (score === 0.5) {
      standing.draws++;
    } else {
      standing.losses++;
    }

    standing.rating = newRating;
    if (newRd !== undefined) standing.ratingDeviation = newRd;
    if (newVol !== undefined) standing.volatility = newVol;

    standing.winRate = Math.round(((standing.wins + standing.draws * 0.5) / standing.matchesPlayed) * 1000) / 1000;

    // Incremental moving averages
    standing.avgCompositeScore =
      Math.round(((standing.avgCompositeScore * prevMatches + metrics.compositeScore) / standing.matchesPlayed) * 1000) / 1000;

    standing.taskSuccessRate =
      Math.round(((standing.taskSuccessRate * prevMatches + (metrics.passed ? 1 : 0)) / standing.matchesPlayed) * 1000) / 1000;

    standing.avgTurns =
      Math.round(((standing.avgTurns * prevMatches + metrics.turns) / standing.matchesPlayed) * 10) / 10;

    standing.avgTokens =
      Math.round((standing.avgTokens * prevMatches + metrics.tokens) / standing.matchesPlayed);

    standing.avgDurationMs =
      Math.round((standing.avgDurationMs * prevMatches + metrics.durationMs) / standing.matchesPlayed);
  }

  private buildLeaderboard(standingsMap: Map<string, AgentStanding>): AgentStanding[] {
    const standings = Array.from(standingsMap.values());

    standings.sort((a, b) => {
      // Primary: Rating descending
      if (b.rating !== a.rating) return b.rating - a.rating;
      // Secondary: Win rate descending
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      // Tertiary: Composite score descending
      return b.avgCompositeScore - a.avgCompositeScore;
    });

    standings.forEach((st, idx) => {
      st.rank = idx + 1;
    });

    return standings;
  }
}
