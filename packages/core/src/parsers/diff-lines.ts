/**
 * Unified-diff helpers: map added lines to their line numbers in the patched file.
 * (Line-prefix handling is diff format structure, not JavaScript/Python source parsing.)
 */

export interface AddedLinesResult {
  /** Joined added-line text for AST parsing */
  syntheticSource: string;
  /**
   * For each 0-based line index in syntheticSource, the 1-based line number in the new file.
   * Length equals number of lines in syntheticSource (split on \n).
   */
  syntheticLineToNewFileLine: number[];
}

function parseNewHunkRange(line: string): { newStart: number } | null {
  if (!line.startsWith('@@')) {
    return null;
  }
  const plusIdx = line.indexOf('+', 2);
  if (plusIdx === -1) {
    return null;
  }
  let j = plusIdx + 1;
  while (j < line.length && line[j] === ' ') {
    j++;
  }
  if (j >= line.length || line[j] < '0' || line[j] > '9') {
    return null;
  }
  let start = 0;
  while (j < line.length && line[j] >= '0' && line[j] <= '9') {
    start = start * 10 + (line.charCodeAt(j) - 48);
    j++;
  }
  return { newStart: start };
}

/**
 * Extract added lines from a unified diff and map each synthetic line index to the new-file line number.
 */
export function extractAddedLinesFromPatch(patch: string): AddedLinesResult {
  const syntheticLines: string[] = [];
  const syntheticLineToNewFileLine: number[] = [];

  const rawLines = patch.split(/\r?\n/);
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i];
    if (!line.startsWith('@@')) {
      i++;
      continue;
    }

    const range = parseNewHunkRange(line);
    if (!range) {
      i++;
      continue;
    }

    let newCursor = range.newStart;
    i++;

    while (i < rawLines.length) {
      const hl = rawLines[i];
      if (hl.startsWith('@@')) {
        break;
      }

      if (
        hl.startsWith('diff --git ') ||
        hl.startsWith('--- ') ||
        hl.startsWith('+++ ')
      ) {
        i++;
        continue;
      }

      if (hl === '') {
        i++;
        continue;
      }

      if (hl.startsWith('\\')) {
        i++;
        continue;
      }

      const prefix = hl[0];
      const content = hl.length > 1 ? hl.slice(1) : '';

      if (prefix === ' ') {
        newCursor++;
      } else if (prefix === '-') {
        /* removal: advances only in old file */
      } else if (prefix === '+') {
        syntheticLines.push(content);
        syntheticLineToNewFileLine.push(newCursor);
        newCursor++;
      }

      i++;
    }
  }

  const syntheticSource = syntheticLines.join('\n');
  return { syntheticSource, syntheticLineToNewFileLine };
}
