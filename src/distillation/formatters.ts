import { DistilledPolicy } from './types.js';

export class PromptGuidanceFormatter {
  /**
   * Format the distilled policy as a structured Markdown prompt section
   */
  public static formatAsMarkdown(policy: DistilledPolicy): string {
    const lines: string[] = [];

    lines.push('# Strategic Execution Guidance & Proven Milestones');
    lines.push('');
    lines.push(`> **Scenario ID**: \`${policy.metadata.scenarioId}\` | **Confidence**: ${policy.metadata.confidenceScore.toFixed(1)}% | **Source**: ${policy.metadata.source}`);
    lines.push('');

    if (policy.taskInstruction) {
      lines.push('## Primary Objective');
      lines.push(policy.taskInstruction);
      lines.push('');
    }

    // Milestones
    lines.push('## Proven Milestone Roadmap');
    if (policy.milestones.length === 0) {
      lines.push('*No specific milestones established.*');
    } else {
      policy.milestones.forEach((m) => {
        const badge = m.importance === 'critical' ? '🔴 **[CRITICAL]**' : '🟡 **[RECOMMENDED]**';
        lines.push(`${m.order}. ${badge} **${m.name}** (\`${m.targetTool}\`)`);
        lines.push(`   - ${m.description}`);
        if (m.argumentPattern) {
          lines.push(`   - *Expected pattern*: \`${m.argumentPattern}\``);
        }
      });
    }
    lines.push('');

    // Anti-patterns
    if (policy.antiPatterns.length > 0) {
      lines.push('## Prohibited Pitfalls & Dead-End Traps (DO NOT EXECUTE)');
      policy.antiPatterns.forEach((ap, idx) => {
        const sev = ap.severity === 'critical' ? '⛔ **[BLOCK]**' : '⚠️ **[WARN]**';
        lines.push(`${idx + 1}. ${sev} **${ap.name}** (\`${ap.triggerTool}\`)`);
        lines.push(`   - *Reason*: ${ap.reason}`);
        lines.push(`   - *Remedy*: ${ap.remedyHint}`);
        if (ap.errorKeywords.length > 0) {
          lines.push(`   - *Failure indicators*: \`${ap.errorKeywords.join('`, `')}\``);
        }
      });
      lines.push('');
    }

    // Exemplar
    if (policy.fewShotExemplar && policy.fewShotExemplar.turns.length > 0) {
      lines.push('## Exemplar Execution Trace');
      lines.push(`*Estimated token cost: ~${policy.fewShotExemplar.tokenEstimate} tokens${policy.fewShotExemplar.isPruned ? ' (budget-pruned)' : ''}*`);
      lines.push('');
      policy.fewShotExemplar.turns.forEach((t) => {
        lines.push(`### Turn ${t.turnNumber}`);
        if (t.thought) {
          lines.push(`**Thought**: ${t.thought}`);
        }
        if (t.toolCalls && t.toolCalls.length > 0) {
          lines.push('**Actions**:');
          t.toolCalls.forEach((tc) => {
            lines.push(`- Tool: \`${tc.toolName}\``);
            lines.push('  ```json');
            lines.push(`  ${JSON.stringify(tc.arguments, null, 2).replace(/\n/g, '\n  ')}`);
            lines.push('  ```');
          });
        }
        if (t.assistantMessage) {
          lines.push(`**Response**: ${t.assistantMessage}`);
        }
        lines.push('');
      });
    }

    return lines.join('\n');
  }

  /**
   * Format as Anthropic / Claude XML tagged prompt section
   */
  public static formatAsAnthropic(policy: DistilledPolicy): string {
    const lines: string[] = [];
    lines.push(`<distilled_guidance scenario="${policy.metadata.scenarioId}" confidence="${policy.metadata.confidenceScore}">`);

    if (policy.taskInstruction) {
      lines.push(`  <task_instruction>${escapeXml(policy.taskInstruction)}</task_instruction>`);
    }

    lines.push('  <milestones>');
    policy.milestones.forEach((m) => {
      lines.push(`    <milestone order="${m.order}" tool="${m.targetTool}" importance="${m.importance}">`);
      lines.push(`      <name>${escapeXml(m.name)}</name>`);
      lines.push(`      <description>${escapeXml(m.description)}</description>`);
      if (m.argumentPattern) {
        lines.push(`      <pattern>${escapeXml(m.argumentPattern)}</pattern>`);
      }
      lines.push('    </milestone>');
    });
    lines.push('  </milestones>');

    if (policy.antiPatterns.length > 0) {
      lines.push('  <prohibited_pitfalls>');
      policy.antiPatterns.forEach((ap) => {
        lines.push(`    <pitfall tool="${ap.triggerTool}" severity="${ap.severity}">`);
        lines.push(`      <reason>${escapeXml(ap.reason)}</reason>`);
        lines.push(`      <remedy>${escapeXml(ap.remedyHint)}</remedy>`);
        lines.push('    </pitfall>');
      });
      lines.push('  </prohibited_pitfalls>');
    }

    lines.push('</distilled_guidance>');
    return lines.join('\n');
  }

  /**
   * Format as OpenAI Chat Completion messages array
   */
  public static formatAsOpenAI(policy: DistilledPolicy): Array<Record<string, unknown>> {
    const messages: Array<Record<string, unknown>> = [];

    // System instruction containing distilled guidance
    messages.push({
      role: 'system',
      content: this.formatAsMarkdown(policy),
    });

    if (policy.taskInstruction) {
      messages.push({
        role: 'user',
        content: policy.taskInstruction,
      });
    }

    // Include exemplar turns
    if (policy.fewShotExemplar) {
      policy.fewShotExemplar.turns.forEach((t) => {
        const toolCalls = t.toolCalls?.map((tc, idx) => ({
          id: `call_${t.turnNumber}_${idx}`,
          type: 'function',
          function: {
            name: tc.toolName,
            arguments: JSON.stringify(tc.arguments),
          },
        }));

        messages.push({
          role: 'assistant',
          content: t.thought || t.assistantMessage || null,
          ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        });

        if (t.toolCalls) {
          t.toolCalls.forEach((tc, idx) => {
            if (tc.result !== undefined) {
              messages.push({
                role: 'tool',
                tool_call_id: `call_${t.turnNumber}_${idx}`,
                name: tc.toolName,
                content: typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result),
              });
            }
          });
        }
      });
    }

    return messages;
  }

  /**
   * Export steering breakpoint rules ready for SteeringController
   */
  public static formatAsSteeringConfig(policy: DistilledPolicy): { rules: any[] } {
    return {
      rules: policy.steeringRules.map((r) => r.breakpoint),
    };
  }
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
