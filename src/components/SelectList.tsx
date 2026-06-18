import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';

export interface SelectItem {
  label: string;
  value: string;
  hint?: string;
}

interface SelectListProps {
  title: string;
  items: SelectItem[];
  currentValue?: string | null;
  height?: number;
  isActive?: boolean;
  onSelect: (value: string) => void;
  onCancel: () => void;
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** A scrollable, type-to-filter selection overlay. */
export function SelectList({
  title,
  items,
  currentValue,
  height = 10,
  isActive = true,
  onSelect,
  onCancel,
}: SelectListProps) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(() => {
    const i = items.findIndex((it) => it.value === currentValue);
    return i >= 0 ? i : 0;
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return items;
    return items.filter((it) => it.label.toLowerCase().includes(q));
  }, [items, query]);

  const maxIndex = Math.max(0, filtered.length - 1);
  const safeIndex = clamp(index, 0, maxIndex);

  useInput(
    (input, key) => {
      if (key.escape) return onCancel();
      if (key.return) {
        const sel = filtered[safeIndex];
        if (sel) onSelect(sel.value);
        return;
      }
      if (key.upArrow) return setIndex(clamp(safeIndex - 1, 0, maxIndex));
      if (key.downArrow) return setIndex(clamp(safeIndex + 1, 0, maxIndex));
      if (key.backspace || key.delete) {
        setQuery((q) => q.slice(0, -1));
        setIndex(0);
        return;
      }
      if (key.ctrl || key.meta || key.tab) return;
      if (input) {
        const clean = input.replace(/[\r\n]/g, '');
        if (clean.length === 0) return;
        setQuery((q) => q + clean);
        setIndex(0);
      }
    },
    { isActive },
  );

  const start = clamp(safeIndex - Math.floor(height / 2), 0, Math.max(0, filtered.length - height));
  const visible = filtered.slice(start, start + height);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} width="100%">
      <Text bold color="cyan">
        {title}
      </Text>
      <Text dimColor>filter: {query.length > 0 ? query : '(type to filter)'}</Text>
      {visible.length === 0 ? (
        <Text dimColor>no matches</Text>
      ) : (
        visible.map((it, i) => {
          const idx = start + i;
          const selected = idx === safeIndex;
          const isCurrent = it.value === currentValue;
          return (
            <Text key={it.value} inverse={selected} wrap="truncate-end">
              {selected ? '› ' : '  '}
              {it.label}
              {isCurrent ? ' (current)' : ''}
              {it.hint ? `  ${it.hint}` : ''}
            </Text>
          );
        })
      )}
      <Text dimColor>
        {filtered.length} item{filtered.length === 1 ? '' : 's'} · ↑/↓ move · Enter select · Esc cancel
      </Text>
    </Box>
  );
}
