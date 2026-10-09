import { TrajectoryDiff } from '../types.js';

export class HtmlDiffReporter {
  public static render(diff: TrajectoryDiff): string {
    const { summary, regression } = diff;

    let badgeColor = '#10b981';
    let badgeText = 'IDENTICAL';
    switch (regression.severity) {
      case 'equivalent':
        badgeColor = '#3b82f6';
        badgeText = 'EQUIVALENT';
        break;
      case 'minor_drift':
        badgeColor = '#f59e0b';
        badgeText = 'MINOR DRIFT';
        break;
      case 'regression':
        badgeColor = '#ef4444';
        badgeText = 'REGRESSION';
        break;
      case 'critical_failure':
        badgeColor = '#b91c1c';
        badgeText = 'CRITICAL FAILURE';
        break;
    }

    const formatDelta = (val: number, unit = '') => {
      if (val === 0) return `<span class="delta zero">0${unit}</span>`;
      if (val > 0) return `<span class="delta pos">+${val}${unit}</span>`;
      return `<span class="delta neg">${val}${unit}</span>`;
    };

    const toolRows = Object.keys(diff.toolDistribution)
      .map((tool) => {
        const d = diff.toolDistribution[tool];
        return `<tr>
          <td><code>${tool}</code></td>
          <td>${d.baseline}</td>
          <td>${d.candidate}</td>
          <td>${formatDelta(d.delta)}</td>
        </tr>`;
      })
      .join('');

    const stepRows = diff.alignment
      .map((s) => {
        const b = s.baselineStep ? `<code>${s.baselineStep.toolName || 'turn_end'}</code>` : '<span class="empty">-</span>';
        const c = s.candidateStep ? `<code>${s.candidateStep.toolName || 'turn_end'}</code>` : '<span class="empty">-</span>';
        return `<tr class="step-${s.alignmentType}">
          <td>${s.stepIndex}</td>
          <td><span class="badge badge-${s.alignmentType}">${s.alignmentType.toUpperCase()}</span></td>
          <td>${b}</td>
          <td>${c}</td>
          <td>${s.divergenceDetails || '-'}</td>
        </tr>`;
      })
      .join('');

    const anomaliesHtml = regression.anomalies.length > 0
      ? `<div class="card alert-card">
          <h3>🚨 Detected Anomalies</h3>
          <ul>
            ${regression.anomalies.map((a) => `<li><strong>[${a.type}]</strong>: ${a.message}</li>`).join('')}
          </ul>
        </div>`
      : '';

    const firstDivHtml = diff.firstDivergence
      ? `<div class="card divergence-card">
          <h3>⚠️ First Divergence Point</h3>
          <p><strong>Turn ${diff.firstDivergence.turnNumber}, Step ${diff.firstDivergence.stepIndex}</strong> (<em>${diff.firstDivergence.type}</em>)</p>
          <p>${diff.firstDivergence.description}</p>
        </div>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trajectory Diff: ${diff.scenarioId}</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #38bdf8;
    }
    body {
      margin: 0;
      padding: 2rem;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.5;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1rem;
    }
    .title {
      font-size: 1.5rem;
      font-weight: 700;
    }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-main {
      background: ${badgeColor};
      color: #fff;
      font-size: 0.9rem;
      padding: 0.5rem 1rem;
    }
    .badge-match { background: #065f46; color: #34d399; }
    .badge-modified { background: #854d0e; color: #fde047; }
    .badge-added { background: #1e40af; color: #93c5fd; }
    .badge-removed { background: #991b1b; color: #fca5a5; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
    }
    .alert-card { border-left: 4px solid #ef4444; margin-bottom: 1.5rem; }
    .divergence-card { border-left: 4px solid #f59e0b; margin-bottom: 1.5rem; }
    .metric-value { font-size: 1.75rem; font-weight: 700; color: var(--accent); }
    .metric-label { font-size: 0.85rem; color: var(--muted); text-transform: uppercase; }
    .delta { font-size: 0.85rem; margin-left: 0.5rem; }
    .delta.pos { color: #f59e0b; }
    .delta.neg { color: #10b981; }
    .delta.zero { color: var(--muted); }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
      font-size: 0.9rem;
    }
    th, td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    th {
      background: #1e293b;
      color: var(--muted);
      text-transform: uppercase;
      font-size: 0.75rem;
    }
    code {
      background: #0f172a;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
      font-family: monospace;
      color: #38bdf8;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">Trajectory Diff: ${diff.scenarioId}</div>
      <div style="color: var(--muted); font-size: 0.9rem; margin-top: 0.25rem;">
        Status: <code>${summary.status.baseline}</code> ➔ <code>${summary.status.candidate}</code>
      </div>
    </div>
    <div>
      <span class="badge badge-main">${badgeText} (${(regression.score * 100).toFixed(1)}%)</span>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="metric-label">Turns</div>
      <div class="metric-value">${summary.turns.candidate} ${formatDelta(summary.turns.delta)}</div>
      <div style="color: var(--muted); font-size: 0.8rem;">Base: ${summary.turns.baseline}</div>
    </div>
    <div class="card">
      <div class="metric-label">Tool Calls</div>
      <div class="metric-value">${summary.toolCalls.candidate} ${formatDelta(summary.toolCalls.delta)}</div>
      <div style="color: var(--muted); font-size: 0.8rem;">Base: ${summary.toolCalls.baseline}</div>
    </div>
    <div class="card">
      <div class="metric-label">Total Tokens</div>
      <div class="metric-value">${summary.tokens.candidateTotal} ${formatDelta(summary.tokens.totalDelta)}</div>
      <div style="color: var(--muted); font-size: 0.8rem;">Base: ${summary.tokens.baselineTotal}</div>
    </div>
    <div class="card">
      <div class="metric-label">Duration</div>
      <div class="metric-value">${summary.durationMs.candidate}ms ${formatDelta(summary.durationMs.delta, 'ms')}</div>
      <div style="color: var(--muted); font-size: 0.8rem;">Base: ${summary.durationMs.baseline}ms</div>
    </div>
  </div>

  ${firstDivHtml}
  ${anomaliesHtml}

  <div class="card" style="margin-bottom: 2rem;">
    <h3>Aligned Step Trajectory</h3>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Alignment</th>
          <th>Baseline Action</th>
          <th>Candidate Action</th>
          <th>Divergence Details</th>
        </tr>
      </thead>
      <tbody>
        ${stepRows}
      </tbody>
    </table>
  </div>

  <div class="card">
    <h3>Tool Invocation Breakdown</h3>
    <table>
      <thead>
        <tr>
          <th>Tool Name</th>
          <th>Baseline Count</th>
          <th>Candidate Count</th>
          <th>Delta</th>
        </tr>
      </thead>
      <tbody>
        ${toolRows}
      </tbody>
    </table>
  </div>
</body>
</html>`;
  }
}
