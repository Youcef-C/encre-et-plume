import { describe, expect, it } from 'vitest';
import { diffLines, diffWords } from '@encre-et-plume/shared';

// CS-5 shared diff util (line + intra-line word LCS). FE and BE agree on this output.

describe('diffLines', () => {
  it('marks identical inputs all "same"', () => {
    const ops = diffLines(['a', 'b'], ['a', 'b']);
    expect(ops.every((o) => o.kind === 'same')).toBe(true);
    expect(ops).toHaveLength(2);
  });

  it('empty ↔ content is all inserts', () => {
    const ops = diffLines([], ['x', 'y']);
    expect(ops.map((o) => o.kind)).toEqual(['ins', 'ins']);
    expect(ops.map((o) => o.bIndex)).toEqual([0, 1]);
  });

  it('content ↔ empty is all deletes', () => {
    const ops = diffLines(['x', 'y'], []);
    expect(ops.map((o) => o.kind)).toEqual(['del', 'del']);
  });

  it('coalesces a replaced line into a single "change" op with both indices', () => {
    const ops = diffLines(['keep', 'old line', 'tail'], ['keep', 'new line', 'tail']);
    const change = ops.find((o) => o.kind === 'change');
    expect(change).toBeDefined();
    expect(change!.aIndex).toBe(1);
    expect(change!.bIndex).toBe(1);
  });

  it('detects a pure insert amid same lines', () => {
    const ops = diffLines(['a', 'c'], ['a', 'b', 'c']);
    expect(ops.map((o) => o.kind)).toEqual(['same', 'ins', 'same']);
  });

  it('full replace with no common lines pairs into changes', () => {
    const ops = diffLines(['a'], ['z']);
    expect(ops).toEqual([{ kind: 'change', aIndex: 0, bIndex: 0 }]);
  });
});

describe('diffWords', () => {
  it('identical strings are one "same" run', () => {
    expect(diffWords('le chat noir', 'le chat noir')).toEqual([{ kind: 'same', text: 'le chat noir' }]);
  });

  it('highlights an intra-line word change as del + ins', () => {
    const runs = diffWords('le chat noir', 'le chien noir');
    const kinds = runs.map((r) => r.kind);
    expect(kinds).toContain('del');
    expect(kinds).toContain('ins');
    expect(runs.find((r) => r.kind === 'del')!.text).toContain('chat');
    expect(runs.find((r) => r.kind === 'ins')!.text).toContain('chien');
    // Reassembling the "same" + "ins" runs yields the new string.
    expect(runs.filter((r) => r.kind !== 'del').map((r) => r.text).join('')).toBe('le chien noir');
  });

  it('preserves whitespace tokens', () => {
    const runs = diffWords('a  b', 'a  b');
    expect(runs.map((r) => r.text).join('')).toBe('a  b');
  });

  it('empty ↔ content is one insert run', () => {
    expect(diffWords('', 'hello world')).toEqual([{ kind: 'ins', text: 'hello world' }]);
  });
});
