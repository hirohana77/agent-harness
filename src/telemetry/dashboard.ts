export function renderDashboardHtml(options?: { title?: string; apiBase?: string }): string {
  const title = options?.title || 'Agent Harness - Live Telemetry Dashboard';
  const apiBase = options?.apiBase || '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <!-- agent-harness live dashboard -->
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
    .badge {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 9999px;
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent);
      border: 1px solid rgba(56, 189, 248, 0.3);
    }
    .connection-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--text-muted);
      display: inline-block;
      transition: background 0.3s;
    }
    .dot.connected {
      background: var(--success);
      box-shadow: 0 0 8px rgba(52, 211, 153, 0.6);
    }
    .dot.disconnected {
      background: var(--danger);
    }
    .dot.paused {
      background: var(--warning);
      box-shadow: 0 0 8px rgba(251, 191, 36, 0.6);
      animation: pulse 1.2s infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.2); opacity: 0.7; }
    }
    .container {
      display: grid;
      grid-template-columns: 340px 1fr;
      gap: 16px;
      padding: 16px 24px;
      flex: 1;
      height: calc(100vh - 65px);
      box-sizing: border-box;
      overflow: hidden;
    }
    .sidebar {
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow-y: auto;
    }
    .card {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
    .card h3 {
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .stat-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .stat-box {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 6px;
      padding: 10px;
    }
    .stat-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-bottom: 4px;
    }
    .stat-value {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text);
      font-family: var(--font-mono);
    }
    .status-tag {
      display: inline-block;
      font-size: 0.75rem;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
    }
    .status-tag.running { background: rgba(56, 189, 248, 0.2); color: var(--accent); }
    .status-tag.paused { background: rgba(251, 191, 36, 0.2); color: var(--warning); border: 1px solid var(--warning); }
    .status-tag.pass { background: rgba(52, 211, 153, 0.2); color: var(--success); }
    .status-tag.fail { background: rgba(248, 113, 113, 0.2); color: var(--danger); }

    /* Steering Control Console styles */
    .control-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }
    .btn {
      background: #1f2937;
      color: var(--text);
      border: 1px solid var(--border-focus);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.8rem;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s;
    }
    .btn:hover { background: #374151; }
    .btn.btn-primary { background: #0284c7; border-color: #38bdf8; color: #fff; }
    .btn.btn-primary:hover { background: #0369a1; }
    .btn.btn-success { background: #059669; border-color: #34d399; color: #fff; }
    .btn.btn-success:hover { background: #047857; }
    .btn.btn-warning { background: #d97706; border-color: #fbbf24; color: #fff; }
    .btn.btn-warning:hover { background: #b45309; }
    .btn.btn-danger { background: #dc2626; border-color: #f87171; color: #fff; }
    .btn.btn-danger:hover { background: #b91c1c; }

    .breakpoint-banner {
      display: none;
      background: rgba(251, 191, 36, 0.15);
      border: 1px solid var(--warning);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 12px;
    }
    .breakpoint-banner.active {
      display: block;
    }
    .breakpoint-title {
      color: var(--warning);
      font-weight: 700;
      font-size: 0.85rem;
      margin-bottom: 4px;
    }
    .breakpoint-desc {
      font-size: 0.8rem;
      color: var(--text);
      margin-bottom: 8px;
      word-break: break-all;
    }

    .main-view {
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow: hidden;
      height: 100%;
    }
    .controls-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 16px;
    }
    .filter-group {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .filter-btn {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    .filter-btn.active, .filter-btn:hover {
      background: rgba(56, 189, 248, 0.1);
      color: var(--accent);
      border-color: var(--accent);
    }
    .events-panel {
      flex: 1;
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      position: relative;
    }
    .event-item {
      background: rgba(255, 255, 255, 0.02);
      border-left: 3px solid var(--border);
      border-radius: 4px;
      padding: 10px 14px;
      font-size: 0.85rem;
      display: flex;
      flex-direction: column;
      gap: 6px;
      transition: background 0.2s;
    }
    .event-item:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    .event-item.tool { border-left-color: var(--accent); }
    .event-item.turn { border-left-color: #a78bfa; }
    .event-item.scenario { border-left-color: #ec4899; }
    .event-item.error { border-left-color: var(--danger); background: rgba(248, 113, 113, 0.05); }
    .event-item.breakpoint { border-left-color: var(--warning); background: rgba(251, 191, 36, 0.08); }

    .event-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .event-type {
      font-family: var(--font-mono);
      font-weight: 600;
      color: var(--text);
    }
    .event-body {
      font-size: 0.85rem;
      word-break: break-word;
    }
    .event-payload {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      background: #0d1117;
      border: 1px solid rgba(255, 255, 255, 0.05);
      padding: 8px;
      border-radius: 4px;
      white-space: pre-wrap;
      max-height: 200px;
      overflow-y: auto;
      color: #94a3b8;
      display: none;
      margin-top: 6px;
    }
    .toggle-payload {
      font-size: 0.75rem;
      color: var(--accent);
      cursor: pointer;
      align-self: flex-start;
      margin-top: 4px;
      user-select: none;
    }
    .assertion-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 0.8rem;
    }
    .assertion-item:last-child { border-bottom: none; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span>Agent Harness</span>
      <span class="badge">Telemetry & Steering</span>
    </div>
    <div class="connection-status">
      <span id="connDot" class="dot"></span>
      <span id="connText">Connecting...</span>
    </div>
  </header>

  <div class="container">
    <div class="sidebar">
      <div class="card">
        <h3>
          Scenario Overview
          <span id="scenarioStatusBadge" class="status-tag">IDLE</span>
        </h3>
        <div style="font-size: 0.85rem; margin-bottom: 12px; color: var(--text-muted);" id="scenarioTitle">
          Waiting for scenario execution...
        </div>
        <div class="stat-grid">
          <div class="stat-box">
            <div class="stat-label">Current Turn</div>
            <div class="stat-value" id="turnVal">0</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Tool Calls</div>
            <div class="stat-value" id="toolsVal">0</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Cumulative Tokens</div>
            <div class="stat-value" id="tokensVal">0</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Elapsed (s)</div>
            <div class="stat-value" id="timeVal">0.0</div>
          </div>
        </div>
      </div>

      <!-- Interactive Steering & HITL Console -->
      <div class="card" id="steeringCard">
        <h3>
          Interactive Steering
          <span id="steeringBadge" class="status-tag">ACTIVE</span>
        </h3>
        
        <div id="breakpointBanner" class="breakpoint-banner">
          <div class="breakpoint-title">⏸️ BREAKPOINT HIT</div>
          <div id="breakpointDesc" class="breakpoint-desc">Execution suspended at breakpoint</div>
          <div class="control-actions">
            <button id="bannerResumeBtn" class="btn btn-success">Resume</button>
            <button id="bannerInjectBtn" class="btn btn-primary">Inject Prompt</button>
            <button id="bannerSkipBtn" class="btn btn-warning">Skip Tool</button>
            <button id="bannerAbortBtn" class="btn btn-danger">Abort</button>
          </div>
        </div>

        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 8px;">
          Runtime Intervention Controls:
        </div>
        <div class="control-actions">
          <button id="btnPause" class="btn btn-warning">Pause</button>
          <button id="btnResume" class="btn btn-success">Resume</button>
          <button id="btnInjectPrompt" class="btn">Guide Prompt</button>
          <button id="btnAbort" class="btn btn-danger">Abort</button>
        </div>
      </div>

      <div class="card">
        <h3>
          Verification & Assertions
          <span id="resultBadge" class="status-tag" style="display:none;"></span>
        </h3>
        <div id="assertionsList" style="max-height: 220px; overflow-y: auto;">
          <div style="font-size: 0.8rem; color: var(--text-muted);">No assertions evaluated yet.</div>
        </div>
        <div id="metricsBox" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 10px;"></div>
      </div>
    </div>

    <div class="main-view">
      <div class="controls-bar">
        <div class="filter-group">
          <button class="filter-btn active" data-filter="all">All Events</button>
          <button class="filter-btn" data-filter="tool">Tools</button>
          <button class="filter-btn" data-filter="turn">Turns</button>
          <button class="filter-btn" data-filter="breakpoint">Breakpoints</button>
          <button class="filter-btn" data-filter="error">Errors</button>
        </div>
        <div>
          <label style="font-size: 0.8rem; color: var(--text-muted); cursor: pointer;">
            <input type="checkbox" id="autoScrollCheck" checked style="vertical-align: middle;"> Auto Scroll
          </label>
        </div>
      </div>

      <div class="events-panel" id="eventsContainer">
        <!-- Events rendered dynamically -->
      </div>
    </div>
  </div>

  <script>
    (function() {
      const apiBase = '${apiBase}';
      const eventsContainer = document.getElementById('eventsContainer');
      const connDot = document.getElementById('connDot');
      const connText = document.getElementById('connText');
      const scenarioTitle = document.getElementById('scenarioTitle');
      const scenarioStatusBadge = document.getElementById('scenarioStatusBadge');
      const turnVal = document.getElementById('turnVal');
      const toolsVal = document.getElementById('toolsVal');
      const tokensVal = document.getElementById('tokensVal');
      const timeVal = document.getElementById('timeVal');
      const assertionsList = document.getElementById('assertionsList');
      const metricsBox = document.getElementById('metricsBox');
      const resultBadge = document.getElementById('resultBadge');
      const autoScrollCheck = document.getElementById('autoScrollCheck');
      const breakpointBanner = document.getElementById('breakpointBanner');
      const breakpointDesc = document.getElementById('breakpointDesc');

      let currentFilter = 'all';
      let eventCount = 0;
      let toolCallCount = 0;
      let startEpoch = null;
      let timerInterval = null;

      // Filter buttons
      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentFilter = btn.dataset.filter;
          filterEvents();
        });
      });

      function filterEvents() {
        const items = eventsContainer.querySelectorAll('.event-item');
        items.forEach(el => {
          if (currentFilter === 'all') {
            el.style.display = 'flex';
          } else if (currentFilter === 'tool' && el.classList.contains('tool')) {
            el.style.display = 'flex';
          } else if (currentFilter === 'turn' && el.classList.contains('turn')) {
            el.style.display = 'flex';
          } else if (currentFilter === 'breakpoint' && el.classList.contains('breakpoint')) {
            el.style.display = 'flex';
          } else if (currentFilter === 'error' && el.classList.contains('error')) {
            el.style.display = 'flex';
          } else {
            el.style.display = 'none';
          }
        });
      }

      function escapeHtml(str) {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      function renderEventItem(evt) {
        eventCount++;
        const item = document.createElement('div');
        let categoryClass = 'custom';
        if (evt.type.startsWith('tool:')) categoryClass = 'tool';
        else if (evt.type.startsWith('turn:')) categoryClass = 'turn';
        else if (evt.type.startsWith('scenario:')) categoryClass = 'scenario';
        else if (evt.type.startsWith('breakpoint:') || evt.type.startsWith('steering:')) categoryClass = 'breakpoint';
        else if (evt.type === 'error') categoryClass = 'error';

        item.className = 'event-item ' + categoryClass;
        item.dataset.type = evt.type;

        let summaryText = '';
        if (evt.type === 'scenario:start') {
          summaryText = 'Scenario started: ' + (evt.scenarioName || evt.scenarioId);
        } else if (evt.type === 'turn:start') {
          summaryText = 'Turn #' + evt.turnNumber + ' started: "' + (evt.prompt || '').slice(0, 80) + '..."';
        } else if (evt.type === 'tool:start') {
          summaryText = 'Calling tool: ' + evt.toolName + '(' + JSON.stringify(evt.arguments || {}).slice(0, 100) + ')';
        } else if (evt.type === 'tool:end') {
          const status = evt.result?.success ? 'success' : 'failed';
          summaryText = 'Tool ' + evt.toolName + ' completed with ' + status + ' (' + (evt.durationMs || 0) + 'ms)';
        } else if (evt.type === 'breakpoint:hit') {
          summaryText = 'Breakpoint hit: ' + (evt.hit?.reason || evt.hit?.breakpoint?.id || 'paused');
        } else if (evt.type === 'breakpoint:resume') {
          summaryText = 'Resumed from breakpoint: Action=' + evt.action?.type;
        } else if (evt.type === 'scenario:complete') {
          summaryText = 'Scenario finished. Passed: ' + evt.passed;
        } else if (evt.type === 'error') {
          summaryText = 'Error [' + evt.phase + ']: ' + evt.errorMessage;
        } else {
          summaryText = evt.type + ' event';
        }

        const dateStr = evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();

        item.innerHTML = \`
          <div class="event-header">
            <span class="event-type">\${escapeHtml(evt.type)}</span>
            <span>\${dateStr}</span>
          </div>
          <div class="event-body">\${escapeHtml(summaryText)}</div>
          <span class="toggle-payload">Show Details</span>
          <pre class="event-payload">\${escapeHtml(JSON.stringify(evt, null, 2))}</pre>
        \`;

        const toggleBtn = item.querySelector('.toggle-payload');
        const payloadPre = item.querySelector('.event-payload');
        toggleBtn.addEventListener('click', () => {
          if (payloadPre.style.display === 'block') {
            payloadPre.style.display = 'none';
            toggleBtn.textContent = 'Show Details';
          } else {
            payloadPre.style.display = 'block';
            toggleBtn.textContent = 'Hide Details';
          }
        });

        if (currentFilter !== 'all') {
          if (
            (currentFilter === 'tool' && !categoryClass.includes('tool')) ||
            (currentFilter === 'turn' && !categoryClass.includes('turn')) ||
            (currentFilter === 'breakpoint' && !categoryClass.includes('breakpoint')) ||
            (currentFilter === 'error' && !categoryClass.includes('error'))
          ) {
            item.style.display = 'none';
          }
        }

        eventsContainer.appendChild(item);

        if (autoScrollCheck.checked) {
          eventsContainer.scrollTop = eventsContainer.scrollHeight;
        }
      }

      function handleIncomingEvent(evt) {
        if (!evt || !evt.type) return;

        if (evt.type === 'scenario:start') {
          scenarioTitle.textContent = evt.scenarioName || evt.scenarioId;
          scenarioStatusBadge.className = 'status-tag running';
          scenarioStatusBadge.textContent = 'RUNNING';
          startEpoch = Date.now();
          if (timerInterval) clearInterval(timerInterval);
          timerInterval = setInterval(() => {
            if (startEpoch) {
              timeVal.textContent = ((Date.now() - startEpoch) / 1000).toFixed(1);
            }
          }, 200);
        } else if (evt.type === 'turn:start') {
          turnVal.textContent = evt.turnNumber;
        } else if (evt.type === 'turn:complete') {
          if (evt.cumulativeTokens) tokensVal.textContent = evt.cumulativeTokens;
        } else if (evt.type === 'tool:start') {
          toolCallCount++;
          toolsVal.textContent = toolCallCount;
        } else if (evt.type === 'breakpoint:hit') {
          scenarioStatusBadge.className = 'status-tag paused';
          scenarioStatusBadge.textContent = 'PAUSED';
          connDot.className = 'dot paused';
          breakpointBanner.classList.add('active');
          breakpointDesc.textContent = (evt.hit?.reason || 'Breakpoint triggered: ' + (evt.hit?.breakpoint?.id || ''));
        } else if (evt.type === 'breakpoint:resume') {
          scenarioStatusBadge.className = 'status-tag running';
          scenarioStatusBadge.textContent = 'RUNNING';
          connDot.className = 'dot connected';
          breakpointBanner.classList.remove('active');
        } else if (evt.type === 'scenario:complete') {
          if (timerInterval) clearInterval(timerInterval);
          breakpointBanner.classList.remove('active');
          if (evt.passed) {
            scenarioStatusBadge.className = 'status-tag pass';
            scenarioStatusBadge.textContent = 'PASSED';
          } else {
            scenarioStatusBadge.className = 'status-tag fail';
            scenarioStatusBadge.textContent = evt.status?.toUpperCase() || 'FAILED';
          }
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

      // Steering Control API Handlers
      async function sendControl(endpoint, body) {
        try {
          const res = await fetch(apiBase + '/api/control/' + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
          });
          return await res.json();
        } catch (err) {
          console.error('Steering API error:', err);
        }
      }

      document.getElementById('btnPause')?.addEventListener('click', () => {
        sendControl('pause', { reason: 'Operator requested pause via dashboard' });
      });

      document.getElementById('btnResume')?.addEventListener('click', () => {
        sendControl('resume', { type: 'continue' });
      });

      document.getElementById('bannerResumeBtn')?.addEventListener('click', () => {
        sendControl('resume', { type: 'continue' });
      });

      document.getElementById('btnInjectPrompt')?.addEventListener('click', () => {
        const prompt = window.prompt('Enter guidance prompt to inject into agent:');
        if (prompt) {
          sendControl('intervene', { type: 'continue', prompt });
        }
      });

      document.getElementById('bannerInjectBtn')?.addEventListener('click', () => {
        const prompt = window.prompt('Enter guidance prompt to inject into agent:');
        if (prompt) {
          sendControl('intervene', { type: 'continue', prompt });
        }
      });

      document.getElementById('bannerSkipBtn')?.addEventListener('click', () => {
        sendControl('intervene', { type: 'skip_tool', reason: 'Skipped via dashboard' });
      });

      document.getElementById('bannerAbortBtn')?.addEventListener('click', () => {
        if (window.confirm('Are you sure you want to abort the current scenario?')) {
          sendControl('intervene', { type: 'abort', reason: 'Aborted via dashboard' });
        }
      });

      document.getElementById('btnAbort')?.addEventListener('click', () => {
        if (window.confirm('Are you sure you want to abort the execution?')) {
          sendControl('intervene', { type: 'abort', reason: 'Aborted via dashboard' });
        }
      });

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
