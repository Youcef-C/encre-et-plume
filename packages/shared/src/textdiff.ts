// CS-5 — small, dependency-free text diff shared by FE and BE (line + intra-line word LCS).
// No heavy dependency: classic LCS is plenty for page-sized scenario snapshots.

export type LineDiffKind = 'same' | 'del' | 'ins' | 'change';
export interface LineDiffOp {
  kind: LineDiffKind;
  aIndex?: number; // index into the old lines (del/change/same)
  bIndex?: number; // index into the new lines (ins/change/same)
}

export type WordDiffKind = 'same' | 'del' | 'ins';
export interface WordDiffRun {
  kind: WordDiffKind;
  text: string;
}

/** LCS length matrix over two token arrays (rows = a, cols = b). */
function lcsMatrix(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    const row = dp[i]!;
    const rowNext = dp[i + 1]!;
    for (let j = n - 1; j >= 0; j--) {
      row[j] = a[i] === b[j] ? rowNext[j + 1]! + 1 : Math.max(rowNext[j]!, row[j + 1]!);
    }
  }
  return dp;
}

/**
 * Line-level diff. Adjacent del+ins pairs are coalesced into a single `change` op so the caller can
 * run `diffWords` on the pair (GitHub-style intra-line word highlight).
 */
export function diffLines(a: string[], b: string[]): LineDiffOp[] {
  const dp = lcsMatrix(a, b);
  const raw: LineDiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      raw.push({ kind: 'same', aIndex: i, bIndex: j });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      raw.push({ kind: 'del', aIndex: i });
      i++;
    } else {
      raw.push({ kind: 'ins', bIndex: j });
      j++;
    }
  }
  while (i < a.length) raw.push({ kind: 'del', aIndex: i++ });
  while (j < b.length) raw.push({ kind: 'ins', bIndex: j++ });

  // Coalesce a run of dels immediately followed by a run of ins into paired `change` ops.
  const out: LineDiffOp[] = [];
  for (let k = 0; k < raw.length; k++) {
    if (raw[k]!.kind === 'del') {
      const dels: LineDiffOp[] = [];
      while (k < raw.length && raw[k]!.kind === 'del') dels.push(raw[k++]!);
      const ins: LineDiffOp[] = [];
      while (k < raw.length && raw[k]!.kind === 'ins') ins.push(raw[k++]!);
      k--; // outer loop will k++
      const pairs = Math.min(dels.length, ins.length);
      for (let p = 0; p < pairs; p++) out.push({ kind: 'change', aIndex: dels[p]!.aIndex, bIndex: ins[p]!.bIndex });
      for (let p = pairs; p < dels.length; p++) out.push(dels[p]!);
      for (let p = pairs; p < ins.length; p++) out.push(ins[p]!);
    } else {
      out.push(raw[k]!);
    }
  }
  return out;
}

/** Split into word tokens, keeping whitespace runs as their own tokens (so spacing is preserved). */
function tokenize(s: string): string[] {
  return s.split(/(\s+)/).filter((t) => t.length > 0);
}

/** Word-level diff of two strings; adjacent runs of the same kind are merged into single runs. */
export function diffWords(a: string, b: string): WordDiffRun[] {
  const at = tokenize(a);
  const bt = tokenize(b);
  const dp = lcsMatrix(at, bt);
  const runs: WordDiffRun[] = [];
  const push = (kind: WordDiffKind, text: string) => {
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.text += text;
    else runs.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < at.length && j < bt.length) {
    if (at[i] === bt[j]) {
      push('same', at[i]!);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      push('del', at[i]!);
      i++;
    } else {
      push('ins', bt[j]!);
      j++;
    }
  }
  while (i < at.length) push('del', at[i++]!);
  while (j < bt.length) push('ins', bt[j++]!);
  return runs;
}
