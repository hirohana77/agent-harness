export function renderDashboardHtml(options?: { title?: string; apiBase?: string }): string {
  const title = options?.title || 'Agent Harness - Live Telemetry Dashboard';
  const apiBase = options?.apiBase || '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --border: #1f2937;
      --border-focus: #374151;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: #38bdf8;
      --success: #34d399;
      --warning: #fbbf24;
      --danger: #f87171;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background-color: var(--card-bg);
      border-bottom: 1px solid var(--border);
      padding: 14px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 700;
      font-size: 1.15rem;
      letter-spacing: -0.02em;
    }
    .brand-badge {
      background: linear-gradient(135deg, #0284c7, #38bdf8);
      color: #fff;
      font-size: 0.72rem;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .conn-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.85rem;
      padding: 4px 12px;
      border-radius: 999px;
      background-color: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--warning);
      transition: background-color 0.3s;
    }
    .dot.connected { background-color: var(--success); box-shadow: 0 0 8px var(--success); }
    .dot.disconnected { background-color: var(--danger); box-shadow: 0 0 8px var(--danger); }
    
    main {
      flex: 1;
      padding: 24px;
      max-width: 1600px;
      width: 100%;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }
    .stat-card {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .stat-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
      font-weight: 600;
    }
    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      font-family: var(--font-mono);
      color: var(--text);
    }
    .stat-sub {
      font-size: 0.8rem;
      color: var(--text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .content-layout {
      display: grid;
      grid-template-columns: 1fr 380px;
      gap: 20px;
      flex: 1;
    }
    @media (max-width: 1024px) {
      .content-layout { grid-template-columns: 1fr; }
    }

    .panel {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .panel-header {
      padding: 14px 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background-color: rgba(255, 255, 255, 0.02);
    }
    .panel-title {
      font-size: 0.95rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .controls {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .filter-btn {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.78rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    .filter-btn:hover, .filter-btn.active {
      color: var(--text);
      background-color: rgba(56, 189, 248, 0.15);
      border-color: var(--accent);
    }
    .btn-action {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 0.8rem;
      cursor: pointer;
    }
    .btn-action:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .events-feed {
      flex: 1;
      overflow-y: auto;
      max-height: 650px;
      font-family: var(--font-mono);
      font-size: 0.82rem;
    }
    .event-item {
      padding: 10px 18px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      flex-direction: column;
      gap: 6px;
      cursor: pointer;
      transition: background-color 0.15s;
    }
    .event-item:hover {
      background-color: rgba(255, 255, 255, 0.03);
    }
    .event-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .event-meta {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .badge-scenario { background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid #0284c7; }
    .badge-turn { background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid #9333ea; }
    .badge-tool { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid #d97706; }
    .badge-sandbox { background: rgba(20, 184, 166, 0.2); color: #2dd4bf; border: 1px solid #0d9488; }
    .badge-error { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #dc2626; }
    .badge-budget { background: rgba(234, 88, 12, 0.2); color: #fb923c; border: 1px solid #c2410c; }
    .badge-other { background: rgba(156, 163, 175, 0.2); color: #d1d5db; border: 1px solid #4b5563; }

    .event-time { color: var(--text-muted); font-size: 0.75rem; }
    .event-summary { color: var(--text); font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.85rem; }
    .event-detail {
      background-color: #050810;
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid #1e293b;
      margin-top: 4px;
      white-space: pre-wrap;
      word-break: break-all;
      color: #94a3b8;
      display: none;
    }
    .event-item.open .event-detail { display: block; }

    .summary-section {
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .summary-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .summary-title {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      font-weight: 600;
    }
    .summary-box {
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px 14px;
      font-size: 0.85rem;
      line-height: 1.5;
    }

    .assertion-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 0.82rem;
    }
    .assertion-item:last-child { border-bottom: none; }
    .status-tag {
      font-size: 0.72rem;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .status-tag.pass { background: rgba(52, 211, 153, 0.15); color: var(--success); }
    .status-tag.fail { background: rgba(248, 113, 113, 0.15); color: var(--danger); }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span>agent-harness</span>
      <span class="brand-badge">Live Telemetry</span>
    </div>
    <div class="conn-status">
      <div id="connDot" class="dot"></div>
      <span id="connText">Connecting...</span>
    </div>
  </header>

  <main>
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-label">Scenario</span>
        <span id="statScenario" class="stat-value" style="font-size:1.15rem;">-</span>
        <span id="statStatus" class="stat-sub">Waiting for execution...</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Total Events</span>
        <span id="statEvents" class="stat-value">0</span>
        <span id="statRate" class="stat-sub">Buffer: 0 events</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Execution Turns</span>
        <span id="statTurns" class="stat-value">0</span>
        <span id="statTokens" class="stat-sub">Tokens: 0</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Tool Invocations</span>
        <span id="statTools" class="stat-value">0</span>
        <span id="statSandbox" class="stat-sub">Backend: local</span>
      </div>
    </div>

    <div class="content-layout">
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">
            <span>Execution Timeline</span>
            <span id="eventCountBadge" style="font-size:0.75rem; color:var(--text-muted);">(0)</span>
          </div>
          <div class="controls">
            <button class="filter-btn active" data-filter="*">All</button>
            <button class="filter-btn" data-filter="tool:*">Tools</button>
            <button class="filter-btn" data-filter="turn:*">Turns</button>
            <button class="filter-btn" data-filter="scenario:*">Scenario</button>
            <button class="filter-btn" data-filter="error">Errors</button>
            <button id="toggleScrollBtn" class="btn-action">Scroll: ON</button>
            <button id="clearBtn" class="btn-action">Clear</button>
          </div>
        </div>
        <div id="eventsFeed" class="events-feed"></div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Verification & Assertions</div>
          <span id="resultBadge" class="status-tag" style="display:none;"></span>
        </div>
        <div class="summary-section">
          <div class="summary-group">
            <span class="summary-title">Task Overview</span>
            <div id="taskInstruction" class="summary-box">No scenario loaded yet.</div>
          </div>
          <div class="summary-group">
            <span class="summary-title">Assertions Breakdown</span>
            <div id="assertionsList" class="summary-box">
              <span style="color:var(--text-muted);">Awaiting verification report...</span>
            </div>
          </div>
          <div class="summary-group">
            <span class="summary-title">Duration & Metrics</span>
            <div id="metricsBox" class="summary-box">
              Duration: - <br/>
              Exit Status: pending
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>

  <script>
    (function() {
      const apiBase = '${apiBase}';
      let eventCount = 0;
      let toolCallCount = 0;
      let turnCount = 0;
      let tokenUsage = 0;
      let activeFilter = '*';
      let autoScroll = true;
      let allEvents = [];

      const connDot = document.getElementById('connDot');
      const connText = document.getElementById('connText');
      const eventsFeed = document.getElementById('eventsFeed');
      const statScenario = document.getElementById('statScenario');
      const statStatus = document.getElementById('statStatus');
      const statEvents = document.getElementById('statEvents');
      const statRate = document.getElementById('statRate');
      const statTurns = document.getElementById('statTurns');
      const statTokens = document.getElementById('statTokens');
      const statTools = document.getElementById('statTools');
      const statSandbox = document.getElementById('statSandbox');
      const eventCountBadge = document.getElementById('eventCountBadge');
      const toggleScrollBtn = document.getElementById('toggleScrollBtn');
      const clearBtn = document.getElementById('clearBtn');
      const taskInstruction = document.getElementById('taskInstruction');
      const assertionsList = document.getElementById('assertionsList');
      const metricsBox = document.getElementById('metricsBox');
      const resultBadge = document.getElementById('resultBadge');

      function getBadgeClass(type) {
        if (type.startsWith('scenario:')) return 'badge-scenario';
        if (type.startsWith('turn:')) return 'badge-turn';
        if (type.startsWith('tool:')) return 'badge-tool';
        if (type.startsWith('sandbox:')) return 'badge-sandbox';
        if (type === 'error') return 'badge-error';
        if (type.startsWith('budget:')) return 'badge-budget';
        return 'badge-other';
      }

      function formatEventSummary(evt) {
        switch (evt.type) {
          case 'scenario:start':
            return 'Scenario started: ' + (evt.scenarioName || evt.scenarioId);
          case 'scenario:complete':
            return 'Scenario finished (' + (evt.status || 'done') + ') - ' + (evt.passed ? 'PASSED' : 'FAILED') + ' in ' + (evt.durationMs || 0) + 'ms';
          case 'turn:start':
            return 'Turn #' + evt.turnNumber + ' started: ' + (evt.prompt ? evt.prompt.slice(0, 60) + '...' : '');
          case 'turn:complete':
            return 'Turn #' + evt.turnNumber + ' completed. Cumulative tokens: ' + (evt.cumulativeTokens || 0);
          case 'tool:start':
            return 'Tool call: ' + evt.toolName + ' (callId: ' + evt.callId + ')';
          case 'tool:end':
            return 'Tool end: ' + evt.toolName + ' (' + (evt.durationMs || 0) + 'ms) - ' + (evt.result?.success ? 'Success' : 'Failed');
          case 'sandbox:ready':
            return 'Sandbox backend ready: ' + evt.backend + (evt.image ? ' (' + evt.image + ')' : '');
          case 'sandbox:teardown':
            return 'Sandbox backend teardown completed (' + evt.backend + ')';
          case 'error':
            return 'Error in ' + (evt.phase || 'unknown') + ': ' + evt.errorMessage;
          case 'budget:warning':
            return 'Budget warning [' + evt.budgetType + ']: ' + evt.message;
          default:
            return JSON.stringify(evt);
        }
      }

      function renderEventItem(evt) {
        const item = document.createElement('div');
        item.className = 'event-item';
        item.dataset.type = evt.type;

        const timeStr = new Date(evt.timestamp || Date.now()).toLocaleTimeString();
        const badgeClass = getBadgeClass(evt.type);
        const summary = formatEventSummary(evt);

        item.innerHTML = \`
          <div class="event-top">
            <div class="event-meta">
              <span class="badge \${badgeClass}">\${evt.type}</span>
              <span class="event-summary">\${escapeHtml(summary)}</span>
            </div>
            <span class="event-time">\${timeStr}</span>
          </div>
          <pre class="event-detail">\${escapeHtml(JSON.stringify(evt, null, 2))}</pre>
        \`;

        item.addEventListener('click', () => {
          item.classList.toggle('open');
        });

        if (!matchesFilter(evt.type, activeFilter)) {
          item.style.display = 'none';
        }

        eventsFeed.appendChild(item);
        if (autoScroll) {
          eventsFeed.scrollTop = eventsFeed.scrollHeight;
        }
      }

      function escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }

      function matchesFilter(type, filter) {
        if (filter === '*') return true;
        if (filter.endsWith(':*')) {
          return type.startsWith(filter.slice(0, -2) + ':');
        }
        return type === filter;
      }

      function applyFilter() {
        document.querySelectorAll('.event-item').forEach(el => {
          el.style.display = matchesFilter(el.dataset.type, activeFilter) ? 'flex' : 'none';
        });
      }

      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          activeFilter = btn.dataset.filter;
          applyFilter();
        });
      });

      toggleScrollBtn.addEventListener('click', () => {
        autoScroll = !autoScroll;
        toggleScrollBtn.textContent = 'Scroll: ' + (autoScroll ? 'ON' : 'PAUSED');
      });

      clearBtn.addEventListener('click', () => {
        eventsFeed.innerHTML = '';
        allEvents = [];
        eventCountBadge.textContent = '(0)';
      });

      function handleIncomingEvent(evt) {
        allEvents.push(evt);
        eventCount++;
        statEvents.textContent = eventCount;
        eventCountBadge.textContent = '(' + allEvents.length + ')';
        statRate.textContent = 'Buffer: ' + allEvents.length + ' events';

        if (evt.type === 'scenario:start') {
          statScenario.textContent = evt.scenarioName || evt.scenarioId;
          statStatus.textContent = 'Running';
          statStatus.style.color = 'var(--accent)';
        } else if (evt.type === 'tool:start') {
          toolCallCount++;
          statTools.textContent = toolCallCount;
        } else if (evt.type === 'turn:start') {
          turnCount = Math.max(turnCount, evt.turnNumber || 0);
          statTurns.textContent = turnCount;
        } else if (evt.type === 'turn:complete') {
          if (evt.cumulativeTokens) {
            tokenUsage = evt.cumulativeTokens;
            statTokens.textContent = 'Tokens: ' + tokenUsage;
          }
        } else if (evt.type === 'sandbox:ready') {
          statSandbox.textContent = 'Backend: ' + evt.backend + (evt.image ? ' (' + evt.image + ')' : '');
        } else if (evt.type === 'scenario:complete') {
          statStatus.textContent = evt.passed ? 'Completed (PASSED)' : 'Completed (FAILED)';
          statStatus.style.color = evt.passed ? 'var(--success)' : 'var(--danger)';
          if (evt.report) {
            renderReport(evt.report);
          }
        }

        renderEventItem(evt);
      }

      function renderReport(report) {
        resultBadge.style.display = 'inline-block';
        if (report.passed) {
          resultBadge.className = 'status-tag pass';
          resultBadge.textContent = 'PASSED';
        } else {
          resultBadge.className = 'status-tag fail';
          resultBadge.textContent = 'FAILED';
        }

        metricsBox.innerHTML = \`
          Duration: \${report.metrics.durationMs}ms<br/>
          Turns: \${report.metrics.totalTurns}<br/>
          Total Tokens: \${report.metrics.totalTokens}<br/>
          Assertions: \${report.metrics.passedAssertions} / \${report.metrics.totalAssertions} passed
        \`;

        if (report.assertionResults && report.assertionResults.length > 0) {
          assertionsList.innerHTML = report.assertionResults.map(a => \`
            <div class="assertion-item">
              <span>[\${escapeHtml(a.type)}] \${escapeHtml(a.name || a.path || a.rule || 'assertion')}</span>
              <span class="status-tag \${a.passed ? 'pass' : 'fail'}">\${a.passed ? 'PASS' : 'FAIL'}</span>
            </div>
          \`).join('');
        }
      }

      // Load initial history
      fetch(apiBase + '/api/history?limit=100')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            data.forEach(evt => handleIncomingEvent(evt));
          }
        })
        .catch(() => {});

      // Connect to SSE stream
      function connectSSE() {
        connDot.className = 'dot';
        connText.textContent = 'Connecting...';

        const es = new EventSource(apiBase + '/api/events');

        es.onopen = function() {
          connDot.className = 'dot connected';
          connText.textContent = 'Live SSE Connected';
        };

        es.onerror = function() {
          connDot.className = 'dot disconnected';
          connText.textContent = 'Reconnecting...';
        };

        es.addEventListener('connected', function(e) {
          connDot.className = 'dot connected';
          connText.textContent = 'Live SSE Connected';
        });

        // Listen for all generic messages
        es.onmessage = function(e) {
          try {
            const evt = JSON.parse(e.data);
            handleIncomingEvent(evt);
          } catch (err) {}
        };
      }

      connectSSE();
    })();
  </script>
</body>
</html>`;
}
