import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WorkspaceConfig } from '../core/types.js';
import { WorkspaceConfigSchema } from '../core/schemas.js';
import { WorkspaceError } from '../core/errors.js';
import { SecurityPolicyChecker } from './security.js';

const execFileAsync = promisify(execFile);

export class WorkspaceManager {
  private config: WorkspaceConfig;
  private security: SecurityPolicyChecker;
  private workspacePath: string | null = null;
  private isCleanedUp = false;

  constructor(
    config: Partial<WorkspaceConfig> = {},
    security: SecurityPolicyChecker = new SecurityPolicyChecker()
  ) {
    this.config = WorkspaceConfigSchema.parse(config);
    this.security = security;
  }

  public async setup(overrideConfig?: Partial<WorkspaceConfig>): Promise<string> {
    if (overrideConfig) {
      this.config = WorkspaceConfigSchema.parse({ ...this.config, ...overrideConfig });
    }
    try {
      const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-harness-ws-'));
      this.workspacePath = path.resolve(tempBase);

      if (this.config.templatePath) {
        const resolvedTemplate = path.resolve(this.config.templatePath);
        await fs.cp(resolvedTemplate, this.workspacePath, {
          recursive: true,
          errorOnExist: false,
        });
      }

      if (this.config.initialFiles) {
        for (const [relPath, content] of Object.entries(this.config.initialFiles)) {
          const targetPath = this.resolvePath(relPath);
          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          await fs.writeFile(targetPath, content, 'utf-8');
        }
      }

      if (this.config.gitInit) {
        await this.initGitRepo();
      }

      return this.workspacePath;
    } catch (err: unknown) {
      await this.teardown().catch(() => {});
      throw new WorkspaceError(`Failed to setup workspace: ${(err as Error).message}`);
    }
  }

  private async initGitRepo(): Promise<void> {
    if (!this.workspacePath) return;
    try {
      await execFileAsync('git', ['init', '-b', 'main'], { cwd: this.workspacePath });
      await execFileAsync('git', ['config', 'user.name', 'AgentHarness'], { cwd: this.workspacePath });
      await execFileAsync('git', ['config', 'user.email', 'harness@agent.local'], { cwd: this.workspacePath });
      await execFileAsync('git', ['add', '.'], { cwd: this.workspacePath });
      await execFileAsync('git', ['commit', '-m', 'initial workspace seed', '--allow-empty'], {
        cwd: this.workspacePath,
      });
    } catch (err: unknown) {
      throw new WorkspaceError(`Failed to initialize git repository in workspace: ${(err as Error).message}`);
    }
  }

  public getWorkspacePath(): string {
    if (!this.workspacePath || this.isCleanedUp) {
      throw new WorkspaceError('Workspace is not initialized or has already been torn down.');
    }
    return this.workspacePath;
  }

  public resolvePath(relativePath: string): string {
    const ws = this.getWorkspacePath();
    const resolved = path.resolve(ws, relativePath);
    this.security.validatePath(resolved, ws);
    return resolved;
  }

  public async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  public async readFile(relativePath: string): Promise<string> {
    const fullPath = this.resolvePath(relativePath);
    return await fs.readFile(fullPath, 'utf-8');
  }

  public async fileExists(relativePath: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(relativePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  public async getGitDiff(): Promise<string> {
    const ws = this.getWorkspacePath();
    try {
      const { stdout } = await execFileAsync('git', ['diff', 'HEAD'], { cwd: ws });
      return stdout;
    } catch (err: unknown) {
      throw new WorkspaceError(`Failed to get git diff: ${(err as Error).message}`);
    }
  }

  public async teardown(): Promise<void> {
    if (this.isCleanedUp || !this.workspacePath) {
      return;
    }
    if (this.config?.cleanup) {
      try {
        await fs.rm(this.workspacePath, { recursive: true, force: true });
      } catch (err: unknown) {
        throw new WorkspaceError(`Failed to clean up workspace: ${(err as Error).message}`);
      }
    }
    this.isCleanedUp = true;
  }
}
