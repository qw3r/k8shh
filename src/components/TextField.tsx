import React, { useState } from 'react';
import { Text, useInput } from 'ink';

interface TextFieldProps {
  initialValue: string;
  isActive?: boolean;
  /** Called with the final value when Enter is pressed. */
  onSubmit: (value: string) => void;
  /** Called when Escape is pressed. */
  onCancel: () => void;
}

/** A minimal single-line text input with a visible cursor, built on Ink core. */
export function TextField({ initialValue, isActive = true, onSubmit, onCancel }: TextFieldProps) {
  const [value, setValue] = useState(initialValue);
  const [cursor, setCursor] = useState(initialValue.length);

  useInput(
    (input, key) => {
      if (key.return) {
        onSubmit(value);
        return;
      }
      if (key.escape) {
        onCancel();
        return;
      }
      if (key.leftArrow) {
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.rightArrow) {
        setCursor((c) => Math.min(value.length, c + 1));
        return;
      }
      if (key.backspace || key.delete) {
        setCursor((c) => {
          if (c <= 0) return c;
          setValue((v) => v.slice(0, c - 1) + v.slice(c));
          return c - 1;
        });
        return;
      }
      // Ignore navigation / modifier keys; only printable input below.
      if (key.ctrl || key.meta || key.tab || key.upArrow || key.downArrow) {
        return;
      }
      if (input) {
        const clean = input.replace(/[\r\n]/g, '');
        if (clean.length === 0) return;
        setCursor((c) => {
          setValue((v) => v.slice(0, c) + clean + v.slice(c));
          return c + clean.length;
        });
      }
    },
    { isActive },
  );

  return <CursorText value={value} cursor={cursor} showCursor={isActive} />;
}

interface CursorTextProps {
  value: string;
  cursor: number;
  showCursor: boolean;
}

/** Render a string with an inverse block at the cursor position. */
export function CursorText({ value, cursor, showCursor }: CursorTextProps) {
  if (!showCursor) {
    return <Text>{value.length > 0 ? value : ' '}</Text>;
  }
  const before = value.slice(0, cursor);
  const at = value.slice(cursor, cursor + 1) || ' ';
  const after = value.slice(cursor + 1);
  return (
    <Text>
      {before}
      <Text inverse>{at}</Text>
      {after}
    </Text>
  );
}
