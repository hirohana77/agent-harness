import { z } from 'zod';

const StringListPreprocessed = z.preprocess((val) => {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return [];
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('(') && trimmed.endsWith(')'))) {
      try {
        const parsed = JSON.parse(trimmed.replace(/'/g, '"'));
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item).trim()).filter(Boolean);
        }
      } catch {
        // Fallback: split by comma if JSON parse fails
        return trimmed
          .slice(1, -1)
          .split(',')
          .map((s) => s.replace(/['"]/g, '').trim())
          .filter(Boolean);
      }
    }
    return [trimmed];
  }
  if (Array.isArray(val)) {
    return val.map((item) => String(item).trim()).filter(Boolean);
  }
  return [];
}, z.array(z.string()).default([]));

export const SWEBenchInstanceRawSchema = z.object({
  instance_id: z.string().min(1),
  repo: z.string().min(1),
  base_commit: z.string().default(''),
  problem_statement: z.string().default(''),
  hints_text: z.string().optional().default(''),
  created_at: z.string().optional(),
  patch: z.string().optional().default(''),
  test_patch: z.string().optional().default(''),
  version: z.string().optional().default(''),
  environment_setup_commit: z.string().optional().default(''),
  FAIL_TO_PASS: StringListPreprocessed,
  PASS_TO_PASS: StringListPreprocessed,
});

export const SWEBenchPredictionSchema = z.object({
  instance_id: z.string().min(1),
  model_patch: z.string().default(''),
  model_name_or_path: z.string().optional().default('unknown'),
});

export const SWEBenchAdapterOptionsSchema = z.object({
  sandboxBackend: z.enum(['local', 'docker', 'podman']).default('docker'),
  imagePrefix: z.string().default('swebench/sweb.eval.x86_64.'),
  defaultImage: z.string().optional(),
  defaultTimeoutMs: z.number().int().positive().default(180000),
  defaultMaxTurns: z.number().int().positive().default(30),
  defaultMaxTokens: z.number().int().positive().default(120000),
  includeHints: z.boolean().default(false),
  customInitialFiles: z.record(z.string(), z.string()).default({}),
  network: z.string().default('none'),
  memoryLimit: z.string().default('4g'),
  cpuLimit: z.number().positive().default(2),
});
