import React from 'react';
import { Box, Text, useInput } from 'ink';

interface MultilineEditorProps {
  value: string;
  cursor: number;
  width: number;
  height: number;
  isActive?: boolean;
  /** Emit the new text and cursor index after each edit/navigation. */
  onChange: (value: string, cursor: number) => void;
  /** Escape pressed — leave edit sub-mode. */
  onExit: () => void;
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

function lineStartsOf(lines: string[]): number[] {
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1; // +1 for the newline
  }
  return starts;
}

interface Located {
  line: number;
  col: number;
  lines: string[];
  starts: number[];
}

/** Resolve a flat cursor index into a {line, col} position. */
export function locate(value: string, cursor: number): Located {
  const lines = value.split('\n');
  const starts = lineStartsOf(lines);
  let line = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (cursor >= (starts[i] ?? 0)) line = i;
    else break;
  }
  const col = cursor - (starts[line] ?? 0);
  return { line, col, lines, starts };
}

function renderCursorLine(text: string, col: number, width: number): React.ReactNode {
  const w = Math.max(1, width);
  const hOffset = col > w - 1 ? col - (w - 1) : 0;
  const slice = text.slice(hOffset, hOffset + w);
  const localCol = col - hOffset;
  const before = slice.slice(0, localCol);
  const at = slice.slice(localCol, localCol + 1) || ' ';
  const after = slice.slice(localCol + 1);
  return (
    <>
      {before}
      <Text inverse>{at}</Text>
      {after}
    </>
  );
}

/** A controlled multiline editor with vertical and horizontal windowing. */
export function MultilineEditor({
  value,
  cursor,
  width,
  height,
  isActive = true,
  onChange,
  onExit,
}: MultilineEditorProps) {
  useInput(
    (input, key) => {
      const { line, col, lines, starts } = locate(value, cursor);

      if (key.escape) return onExit();
      if (key.leftArrow) return onChange(value, Math.max(0, cursor - 1));
      if (key.rightArrow) return onChange(value, Math.min(value.length, cursor + 1));
      if (key.upArrow) {
        if (line > 0) {
          const target = line - 1;
          const newCol = Math.min(col, (lines[target] ?? '').length);
          onChange(value, (starts[target] ?? 0) + newCol);
        }
        return;
      }
      if (key.downArrow) {
        if (line < lines.length - 1) {
          const target = line + 1;
          const newCol = Math.min(col, (lines[target] ?? '').length);
          onChange(value, (starts[target] ?? 0) + newCol);
        }
        return;
      }
      if (key.home) return onChange(value, starts[line] ?? 0);
      if (key.end) return onChange(value, (starts[line] ?? 0) + (lines[line] ?? '').length);
      if (key.return) {
        return onChange(value.slice(0, cursor) + '\n' + value.slice(cursor), cursor + 1);
      }
      if (key.backspace) {
        if (cursor > 0) onChange(value.slice(0, cursor - 1) + value.slice(cursor), cursor - 1);
        return;
      }
      if (key.delete) {
        if (cursor < value.length) onChange(value.slice(0, cursor) + value.slice(cursor + 1), cursor);
        return;
      }
      if (key.ctrl || key.meta || key.tab) return;
      if (input) {
        onChange(value.slice(0, cursor) + input + value.slice(cursor), cursor + input.length);
      }
    },
    { isActive },
  );

  const { line: cursorLine, col, lines } = locate(value, cursor);
  const start = clamp(cursorLine - Math.floor(height / 2), 0, Math.max(0, lines.length - height));

  const rows: React.ReactNode[] = [];
  for (let i = 0; i < height; i += 1) {
    const idx = start + i;
    if (idx >= lines.length) {
      rows.push(
        <Text key={`empty-${i}`} dimColor>
          ~
        </Text>,
      );
      continue;
    }
    const text = lines[idx] ?? '';
    if (idx === cursorLine && isActive) {
      rows.push(<Text key={idx}>{renderCursorLine(text, col, width)}</Text>);
    } else {
      rows.push(
        <Text key={idx} wrap="truncate-end">
          {text.length > 0 ? text : ' '}
        </Text>,
      );
    }
  }

  return <Box flexDirection="column">{rows}</Box>;
}
