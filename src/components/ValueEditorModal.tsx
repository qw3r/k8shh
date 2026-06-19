import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Entry } from '../k8s/types.js';
import { isJson, minify, pretty } from '../util/json.js';
import { MultilineEditor } from './MultilineEditor.js';
import { highlightJsonLine } from '../util/jsonHighlight.js';

interface ValueEditorModalProps {
  entry: Entry;
  sub: 'view' | 'edit';
  width: number;
  height: number;
  onSetSub: (sub: 'view' | 'edit') => void;
  onCommit: (id: string, value: string) => void;
  onCancel: () => void;
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** Fullscreen modal for viewing/editing a single value, with JSON formatting. */
export function ValueEditorModal({
  entry,
  sub,
  width,
  height,
  onSetSub,
  onCommit,
  onCancel,
}: ValueEditorModalProps) {
  const [draft, setDraft] = useState(entry.value);
  const [cursor, setCursor] = useState(entry.value.length);
  const [scroll, setScroll] = useState(0);

  const innerWidth = Math.max(8, width - 4);
  const editorHeight = Math.max(3, height - 6);
  const json = isJson(draft);
  const lines = draft.split('\n');
  const maxScroll = Math.max(0, lines.length - editorHeight);

  useInput(
    (input, key) => {
      if (key.escape) return onCancel();
      if (key.return || input === 's') return onCommit(entry.id, draft);
      if (input === 'e' && !entry.binary) return onSetSub('edit');
      if (input === 'p' && json) {
        const p = pretty(draft);
        setDraft(p);
        setCursor(p.length);
        setScroll(0);
        return;
      }
      if (input === 'm' && json) {
        const mn = minify(draft);
        setDraft(mn);
        setCursor(mn.length);
        setScroll(0);
        return;
      }
      if (key.upArrow) return setScroll((s) => clamp(s - 1, 0, maxScroll));
      if (key.downArrow) return setScroll((s) => clamp(s + 1, 0, maxScroll));
      if (key.pageUp) return setScroll((s) => clamp(s - editorHeight, 0, maxScroll));
      if (key.pageDown) return setScroll((s) => clamp(s + editorHeight, 0, maxScroll));
    },
    { isActive: sub === 'view' },
  );

  const viewStart = clamp(scroll, 0, maxScroll);
  const viewLines = lines.slice(viewStart, viewStart + editorHeight);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="magenta"
      paddingX={1}
      width="100%"
      height={height}
    >
      <Box justifyContent="space-between">
        <Text bold color="magenta" wrap="truncate-end">
          Value · {entry.key.trim() === '' ? '(unnamed)' : entry.key}
        </Text>
        <Text>
          {json ? <Text color="magenta">JSON</Text> : <Text dimColor>text</Text>}
          {entry.binary ? <Text color="red"> binary (read-only)</Text> : null}
          {'  '}
          <Text dimColor>{sub === 'edit' ? 'EDIT' : 'VIEW'}</Text>
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} marginTop={1}>
        {sub === 'edit' ? (
          <MultilineEditor
            value={draft}
            cursor={cursor}
            width={innerWidth}
            height={editorHeight}
            highlightLine={json ? highlightJsonLine : undefined}
            onChange={(v, c) => {
              setDraft(v);
              setCursor(c);
            }}
            onExit={() => onSetSub('view')}
          />
        ) : viewLines.length > 0 ? (
          viewLines.map((l, i) => (
            <Text key={viewStart + i} wrap="truncate-end">
              {json && l.length > 0 ? highlightJsonLine(l) : l.length > 0 ? l : ' '}
            </Text>
          ))
        ) : (
          <Text dimColor>(empty)</Text>
        )}
      </Box>

      <Text dimColor wrap="truncate-end">
        {sub === 'view'
          ? `${entry.binary ? '' : 'e edit · '}${json ? 'p pretty · m minify · ' : ''}↑/↓ scroll · Enter/s save · Esc cancel`
          : 'type · arrows move · Enter newline · Esc back to view'}
      </Text>
    </Box>
  );
}
