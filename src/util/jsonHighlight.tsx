import React from 'react';
import { Text } from 'ink';

// Matches: 1=string, 2=number, 3=boolean, 4=null, 5=punctuation.
const TOKEN =
  /("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\b(null)\b|([{}[\],:])/g;

/**
 * Render a single line of JSON with syntax colors. Strings followed by `:` are
 * treated as keys. Anything unrecognized is emitted as plain text, so this is
 * safe to run on partially-invalid JSON while the user is editing.
 */
export function highlightJsonLine(line: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  TOKEN.lastIndex = 0;

  let match: RegExpExecArray | null = TOKEN.exec(line);
  while (match !== null) {
    if (match.index > lastIndex) {
      nodes.push(<Text key={key++}>{line.slice(lastIndex, match.index)}</Text>);
    }
    const [tok, str, num, bool, nul, punct] = match;
    if (str !== undefined) {
      const isKey = /^\s*:/.test(line.slice(match.index + tok.length));
      nodes.push(
        <Text key={key++} color={isKey ? 'cyan' : 'green'}>
          {tok}
        </Text>,
      );
    } else if (num !== undefined) {
      nodes.push(
        <Text key={key++} color="yellow">
          {tok}
        </Text>,
      );
    } else if (bool !== undefined) {
      nodes.push(
        <Text key={key++} color="magenta">
          {tok}
        </Text>,
      );
    } else if (nul !== undefined) {
      nodes.push(
        <Text key={key++} color="red" dimColor>
          {tok}
        </Text>,
      );
    } else if (punct !== undefined) {
      nodes.push(
        <Text key={key++} dimColor>
          {tok}
        </Text>,
      );
    } else {
      nodes.push(<Text key={key++}>{tok}</Text>);
    }
    lastIndex = match.index + tok.length;
    match = TOKEN.exec(line);
  }

  if (lastIndex < line.length) {
    nodes.push(<Text key={key++}>{line.slice(lastIndex)}</Text>);
  }
  return nodes;
}
