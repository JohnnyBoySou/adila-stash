export interface LineDiffCounts {
  add: number;
  del: number;
}

const MAX_CELLS = 1_500_000;

export function lineDiffCounts(oldText: string, newText: string): LineDiffCounts {
  if (!oldText && !newText) return { add: 0, del: 0 };
  if (!oldText) return { add: newText.split("\n").length, del: 0 };
  if (!newText) return { add: 0, del: oldText.split("\n").length };

  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const m = oldLines.length;
  const n = newLines.length;

  if (m * n > MAX_CELLS) {
    const oldSet = new Map<string, number>();
    for (const l of oldLines) oldSet.set(l, (oldSet.get(l) ?? 0) + 1);
    let common = 0;
    for (const l of newLines) {
      const c = oldSet.get(l);
      if (c && c > 0) {
        common++;
        oldSet.set(l, c - 1);
      }
    }
    return { add: n - common, del: m - common };
  }

  let prev = new Uint32Array(n + 1);
  let curr = new Uint32Array(n + 1);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  const common = prev[n];
  return { add: n - common, del: m - common };
}
