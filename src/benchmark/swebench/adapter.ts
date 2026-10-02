import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { ScenarioDefinition } from '../../core/types.js';
import { ScenarioDefinitionSchema } from '../../core/schemas.js';
import { SWEBenchInstance, SWEBenchAdapterOptions } from './types.js';
import { SWEBenchInstanceRawSchema, SWEBenchAdapterOptionsSchema } from './schemas.js';

export class SWEBenchAdapter {
  /**
   * Parse and validate a single SWE-bench instance object.
   */
  public static parseInstance(raw: unknown): SWEBenchInstance {
    const validated = SWEBenchInstanceRawSchema.parse(raw);
    return {
      instance_id: validated.instance_id,
      repo: validated.repo,
      base_commit: validated.base_commit,
      problem_statement: validated.problem_statement,
      hints_text: validated.hints_text,
      created_at: validated.created_at,
      patch: validated.patch,
      test_patch: validated.test_patch,
      version: validated.version,
      environment_setup_commit: validated.environment_setup_commit,
      FAIL_TO_PASS: validated.FAIL_TO_PASS,
      PASS_TO_PASS: validated.PASS_TO_PASS,
    };
  }

  /**
   * Parse a JSONL string containing SWE-bench task instances.
   */
  public static parseJSONL(content: string): SWEBenchInstance[] {
    const lines = content.split('\n');
    const instances: SWEBenchInstance[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const raw = JSON.parse(line);
        instances.push(this.parseInstance(raw));
      } catch (err: any) {
        throw new Error(`Failed to parse SWE-bench JSONL at line ${i + 1}: ${err.message}`);
      }
    }

    return instances;
  }

  /**
   * Read SWE-bench instances from a JSONL file.
   */
  public static async readJSONL(filePath: string): Promise<SWEBenchInstance[]> {
    const raw = await fs.readFile(filePath, 'utf8');
    return this.parseJSONL(raw);
  }

  /**
   * Write SWE-bench instances to a JSONL file.
   */
  public static async writeJSONL(filePath: string, instances: SWEBenchInstance[]): Promise<void> {
    const lines = instances.map((inst) => JSON.stringify(inst));
    await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf8');
  }

  /**
   * Sanitize an instance id so it complies with ScenarioDefinition id regex.
   */
  public static sanitizeScenarioId(instanceId: string): string {
    return instanceId.replace(/[^a-zA-Z0-9-_]/g, '_');
  }

  /**
   * Resolve container image for a given instance.
   */
  public static resolveContainerImage(instance: SWEBenchInstance, options?: SWEBenchAdapterOptions): string {
    if (options?.defaultImage) {
      return options.defaultImage;
    }
    const prefix = options?.imagePrefix ?? 'swebench/sweb.eval.x86_64.';
    const sanitizedId = instance.instance_id.toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
    return `${prefix}${sanitizedId}:latest`;
  }

  /**
   * Generate test command to execute FAIL_TO_PASS tests for evaluation.
   */
  public static generateEvalCommand(instance: SWEBenchInstance, customCommand?: string | ((inst: SWEBenchInstance) => string)): string {
    if (typeof customCommand === 'function') {
      return customCommand(instance);
    }
    if (typeof customCommand === 'string') {
      return customCommand;
    }

    const testTargets = [...instance.FAIL_TO_PASS];
    if (testTargets.length === 0) {
      return 'pytest -v';
    }

    // Default pytest execution command for python repositories
    const joinedTests = testTargets.join(' ');
    return `pytest -v ${joinedTests}`;
  }

  /**
   * Convert an SWE-bench instance into an AgentHarness ScenarioDefinition.
   */
  public static toScenario(instance: SWEBenchInstance, options?: SWEBenchAdapterOptions): ScenarioDefinition {
    const validatedOpts = SWEBenchAdapterOptionsSchema.parse(options || {});
    const scenarioId = this.sanitizeScenarioId(instance.instance_id);

    // Build instruction text
    let instruction = `You are an expert autonomous software engineer resolving an issue in ${instance.repo}.\n\n`;
    instruction += `### Problem Statement\n${instance.problem_statement}\n\n`;

    if (validatedOpts.includeHints && instance.hints_text) {
      instruction += `### Additional Hints\n${instance.hints_text}\n\n`;
    }

    instruction += `### Target Tests\n`;
    instruction += `- Fail to Pass (${instance.FAIL_TO_PASS.length} tests): ${instance.FAIL_TO_PASS.join(', ') || 'None'}\n`;
    instruction += `- Pass to Pass (${instance.PASS_TO_PASS.length} tests): ${instance.PASS_TO_PASS.join(', ') || 'None'}\n\n`;
    instruction += `### Task Requirements\n`;
    instruction += `1. Analyze the codebase to reproduce the defect.\n`;
    instruction += `2. Implement the minimal fix without modifying tests or introducing regressions.\n`;
    instruction += `3. Ensure all tests pass cleanly before completing the task.\n`;

    // Initial files inside workspace
    const initialFiles: Record<string, string> = {
      ...(options?.customInitialFiles || {}),
      'SWE_BENCH_TASK.md': instruction,
    };

    if (instance.test_patch) {
      initialFiles['eval_test.patch'] = instance.test_patch;
    }
    if (instance.patch) {
      initialFiles['golden.patch'] = instance.patch;
    }

    const evalCommand = this.generateEvalCommand(instance, options?.testRunnerCommand);
    const containerImage = this.resolveContainerImage(instance, options);

    const scenarioRaw = {
      id: scenarioId,
      name: `SWE-bench: ${instance.instance_id}`,
      description: `SWE-bench task ${instance.instance_id} for ${instance.repo} (${instance.base_commit.slice(0, 7)})`,
      version: instance.version || '1.0.0',
      sandbox: {
        backend: validatedOpts.sandboxBackend,
        container: {
          image: containerImage,
          runtime: 'auto' as const,
          workdir: '/workspace',
          network: validatedOpts.network,
          memoryLimit: validatedOpts.memoryLimit,
          cpuLimit: validatedOpts.cpuLimit,
          removeOnExit: true,
          pullPolicy: 'if-not-present' as const,
        },
      },
      workspace: {
        gitInit: true,
        cleanup: true,
        initialFiles,
      },
      budgets: {
        maxTurns: validatedOpts.defaultMaxTurns,
        timeoutMs: validatedOpts.defaultTimeoutMs,
        maxTokens: validatedOpts.defaultMaxTokens,
      },
      security: {
        allowedCommands: ['*'],
        deniedCommands: ['rm -rf /', ':(){ :|:& };:'],
        networkEnabled: validatedOpts.network !== 'none',
      },
      task: {
        instruction,
        contextFiles: ['SWE_BENCH_TASK.md'],
        expectedOutcome: `Successfully fix the defect described in ${instance.instance_id} so all tests pass.`,
      },
      assertions: {
        files: [],
        commands: [
          {
            name: `Run SWE-bench Evaluation Suite`,
            command: evalCommand,
            expectedExitCode: 0,
            timeoutMs: Math.min(validatedOpts.defaultTimeoutMs, 60000),
          },
        ],
        trajectory: [
          {
            rule: 'no_security_violations' as const,
          },
        ],
      },
    };

    return ScenarioDefinitionSchema.parse(scenarioRaw);
  }

  /**
   * Batch convert multiple SWE-bench instances to scenarios.
   */
  public static batchConvert(instances: SWEBenchInstance[], options?: SWEBenchAdapterOptions): ScenarioDefinition[] {
    return instances.map((inst) => this.toScenario(inst, options));
  }

  /**
   * Export converted scenarios to disk in YAML or JSON format.
   */
  public static async exportScenarios(
    instances: SWEBenchInstance[],
    outputDir: string,
    options?: SWEBenchAdapterOptions & { format?: 'yaml' | 'json' }
  ): Promise<string[]> {
    await fs.mkdir(outputDir, { recursive: true });
    const format = options?.format || 'yaml';
    const outputPaths: string[] = [];

    for (const inst of instances) {
      const scenario = this.toScenario(inst, options);
      const filename = `${scenario.id}.${format === 'yaml' ? 'yaml' : 'json'}`;
      const destPath = path.join(outputDir, filename);

      const content = format === 'yaml' ? YAML.stringify(scenario) : JSON.stringify(scenario, null, 2);
      await fs.writeFile(destPath, content, 'utf8');
      outputPaths.push(destPath);
    }

    return outputPaths;
  }
}
