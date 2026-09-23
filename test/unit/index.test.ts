import { describe, it, expect } from 'vitest';
import { VERSION } from '../../src/index.js';

describe('agent-harness package', () => {
  it('should export the current version', () => {
    expect(VERSION).toBe('0.1.0');
  });
});
