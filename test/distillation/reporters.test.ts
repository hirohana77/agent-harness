import { describe, expect, it } from 'vitest';
import {
  TerminalDistillationReporter,
  MarkdownDistillationReporter,
  renderDistillationReport,
} from '../../src/distillation/reporters/index.js';
import type { DistilledPolicy } from '../../src/distillation/types.js';

describe('Distillation Reporters', () => {
  const samplePolicy: DistilledPolicy = {
    metadata: {
      scenarioId: 'benchmark-task-101',
      source: 'consensus_cluster',
      createdAt: '2026-10-13T00:00:00.000Z',
      confidenceScore: 89.4,
      sourceTrajectoriesCount: 4,
      totalMilestones: 2,
      totalAntiPatterns: 1,
      estimatedTokens: 320,
    },
    taskInstruction: 'Fix null reference in payment gateway',
    milestones: [
      {
        id: 'ms-1',
        order: 1,
        name: 'Examine payment log',
        description: 'Read logs',
        targetTool: 'read_file',
        argumentPattern: 'payment.log',
        isInvariant: true,
        importance: 'critical',
      },
      {
        id: 'ms-2',
        order: 2,
        name: 'Patch null check',
        description: 'Add guard clause',
        targetTool: 'edit_file',
        isInvariant: true,
        importance: 'recommended',
      },
    ],
    antiPatterns: [
      {
        id: 'trap-1',
        name: 'Dangerous database truncate',
        triggerTool: 'db_exec',
        argumentPattern: 'TRUNCATE',
        errorKeywords: ['DataLossError'],
        severity: 'critical',
        reason: 'Truncating database destroys test state.',
        remedyHint: 'Use mock transaction rollback instead.',
        occurrenceCount: 2,
      },
    ],
    steeringRules: [
      {
        id: 'sr-1',
        name: 'Block DB Truncate',
        breakpoint: {
          id: 'bp-1',
          name: 'Break on db_exec',
          type: 'tool',
          enabled: true,
          once: false,
          hitCount: 0,
          toolPattern: 'db_exec',
        },
        intervention: {
          type: 'override_tool',
          reason: 'Prohibited database truncate',
          timestamp: '2026-10-13T00:00:00.000Z',
        },
        description: 'Guards against database wipe',
      },
    ],
    fewShotExemplar: {
      id: 'ex-1',
      title: 'Payment fix trace',
      tokenEstimate: 140,
      isPruned: false,
      turns: [
        {
          turnNumber: 1,
          role: 'assistant',
          thought: 'Investigating logs',
          toolCalls: [
            {
              toolName: 'read_file',
              arguments: { path: 'payment.log' },
            },
          ],
        },
      ],
    },
  };

  it('TerminalDistillationReporter renders ANSI formatted text', () => {
    const rendered = TerminalDistillationReporter.render(samplePolicy);

    expect(rendered).toContain('DISTILLED POLICY & GUIDANCE REPORT');
    expect(rendered).toContain('benchmark-task-101');
    expect(rendered).toContain('89.4');
    expect(rendered).toContain('Examine payment log');
    expect(rendered).toContain('Dangerous database truncate');
    expect(rendered).toContain('Block DB Truncate');
  });

  it('MarkdownDistillationReporter renders markdown table format', () => {
    const rendered = MarkdownDistillationReporter.render(samplePolicy);

    expect(rendered).toContain('# Distilled Policy & Prior Guidance Report: `benchmark-task-101`');
    expect(rendered).toContain('| **Confidence Score** | **89.4 / 100** |');
    expect(rendered).toContain('| 1 | 🔴 Critical | **Examine payment log**');
    expect(rendered).toContain('| 1 | ⛔ Block | **Dangerous database truncate**');
    expect(rendered).toContain('## Active Steering Rules');
  });

  it('renderDistillationReport dispatches to json and other formats', () => {
    const jsonStr = renderDistillationReport(samplePolicy, 'json');
    const parsed = JSON.parse(jsonStr);
    expect(parsed.metadata.scenarioId).toBe('benchmark-task-101');

    const fewShotStr = renderDistillationReport(samplePolicy, 'fewshot');
    const fewShotParsed = JSON.parse(fewShotStr);
    expect(Array.isArray(fewShotParsed)).toBe(true);

    const steeringStr = renderDistillationReport(samplePolicy, 'steering');
    const steeringParsed = JSON.parse(steeringStr);
    expect(steeringParsed.rules).toBeDefined();
  });
});
