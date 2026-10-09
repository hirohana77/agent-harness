import { TrajectoryDiff } from '../types.js';

export class MarkdownDiffReporter {
  public static render(diff: TrajectoryDiff): string {
    const lines: string[] = [];
    const { summary, regression } = diff;

    // Header
    lines.push(`# Trajectory Differential Analysis: \`${diff.scenarioId}\``);
    lines.push('');

    // Verdict Badge
    let verdictBadge = '';
    switch (regression.severity) {
      case 'identical':
        verdictBadge = '🟢 **IDENTICAL** - Exact match with baseline';
        break;
      case 'equivalent':
        verdictBadge = '🔵 **EQUIVALENT** - Minor execution deviations, equivalent success';
        break;
      case 'minor_drift':
        verdictBadge = '🟡 **MINOR DRIFT** - Execution path diverged, potential inefficiency';
        break;
      case 'regression':
        verdictBadge = '🔴 **REGRESSION** - Functional or performance regression detected';
        break;
      case 'critical_failure':
        verdictBadge = '⛔ **CRITICAL FAILURE** - Premature crash, timeout, or severe failure';
        break;
    }

    lines.push(`- **Verdict**: ${verdictBadge}`);
    lines.push(`- **Similarity Score**: ${(regression.score * 100).toFixed(1)}%`);
    lines.push(`- **Status Transition**: \`${summary.status.baseline}\` ➔ \`${summary.status.candidate}\`${summary.status.regressed ? ' ⚠️ *(Regressed)*' : ''}`);
    lines.push('');

    // Metrics Table
    lines.push('## Metrics Comparison');
    lines.push('');
    lines.push('| Metric | Baseline | Candidate | Delta |');
    lines.push('| :--- | :---: | :---: | :---: |');
    lines.push(`| **Turns** | ${summary.turns.baseline} | ${summary.turns.candidate} | ${summary.turns.delta > 0 ? `+${summary.turns.delta}` : summary.turns.delta} |`);
    lines.push(`| **Tool Calls** | ${summary.toolCalls.baseline} | ${summary.toolCalls.candidate} | ${summary.toolCalls.delta > 0 ? `+${summary.toolCalls.delta}` : summary.toolCalls.delta} |`);
    lines.push(`| **Total Tokens** | ${summary.tokens.baselineTotal} | ${summary.tokens.candidateTotal} | ${summary.tokens.totalDelta > 0 ? `+${summary.tokens.totalDelta}` : summary.tokens.totalDelta} |`);
    lines.push(`| **Prompt Tokens** | ${summary.tokens.baselinePrompt} | ${summary.tokens.candidatePrompt} | ${summary.tokens.promptDelta > 0 ? `+${summary.tokens.promptDelta}` : summary.tokens.promptDelta} |`);
    lines.push(`| **Completion Tokens** | ${summary.tokens.baselineCompletion} | ${summary.tokens.candidateCompletion} | ${summary.tokens.completionDelta > 0 ? `+${summary.tokens.completionDelta}` : summary.tokens.completionDelta} |`);
    lines.push(`| **Duration (ms)** | ${summary.durationMs.baseline} | ${summary.durationMs.candidate} | ${summary.durationMs.delta > 0 ? `+${summary.durationMs.delta}` : summary.durationMs.delta} |`);
    if (summary.costUsd.baseline > 0 || summary.costUsd.candidate > 0) {
      lines.push(`| **Cost (USD)** | $${summary.costUsd.baseline.toFixed(4)} | $${summary.costUsd.candidate.toFixed(4)} | $${summary.costUsd.delta.toFixed(4)} |`);
    }
    lines.push('');

    // Divergence Point
    if (diff.firstDivergence) {
      lines.push('## ⚠️ First Divergence Point');
      lines.push(`- **Turn & Step**: Turn ${diff.firstDivergence.turnNumber}, Step ${diff.firstDivergence.stepIndex}`);
      lines.push(`- **Divergence Category**: \`${diff.firstDivergence.type}\``);
      lines.push(`- **Description**: ${diff.firstDivergence.description}`);
      lines.push('');
    }

    // Detected Anomalies
    if (regression.anomalies.length > 0) {
      lines.push('## 🚨 Detected Anomalies');
      for (const a of regression.anomalies) {
        lines.push(`- **[${a.type}]**: ${a.message}`);
      }
      lines.push('');
    }

    // Tool Invocation Breakdown
    const toolKeys = Object.keys(diff.toolDistribution);
    if (toolKeys.length > 0) {
      lines.push('## Tool Invocation Breakdown');
      lines.push('');
      lines.push('| Tool | Baseline | Candidate | Delta |');
      lines.push('| :--- | :---: | :---: | :---: |');
      for (const tool of toolKeys) {
        const dist = diff.toolDistribution[tool];
        lines.push(`| \`${tool}\` | ${dist.baseline} | ${dist.candidate} | ${dist.delta > 0 ? `+${dist.delta}` : dist.delta} |`);
      }
      lines.push('');
    }

    // Aligned Step Trajectory
    lines.push('## Aligned Trajectory Steps');
    lines.push('');
    lines.push('| Step | Alignment | Baseline Action | Candidate Action | Details |');
    lines.push('| :---: | :---: | :--- | :--- | :--- |');
    for (const s of diff.alignment) {
      const bAction = s.baselineStep ? `\`${s.baselineStep.toolName || 'turn_end'}\`` : '-';
      const cAction = s.candidateStep ? `\`${s.candidateStep.toolName || 'turn_end'}\`` : '-';
      const alignBadge = s.alignmentType === 'match' ? '🟢 match'
        : s.alignmentType === 'modified' ? '🟡 modified'
        : s.alignmentType === 'added' ? '🔵 added' : '🔴 removed';
      lines.push(`| ${s.stepIndex} | ${alignBadge} | ${bAction} | ${cAction} | ${s.divergenceDetails || '-'} |`);
    }
    lines.push('');

    return lines.join('\n');
  }
}
