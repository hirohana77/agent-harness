import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { TrajectoryRecorder } from '../../src/trajectory/recorder.js';
import { TrajectoryExporter } from '../../src/trajectory/exporter.js';
import { TrajectoryReplayer } from '../../src/trajectory/replayer.js';
import { BudgetExceededError } from '../../src/core/errors.js';

describe('Trajectory Engine', () => {
  it('records turns, tool calls, and computes metrics accurately', () => {
    const recorder = new TrajectoryRecorder('scenario-calc', {
      maxTurns: 3,
      maxTokens: 500,
    });

    // Turn 1
    recorder.startTurn('Calculate 2 + 2', 'I need to run node script');
    recorder.recordToolCall(
      'execute_command',
      { cmd: 'node -e "console.log(4)"' },
      { success: true, output: '4', exitCode: 0 },
      15
    );
    recorder.completeTurn('The answer is 4', {
      promptTokens: 50,
      completionTokens: 20,
      totalTokens: 70,
    });

    const trajectory = recorder.finalize('completed', 0.002);
    expect(trajectory.scenarioId).toBe('scenario-calc');
    expect(trajectory.summary.totalTurns).toBe(1);
    expect(trajectory.summary.totalToolCalls).toBe(1);
    expect(trajectory.summary.totalTokens).toBe(70);
    expect(trajectory.summary.costUsd).toBe(0.002);
    expect(trajectory.summary.completed).toBe(true);
  });

  it('enforces turn budgets strictly', () => {
    const recorder = new TrajectoryRecorder('scenario-budget', { maxTurns: 1 });
    recorder.startTurn('Turn 1');
    recorder.completeTurn('Done 1');

    expect(() => recorder.startTurn('Turn 2')).toThrow(BudgetExceededError);
  });

  it('exports and re-imports trajectories with validation', async () => {
    const recorder = new TrajectoryRecorder('export-test');
    recorder.startTurn('Hello');
    recorder.completeTurn('World');
    const orig = recorder.finalize();

    const tmpFile = path.join(os.tmpdir(), `traj-${Date.now()}.json`);
    await TrajectoryExporter.saveToFile(tmpFile, orig);

    const loaded = await TrajectoryExporter.loadFromFile(tmpFile);
    expect(loaded.scenarioId).toBe('export-test');
    expect(loaded.turns.length).toBe(1);

    await fs.rm(tmpFile, { force: true });
  });

  it('replays trajectories against a dispatcher and checks divergence', async () => {
    const recorder = new TrajectoryRecorder('replay-test');
    recorder.startTurn('Run test');
    recorder.recordToolCall('run_cmd', { cmd: 'test' }, { success: true, exitCode: 0 }, 10);
    recorder.completeTurn();
    const trajectory = recorder.finalize();

    const replayer = new TrajectoryReplayer(trajectory);

    // Matching dispatcher
    const matchRes = await replayer.replay(async () => ({
      success: true,
      exitCode: 0,
      output: 'passed',
    }));
    expect(matchRes.success).toBe(true);
    expect(matchRes.divergedSteps).toBe(0);

    // Diverging dispatcher (exit code differs)
    const divergeRes = await replayer.replay(async () => ({
      success: false,
      exitCode: 1,
      error: 'failed',
    }));
    expect(divergeRes.success).toBe(false);
    expect(divergeRes.divergedSteps).toBe(1);
  });
});
