import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WorkspaceConfig } from '../core/types.js';
import { WorkspaceError } from '../core/errors.js';
import { SecurityPolicyChecker } from './security.js';

const execFileAsync = promisify(execFile);

export class WorkspaceManager {
  private config: WorkspaceConfig;
  private security: SecurityPolicyChecker;
  private workspacePath: string | null = null;
  private isCleanedUp = false;

  constructor(config: WorkspaceConfig, security: SecurityPolicyChecker) {
    this.config = config;
    this.security = security;
  }

  /**
   * Initializes the isolated workspace folder, applies templates, initial files, and git setup.
   */
  public async setup(): Promise<string> {
    try {
      const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-harness-ws-'));
      this.workspacePath = path.resolve(tempBase);

      // 1. Copy template directory if provided
      if (this.config.templatePath) {
        const resolvedTemplate = path.resolve(this.config.templatePath);
        await fs.cp(resolvedTemplate, this.workspacePath, {
          recursive: true,
          errorOnExist: false,
        });
      }

      // 2. Populate initialFiles
      if (this.config.initialFiles) {
        for (const [relPath, content] of Object.entries(this.config.initialFiles)) {
          await this.writeFile(relPath, content);
        }
      }

      // 3. Initialize git repository if configured
      if (this.config.gitInit) {
        await this.initGit();
      }

      return this.workspacePath;
    } catch (err: unknown) {
      await this.teardown().catch(() => {});
      throw new WorkspaceError(`Failed to setup workspace: ${(err as Error).message}`, err);
    }
  }

  public getWorkspacePath(): string {
    if (!this.workspacePath) {
      throw new WorkspaceError('Workspace is not initialized. Call setup() first.');
    }
    return this.workspacePath;
  }

  /**
   * Safely write a file inside the isolated workspace
   */
  public async writeFile(relativePath: string, content: string): Promise<string> {
    const fullPath = this.security.validatePath(path.join(this.getWorkspacePath(), relativePath));
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf8');
    return fullPath;
  }

  /**
   * Safely read a file from inside the isolated workspace
   */
  public async readFile(relativePath: string): Promise<string> {
    const fullPath = this.security.validatePath(path.join(this.getWorkspacePath(), relativePath));
    try {
      return await fs.readFile(fullPath, 'utf8');
    } catch (err: unknown) {
      throw new WorkspaceError(`File not found or unreadable: ${relativePath}`, err);
    }
  }

  /**
   * Check if a file exists in the workspace
   */
  public async fileExists(relativePath: string): Promise<boolean> {
    try {
      const fullPath = this.security.validatePath(path.join(this.getWorkspacePath(), relativePath));
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Capture git diff against initial commit (or HEAD)
   */
  public async getGitDiff(): Promise<string> {
    if (!this.config.gitInit) {
      return '';
    }
    try {
      const { stdout } = await execFileAsync('git', ['diff', 'HEAD'], {
        cwd: this.getWorkspacePath(),
      });
      return stdout;
    } catch {
      return '';
    }
  }

  /**
   * Teardown and clean up workspace directory
   */
  public async teardown(): Promise<void> {
    if (this.isCleanedUp || !this.workspacePath) {
      return;
    }
    if (this.config.cleanup) {
      try {
        await fs.rm(this.workspacePath, { recursive: true, force: true });
      } catch {
        // Ignore removal error
      }
    }
    this.isCleanedUp = true;
  }

  private async initGit(): Promise<void> {
    const cwd = this.getWorkspacePath();
    await execFileAsync('git', ['init', '-b', 'main'], { cwd });
    await execFileAsync('git', ['config', 'user.name', 'agent-harness'], { cwd });
    await execFileAsync('git', ['config', 'user.email', 'harness@local'], { cwd });
    await execFileAsync('git', ['add', '-A'], { cwd });
    await execFileAsync('git', ['commit', '-m', 'Initial workspace state', '--allow-empty'], { cwd });
  }
}
