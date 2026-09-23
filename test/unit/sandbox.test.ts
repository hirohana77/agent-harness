import { describe, it, expect } from 'vitest';
import { SecurityPolicyChecker } from '../../src/sandbox/security.js';
import { WorkspaceManager } from '../../src/sandbox/workspace.js';
import { CommandExecutor } from '../../src/sandbox/executor.js';
import { SecurityViolationError } from '../../src/core/errors.js';

describe('Sandbox & Security Engine', () => {
  it('blocks dangerous denied commands', () => {
    const checker = new SecurityPolicyChecker(
      {
        allowedCommands: ['*'],
        deniedCommands: ['rm -rf /', ':(){ :|:& };:', 'reboot'],
        allowedPaths: ['.'],
        networkEnabled: false,
      },
      '/tmp/workspace'
    );

    expect(() => checker.validateCommand('rm -rf /')).toThrow(SecurityViolationError);
    expect(() => checker.validateCommand('echo hello && reboot')).toThrow(SecurityViolationError);
    expect(() => checker.validateCommand('git status')).not.toThrow();
  });

  it('detects and prevents path traversal attacks', () => {
    const checker = new SecurityPolicyChecker(
      {
        allowedCommands: ['*'],
        deniedCommands: [],
        allowedPaths: ['.'],
        networkEnabled: false,
      },
      '/tmp/workspace'
    );

    expect(() => checker.validatePath('../outside.txt')).toThrow(SecurityViolationError);
    expect(() => checker.validatePath('/etc/passwd')).toThrow(SecurityViolationError);
    expect(checker.validatePath('src/index.ts')).toContain('/tmp/workspace/src/index.ts');
  });

  it('manages workspace lifecycle and file operations', async () => {
    const checker = new SecurityPolicyChecker(
      { allowedCommands: ['*'], deniedCommands: [], allowedPaths: ['.'], networkEnabled: false },
      '/tmp'
    );
    const ws = new WorkspaceManager(
      {
        initialFiles: {
          'src/app.ts': 'export const app = 42;',
          'README.md': '# Test Workspace',
        },
        gitInit: true,
        cleanup: true,
      },
      checker
    );

    const wsPath = await ws.setup();
    expect(wsPath).toBeDefined();

    expect(await ws.fileExists('src/app.ts')).toBe(true);
    expect(await ws.readFile('src/app.ts')).toBe('export const app = 42;');

    await ws.writeFile('src/new.ts', 'export const added = true;');
    expect(await ws.fileExists('src/new.ts')).toBe(true);

    const diff = await ws.getGitDiff();
    expect(diff).toBeDefined();

    await ws.teardown();
    expect(await ws.fileExists('src/app.ts')).toBe(false);
  });

  it('safely executes shell commands and handles timeouts', async () => {
    const checker = new SecurityPolicyChecker(
      { allowedCommands: ['*'], deniedCommands: ['rm -rf /'], allowedPaths: ['.'], networkEnabled: false },
      process.cwd()
    );
    const executor = new CommandExecutor(checker);

    const res = await executor.execute('node -e "console.log(1 + 1)"', {
      cwd: process.cwd(),
      timeoutMs: 5000,
    });
    expect(res.success).toBe(true);
    expect(res.output).toBe('2');

    // Test timeout
    const timeoutRes = await executor.execute('sleep 2', {
      cwd: process.cwd(),
      timeoutMs: 100,
    });
    expect(timeoutRes.success).toBe(false);
    expect(timeoutRes.exitCode).toBe(124);

    // Test denied command interception
    const deniedRes = await executor.execute('rm -rf /', {
      cwd: process.cwd(),
    });
    expect(deniedRes.success).toBe(false);
    expect(deniedRes.exitCode).toBe(126);
    expect(deniedRes.error).toContain('security policy');
  });
});
