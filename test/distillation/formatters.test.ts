import { describe, expect, it } from 'vitest';
import { PromptGuidanceFormatter } from '../../src/distillation/formatters.js';
import type { DistilledPolicy } from '../../src/distillation/types.js';

describe('PromptGuidanceFormatter', () => {
  const mockPolicy: DistilledPolicy = {
    metadata: {
      scenarioId: 'test-scenario-format',
      source: 'canonical_trajectory',
      createdAt: new Date().toISOString(),
      confidenceScore: 95.0,
      sourceTrajectoriesCount: 3,
      totalMilestones: 2,
      totalAntiPatterns: 1,
      estimatedTokens: 250,
    },
    taskInstruction: 'Refactor auth middleware to handle expiration',
    milestones: [
      {
        id: 'ms-1',
        order: 1,
        name: 'Inspect auth middleware',
        description: 'Read middleware file',
        targetTool: 'read_file',
        argumentPattern: 'auth.ts',
        isInvariant: true,
        importance: 'critical',
      },
      {
        id: 'ms-2',
        order: 2,
        name: 'Modify token expiry check',
        description: 'Update timestamp logic',
        targetTool: 'edit_file',
        isInvariant: true,
        importance: 'recommended',
      },
    ],
    antiPatterns: [
      {
        id: 'ap-1',
        name: 'Prohibited Hardcoded Secret',
        triggerTool: 'edit_file',
        argumentPattern: 'secret: "12345"',
        errorKeywords: ['Security violation'],
        severity: 'critical',
        reason: 'Hardcoding plaintext secrets violates security policy.',
        remedyHint: 'Use environment variables via process.env.',
        occurrenceCount: 2,
      },
    ],
    fewShotExemplar: {
      id: 'ex-1',
      title: 'Auth Refactor Exemplar',
      tokenEstimate: 120,
      isPruned: false,
      turns: [
        {
          turnNumber: 1,
          role: 'assistant',
          thought: 'Need to inspect auth middleware first',
          toolCalls: [
            {
              toolName: 'read_file',
              arguments: { path: 'auth.ts' },
              result: { success: true, output: 'export function auth() {}' },
            },
          ],
        },
      ],
    },
    steeringRules: [
      {
        id: 'steer-1',
        name: 'Intercept Secret',
        breakpoint: {
          id: 'bp-1',
          name: 'Break on edit_file',
          type: 'tool',
          enabled: true,
          once: false,
          hitCount: 0,
          toolPattern: 'edit_file',
        },
        intervention: {
          type: 'override_tool',
          reason: 'Hardcoded secret detected',
          timestamp: new Date().toISOString(),
        },
        description: 'Blocks hardcoded secret injection',
      },
    ],
  };

  it('formats policy cleanly into Markdown system prompt section', () => {
    const md = PromptGuidanceFormatter.formatAsMarkdown(mockPolicy);

    expect(md).toContain('# Strategic Execution Guidance & Proven Milestones');
    expect(md).toContain('`test-scenario-format`');
    expect(md).toContain('95.0%');
    expect(md).toContain('Refactor auth middleware');
    expect(md).toContain('🔴 **[CRITICAL]** **Inspect auth middleware** (`read_file`)');
    expect(md).toContain('⛔ **[BLOCK]** **Prohibited Hardcoded Secret** (`edit_file`)');
    expect(md).toContain('Exemplar Execution Trace');
    expect(md).toContain('Turn 1');
  });

  it('formats policy into Anthropic Claude XML tags', () => {
    const xml = PromptGuidanceFormatter.formatAsAnthropic(mockPolicy);

    expect(xml).toContain('<distilled_guidance scenario="test-scenario-format" confidence="95">');
    expect(xml).toContain('<milestones>');
    expect(xml).toContain('<milestone order="1" tool="read_file" importance="critical">');
    expect(xml).toContain('<name>Inspect auth middleware</name>');
    expect(xml).toContain('<prohibited_pitfalls>');
    expect(xml).toContain('<pitfall tool="edit_file" severity="critical">');
    expect(xml).toContain('</distilled_guidance>');
  });

  it('formats policy into OpenAI chat completion messages array', () => {
    const messages = PromptGuidanceFormatter.formatAsOpenAI(mockPolicy);

    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBeGreaterThanOrEqual(3);

    // First message should be system prompt containing markdown guidance
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('Strategic Execution Guidance');

    // Second message should be user prompt
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe('Refactor auth middleware to handle expiration');

    // Subsequent messages represent assistant thoughts and tool calls
    const assistantMsg = messages.find((m) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect((assistantMsg as any).tool_calls).toBeDefined();

    // Tool result message
    const toolMsg = messages.find((m) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect((toolMsg as any).name).toBe('read_file');
  });

  it('formats policy into SteeringController configuration object', () => {
    const steering = PromptGuidanceFormatter.formatAsSteeringConfig(mockPolicy);

    expect(steering.rules).toBeDefined();
    expect(steering.rules.length).toBe(1);
    expect(steering.rules[0].id).toBe('bp-1');
    expect(steering.rules[0].toolPattern).toBe('edit_file');
  });
});
