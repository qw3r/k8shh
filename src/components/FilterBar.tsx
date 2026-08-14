import React from 'react';
import { Box, Text } from 'ink';
import { TextField } from './TextField.js';

interface FilterBarProps {
  query: string;
  active: boolean;
  matchCount: number;
  total: number;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/** Prominent search bar shown at the top of the list panel. */
export function FilterBar({
  query,
  active,
  matchCount,
  total,
  onChange,
  onSubmit,
  onCancel,
}: FilterBarProps) {
  return (
    <Box width="100%" borderStyle="round" borderColor={active ? 'cyan' : 'gray'} paddingX={1}>
      <Text bold color={active ? 'cyan' : 'gray'}>/</Text>
      <Text> </Text>
      {active ? (
        <TextField initialValue={query} onChange={onChange} onSubmit={onSubmit} onCancel={onCancel} />
      ) : query.length > 0 ? (
        <Text color="cyan">{query}</Text>
      ) : (
        <Text dimColor>search…</Text>
      )}
      <Text dimColor>
        {'  '}
        {matchCount}/{total}
      </Text>
    </Box>
  );
}
