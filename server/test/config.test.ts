import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  test('provides working defaults for a zero-config local run', () => {
    const config = loadConfig({});

    expect(config.port).toBe(4000);
    expect(config.databasePath.endsWith(path.join('server', 'data', 'designloop.db'))).toBe(true);
    expect(config.contentDir.endsWith('content')).toBe(true);
    expect(config.evaluationLeaseMs).toBe(60_000);
  });

  test('reads overrides and treats blank values as unset', () => {
    const config = loadConfig({ PORT: '5050', DATABASE_PATH: '', LLM_TIMEOUT_MS: '10000' });

    expect(config.port).toBe(5050);
    expect(config.databasePath.endsWith('designloop.db')).toBe(true);
    expect(config.llmTimeoutMs).toBe(10_000);
  });

  test('fails fast with a readable message on invalid values', () => {
    expect(() => loadConfig({ PORT: 'eighty' })).toThrow(/PORT/);
  });
});
