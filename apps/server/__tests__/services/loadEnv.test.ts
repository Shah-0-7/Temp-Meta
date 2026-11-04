import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv, loadEnv } from '../../src/loadEnv';

describe('parseEnv', () => {
  it('reads plain, quoted, exported and commented lines', () => {
    const out = parseEnv(`# comment\n\nA=1\nexport B = two\nC="quoted # not a comment"\nD='single'\nE=value # trailing\nBAD LINE\n1X=no\n`);
    expect(out).toEqual({ A: '1', B: 'two', C: 'quoted # not a comment', D: 'single', E: 'value' });
  });

  it('keeps an empty value empty and handles CRLF and a BOM', () => {
    expect(parseEnv('﻿KEY=\r\nOTHER=x\r\n')).toEqual({ KEY: '', OTHER: 'x' });
  });

  it('keeps = signs inside a value', () => {
    expect(parseEnv('URL=https://x.test/?a=1&b=2')).toEqual({ URL: 'https://x.test/?a=1&b=2' });
  });
});

describe('loadEnv', () => {
  const dir = mkdtempSync(join(tmpdir(), 'env-test-'));
  const file = join(dir, '.env');
  writeFileSync(file, 'FROM_FILE=yes\nALREADY=file\n');

  it('fills missing variables but never overrides ones already set', () => {
    const env: NodeJS.ProcessEnv = { ALREADY: 'real' };
    expect(loadEnv(env, [file])).toEqual([file]);
    expect(env.FROM_FILE).toBe('yes');
    expect(env.ALREADY).toBe('real');
  });

  it('ignores a missing file', () => {
    expect(loadEnv({}, [join(dir, 'nope.env')])).toEqual([]);
  });
});
