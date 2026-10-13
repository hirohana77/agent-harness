import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);

describe('CLI curriculum Command Integration', () => {
  const sampleScenario = {
    id: 'cli-curriculum-task',
    name: 'CLI Curriculum Sample Task',
    workspace: {
      initialFiles: {
        'index.js': 'console.log("ready");\n',
      },
      cleanup: true,
      gitInit: false,
    },
    task: {
      instruction: 'Verify index.js exists and run it.',
    },
    budgets: {
      maxTurns: 5,
      timeoutMs: 10000,
      maxTokens: 5000,
    },
    security: {
      allowedCommands: ['node *', 'cat *'],
      deniedCommands: ['rm -rf /'],
      allowedPaths: ['.'],
      networkEnabled: false,
    },
    assertions: {
      files: [
        {
          path: 'index.js',
          shouldExist: true,
        },
      ],
      commands: [],
      trajectory: [],
    },
  };

  it('executes curriculum CLI command and outputs markdown report & plan export', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-curriculum-cli-test-'));

    const scenarioPath = path.join(tmpDir, 'scenario.json');
    const reportPath = path.join(tmpDir, 'curriculum-report.md');
    const planPath = path.join(tmpDir, 'exported-plan.json');

    await fs.writeFile(scenarioPath, JSON.stringify(sampleScenario), 'utf8');

    const { stdout } = await execFileAsync('node', [
      path.resolve('dist/cli/index.js'),
      'curriculum',
      '-s',
      scenarioPath,
      '--stages',
      'novice',
      '--scenarios-per-stage',
      '1',
      '-f',
      'markdown',
      '-o',
      reportPath,
      '--export-plan',
      planPath,
    ]);

    expect(stdout).toContain('Synthesized curriculum plan exported to:');
    expect(stdout).toContain('Curriculum report written to:');

    const reportContent = await fs.readFile(reportPath, 'utf8');
    expect(reportContent).toContain('# Auto-Curriculum Closed-Loop Report');
    expect(reportContent).toContain('`novice`');

    const planContent = await fs.readFile(planPath, 'utf8');
    const parsedPlan = JSON.parse(planContent);
    expect(parsedPlan.stages).toHaveLength(1);
    expect(parsedPlan.stages[0].difficulty).toBe('novice');

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('outputs json curriculum report to stdout when no output file is specified', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-curriculum-json-stdout-test-'));
    const scenarioPath = path.join(tmpDir, 'scenario.json');

    await fs.writeFile(scenarioPath, JSON.stringify(sampleScenario), 'utf8');

    const { stdout } = await execFileAsync('node', [
      path.resolve('dist/cli/index.js'),
      'curriculum',
      '-s',
      scenarioPath,
      '--stages',
      'novice',
      '--scenarios-per-stage',
      '1',
      '-f',
      'json',
    ]);

    const parsed = JSON.parse(stdout);
    expect(parsed.totalStages).toBe(1);
    expect(parsed.stages).toHaveLength(1);
    expect(parsed.remediationMetrics).toBeDefined();

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
