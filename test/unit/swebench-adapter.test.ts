import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { SWEBenchAdapter } from '../../src/benchmark/swebench/adapter.js';
import { SWEBenchInstance } from '../../src/benchmark/swebench/types.js';
import { ScenarioDefinitionSchema } from '../../src/core/schemas.js';

describe('SWEBenchAdapter', () => {
  const sampleInstance: SWEBenchInstance = {
    instance_id: 'django__django-11099',
    repo: 'django/django',
    base_commit: '4f94488b030438a3c8e9b08d4a7c06ec8f67389c',
    problem_statement: 'Username validator in auth allows trailing newline character.',
    hints_text: 'Check ASCIIUsernameValidator regex pattern',
    patch: 'diff --git a/django/contrib/auth/validators.py b/django/contrib/auth/validators.py...',
    test_patch: 'diff --git a/tests/auth_tests/test_validators.py b/tests/auth_tests/test_validators.py...',
    version: '3.0',
    FAIL_TO_PASS: ['tests.auth_tests.test_validators.UsernameValidatorsTests.test_ascii_validator'],
    PASS_TO_PASS: ['tests.auth_tests.test_validators.UsernameValidatorsTests.test_unicode_validator'],
  };

  const genericInstance: SWEBenchInstance = {
    instance_id: 'requests__requests-100',
    repo: 'psf/requests',
    base_commit: 'deadbeef',
    problem_statement: 'Redirect bug',
    FAIL_TO_PASS: ['tests/test_requests.py::test_redirect'],
    PASS_TO_PASS: ['tests/test_requests.py::test_get'],
  };

  it('correctly parses raw instance with array tests', () => {
    const parsed = SWEBenchAdapter.parseInstance(sampleInstance);
    expect(parsed.instance_id).toBe('django__django-11099');
    expect(parsed.repo).toBe('django/django');
    expect(parsed.FAIL_TO_PASS).toEqual(['tests.auth_tests.test_validators.UsernameValidatorsTests.test_ascii_validator']);
  });

  it('correctly parses raw instance with JSON stringified tests', () => {
    const raw = {
      instance_id: 'sympy__sympy-12419',
      repo: 'sympy/sympy',
      problem_statement: 'Matrix multiplication bug',
      FAIL_TO_PASS: '["sympy/matrices/tests/test_matrices.py::test_eval_matrix"]',
      PASS_TO_PASS: '["sympy/matrices/tests/test_matrices.py::test_identity"]',
    };
    const parsed = SWEBenchAdapter.parseInstance(raw);
    expect(parsed.FAIL_TO_PASS).toEqual(['sympy/matrices/tests/test_matrices.py::test_eval_matrix']);
    expect(parsed.PASS_TO_PASS).toEqual(['sympy/matrices/tests/test_matrices.py::test_identity']);
  });

  it('handles empty or malformed test lists gracefully', () => {
    const raw = {
      instance_id: 'test__repo-1',
      repo: 'test/repo',
      FAIL_TO_PASS: '',
      PASS_TO_PASS: null,
    };
    const parsed = SWEBenchAdapter.parseInstance(raw);
    expect(parsed.FAIL_TO_PASS).toEqual([]);
    expect(parsed.PASS_TO_PASS).toEqual([]);
  });

  it('parses JSONL content properly', () => {
    const line1 = JSON.stringify(sampleInstance);
    const line2 = JSON.stringify(genericInstance);
    const jsonl = `${line1}\n\n${line2}\n`;

    const instances = SWEBenchAdapter.parseJSONL(jsonl);
    expect(instances).toHaveLength(2);
    expect(instances[0].instance_id).toBe('django__django-11099');
    expect(instances[1].instance_id).toBe('requests__requests-100');
  });

  it('reads and writes JSONL files to disk', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-swebench-'));
    try {
      const jsonlPath = path.join(tmpDir, 'dataset.jsonl');
      await SWEBenchAdapter.writeJSONL(jsonlPath, [sampleInstance]);

      const loaded = await SWEBenchAdapter.readJSONL(jsonlPath);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].instance_id).toBe(sampleInstance.instance_id);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('sanitizes scenario ids correctly', () => {
    expect(SWEBenchAdapter.sanitizeScenarioId('django__django-11099')).toBe('django__django-11099');
    expect(SWEBenchAdapter.sanitizeScenarioId('sympy/sympy:issue#123')).toBe('sympy_sympy_issue_123');
  });

  it('resolves container image with default and custom prefixes', () => {
    const defaultImg = SWEBenchAdapter.resolveContainerImage(sampleInstance);
    expect(defaultImg).toBe('swebench/sweb.eval.x86_64.django__django-11099:latest');

    const customImg = SWEBenchAdapter.resolveContainerImage(sampleInstance, {
      imagePrefix: 'myregistry.io/eval-',
    });
    expect(customImg).toBe('myregistry.io/eval-django__django-11099:latest');

    const explicitImg = SWEBenchAdapter.resolveContainerImage(sampleInstance, {
      defaultImage: 'ubuntu:22.04',
    });
    expect(explicitImg).toBe('ubuntu:22.04');
  });

  it('generates eval test command with pytest and repo-specific runners', () => {
    const genericCmd = SWEBenchAdapter.generateEvalCommand(genericInstance);
    expect(genericCmd).toBe('pytest -v tests/test_requests.py::test_redirect');

    const djangoCmd = SWEBenchAdapter.generateEvalCommand(sampleInstance);
    expect(djangoCmd).toContain('runtests.py');

    const customCmd = SWEBenchAdapter.generateEvalCommand(sampleInstance, 'tox -e py39');
    expect(customCmd).toBe('tox -e py39');

    const customFn = SWEBenchAdapter.generateEvalCommand(sampleInstance, (inst) => `python runtests.py ${inst.repo}`);
    expect(customFn).toBe('python runtests.py django/django');
  });

  it('converts SWE-bench instance to a valid ScenarioDefinition schema', () => {
    const scenario = SWEBenchAdapter.toScenario(genericInstance, {
      sandboxBackend: 'docker',
      includeHints: true,
      defaultMaxTurns: 25,
      defaultTimeoutMs: 120000,
    });

    // Validate with strict zod schema
    const validated = ScenarioDefinitionSchema.parse(scenario);
    expect(validated.id).toBe('requests__requests-100');
    expect(validated.name).toContain('SWE-bench: requests__requests-100');
    expect(validated.sandbox.backend).toBe('docker');
    expect(validated.sandbox.container?.image).toContain('requests__requests-100');
    expect(validated.budgets.maxTurns).toBe(25);
    expect(validated.budgets.timeoutMs).toBe(120000);
    expect(validated.workspace.initialFiles['SWE_BENCH_TASK.md']).toContain('Redirect bug');
    expect(validated.assertions.commands).toHaveLength(1);
    expect(validated.assertions.commands[0].command).toContain('pytest -v');
  });

  it('batch converts and exports scenarios to YAML/JSON', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-swe-export-'));
    try {
      const paths = await SWEBenchAdapter.exportScenarios([sampleInstance], tmpDir, { format: 'yaml' });
      expect(paths).toHaveLength(1);
      expect(paths[0].endsWith('django__django-11099.yaml')).toBe(true);

      const content = await fs.readFile(paths[0], 'utf8');
      expect(content).toContain('id: django__django-11099');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('streams JSONL reading without keeping entire file in memory and handles tolerant mode', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-stream-'));
    try {
      const jsonlPath = path.join(tmpDir, 'stream.jsonl');
      const lines = [
        JSON.stringify(sampleInstance),
        'corrupt line { not valid json',
        JSON.stringify({
          instance_id: 'sample__repo-2',
          repo: 'sample/repo',
          FAIL_TO_PASS: ['test_x'],
          PASS_TO_PASS: [],
        }),
      ];
      await fs.writeFile(jsonlPath, lines.join('\n'), 'utf8');

      const collected: SWEBenchInstance[] = [];
      const warnings: Error[] = [];

      const count = await SWEBenchAdapter.readJSONLStream(
        jsonlPath,
        (inst) => {
          collected.push(inst);
        },
        {
          tolerant: true,
          onWarning: (err) => {
            warnings.push(err);
          },
        }
      );

      expect(count).toBe(2);
      expect(collected).toHaveLength(2);
      expect(warnings).toHaveLength(1);
      expect(collected[0].instance_id).toBe('django__django-11099');
      expect(collected[1].instance_id).toBe('sample__repo-2');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('selects repository-specific test runner commands for known repositories', () => {
    const sympyInst: SWEBenchInstance = {
      instance_id: 'sympy__sympy-1',
      repo: 'sympy/sympy',
      base_commit: '123',
      problem_statement: 'test',
      FAIL_TO_PASS: ['test_bar'],
      PASS_TO_PASS: [],
    };
    expect(SWEBenchAdapter.generateEvalCommand(sampleInstance)).toContain('runtests.py');
    expect(SWEBenchAdapter.generateEvalCommand(sympyInst)).toContain('bin/test');
  });
});
