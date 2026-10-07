import { describe, it, expect, afterEach } from 'vitest';
import { TelemetryServer } from '../../src/telemetry/server.js';
import { SteeringController } from '../../src/steering/controller.js';

describe('TelemetryServer Interactive Control REST API', () => {
  let server: TelemetryServer | undefined;

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = undefined;
    }
  });

  it('returns 503 when control endpoints are accessed without steering configured', async () => {
    server = new TelemetryServer({ port: 0 });
    const { url } = await server.start();

    const res = await fetch(`${url}/api/control/state`);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toContain('Steering controller not attached');
  });

  it('returns steering state and handles pause/resume lifecycle', async () => {
    const steering = new SteeringController();
    server = new TelemetryServer({ port: 0, steering });
    const { url } = await server.start();

    // 1. Initial state
    const stateRes = await fetch(`${url}/api/control/state`);
    expect(stateRes.status).toBe(200);
    const state = await stateRes.json();
    expect(state.status).toBe('idle');
    expect(state.isPaused).toBe(false);

    // 2. Pause
    const pauseRes = await fetch(`${url}/api/control/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Operator paused for safety inspect' }),
    });
    expect(pauseRes.status).toBe(200);
    const pauseData = await pauseRes.json();
    expect(pauseData.success).toBe(true);
    expect(pauseData.state.isPaused).toBe(true);

    // 3. Resume
    const resumeRes = await fetch(`${url}/api/control/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'continue' }),
    });
    expect(resumeRes.status).toBe(200);
    const resumeData = await resumeRes.json();
    expect(resumeData.success).toBe(true);
    expect(resumeData.state.isPaused).toBe(false);
  });

  it('supports dynamic adding and deleting breakpoints via REST API', async () => {
    const steering = new SteeringController();
    server = new TelemetryServer({ port: 0, steering });
    const { url } = await server.start();

    // Add breakpoint
    const addRes = await fetch(`${url}/api/control/breakpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'bp_api_test',
        type: 'tool',
        toolPattern: 'bash',
      }),
    });
    expect(addRes.status).toBe(201);
    const addData = await addRes.json();
    expect(addData.success).toBe(true);
    expect(addData.breakpoint.id).toBe('bp_api_test');
    expect(steering.getBreakpoints()).toHaveLength(1);

    // Delete breakpoint
    const delRes = await fetch(`${url}/api/control/breakpoint?id=bp_api_test`, {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(200);
    const delData = await delRes.json();
    expect(delData.success).toBe(true);
    expect(steering.getBreakpoints()).toHaveLength(0);
  });

  it('submits intervention action successfully', async () => {
    const steering = new SteeringController();
    server = new TelemetryServer({ port: 0, steering });
    const { url } = await server.start();

    const intRes = await fetch(`${url}/api/control/intervene`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'inject_prompt',
        prompt: 'Use node script instead of shell command',
      }),
    });
    expect(intRes.status).toBe(200);
    const intData = await intRes.json();
    expect(intData.success).toBe(true);
    expect(steering.getInjectedPrompts()).toContain('Use node script instead of shell command');
  });
});
