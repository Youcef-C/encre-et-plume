import { describe, it, expect } from 'vitest';
import { formatBytes } from '../lib/format';

describe('formatBytes', () => {
  it('renders raw octets below 1 Ko', () => {
    expect(formatBytes(512)).toBe('512 o');
    expect(formatBytes(0)).toBe('0 o');
    expect(formatBytes(1023)).toBe('1023 o');
  });

  it('picks Ko for sub-Mo sizes (regression on the hardcoded-Mo bug)', () => {
    expect(formatBytes(3300)).toBe('3,2 Ko');
    expect(formatBytes(512_000)).toBe('500,0 Ko');
  });

  it('picks Mo for sizes ≥ 1 Mo', () => {
    expect(formatBytes(2_516_582)).toBe('2,4 Mo');
  });

  it('picks Go for very large sizes', () => {
    expect(formatBytes(1_181_116_006)).toBe('1,1 Go');
  });
});
