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

/** A one-line incremental search bar that filters entries by name and value. */
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
    <Box>
      <Text color="cyan">search </Text>
      {active ? (
        <TextField initialValue={query} onChange={onChange} onSubmit={onSubmit} onCancel={onCancel} />
      ) : query.length > 0 ? (
        <Text>{query}</Text>
      ) : (
        <Text dimColor>(press / to search name/value)</Text>
      )}
      <Text dimColor>
        {'  '}
        {matchCount}/{total} match{matchCount === 1 ? '' : 'es'}
      </Text>
    </Box>
  );
}
