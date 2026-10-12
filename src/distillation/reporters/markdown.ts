import { DistilledPolicy } from '../types.js';

export class MarkdownDistillationReporter {
  public static render(policy: DistilledPolicy): string {
    const lines: string[] = [];
    const { metadata, milestones, antiPatterns, fewShotExemplar, steeringRules } = policy;

    lines.push(`# Distilled Policy & Prior Guidance Report: \`${metadata.scenarioId}\``);
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('| :--- | :--- |');
    lines.push(`| **Confidence Score** | **${metadata.confidenceScore.toFixed(1)} / 100** |`);
    lines.push(`| **Distillation Source** | \`${metadata.source}\` |`);
    lines.push(`| **Source Trajectories** | ${metadata.sourceTrajectoriesCount} runs |`);
    lines.push(`| **Milestones Extracted** | ${milestones.length} checkpoints |`);
    lines.push(`| **Pitfalls Isolated** | ${antiPatterns.length} traps |`);
    lines.push(`| **Estimated Tokens** | ~${metadata.estimatedTokens} tokens (${fewShotExemplar?.isPruned ? 'budget-pruned' : 'intact'}) |`);
    lines.push(`| **Generated At** | ${metadata.createdAt} |`);
    lines.push('');

    if (policy.taskInstruction) {
      lines.push('## Scenario Instruction');
      lines.push(`> ${policy.taskInstruction}`);
      lines.push('');
    }

    lines.push('## Invariant Milestone Roadmap');
    if (milestones.length === 0) {
      lines.push('*No milestones identified.*');
    } else {
      lines.push('| Order | Importance | Milestone Name | Target Tool | Expected Pattern | Description |');
      lines.push('| :---: | :---: | :--- | :--- | :--- | :--- |');
      milestones.forEach((m) => {
        const badge = m.importance === 'critical' ? '🔴 Critical' : '🟡 Recommended';
        const pat = m.argumentPattern ? `\`${m.argumentPattern}\`` : '-';
        lines.push(
          `| ${m.order} | ${badge} | **${m.name}** | \`${m.targetTool}\` | ${pat} | ${m.description} |`
        );
      });
    }
    lines.push('');

    if (antiPatterns.length > 0) {
      lines.push('## Negative Hazard Traps (Prohibited Pitfalls)');
      lines.push('| # | Severity | Pitfall Name | Trigger Tool | Reason | Remedy Hint |');
      lines.push('| :---: | :---: | :--- | :--- | :--- | :--- |');
      antiPatterns.forEach((ap, idx) => {
        const sev = ap.severity === 'critical' ? '⛔ Block' : '⚠️ Warn';
        lines.push(
          `| ${idx + 1} | ${sev} | **${ap.name}** | \`${ap.triggerTool}\` | ${ap.reason} | ${ap.remedyHint} |`
        );
      });
      lines.push('');
    }

    if (steeringRules.length > 0) {
      lines.push('## Active Steering Rules');
      lines.push('| ID | Rule Name | Breakpoint Type | Intervention | Description |');
      lines.push('| :--- | :--- | :--- | :--- | :--- |');
      steeringRules.forEach((r) => {
        lines.push(
          `| \`${r.id}\` | **${r.name}** | \`${r.breakpoint.type}\` | \`${r.intervention.type}\` | ${r.description} |`
        );
      });
      lines.push('');
    }

    if (fewShotExemplar) {
      lines.push('## Distilled Exemplar Trace');
      lines.push(`- **Total Turns**: ${fewShotExemplar.turns.length}`);
      lines.push(`- **Estimated Tokens**: ~${fewShotExemplar.tokenEstimate}`);
      lines.push(`- **Budget Pruned**: ${fewShotExemplar.isPruned ? 'Yes' : 'No'}`);
      lines.push('');
    }

    return lines.join('\n');
  }
}
