import React, { useState } from 'react';
import { Text, useInput } from 'ink';

interface TextFieldProps {
  initialValue: string;
  isActive?: boolean;
  /** Called on every value change (for live filtering, etc.). */
  onChange?: (value: string) => void;
  /** Called with the final value when Enter is pressed. */
  onSubmit: (value: string) => void;
  /** Called when Escape is pressed. */
  onCancel: () => void;
}

export function TextField({ initialValue, isActive = true, onChange, onSubmit, onCancel }: TextFieldProps) {
  const [value, setValue] = useState(initialValue);
  const [cursor, setCursor] = useState(initialValue.length);

  const apply = (next: string, nextCursor: number): void => {
    setValue(next);
    setCursor(nextCursor);
    onChange?.(next);
  };

  useInput(
    (input, key) => {
      if (key.return) return onSubmit(value);
      if (key.escape) return onCancel();
      if (key.leftArrow) return setCursor(Math.max(0, cursor - 1));
      if (key.rightArrow) return setCursor(Math.min(value.length, cursor + 1));
      if (key.backspace || key.delete) {
        if (cursor > 0) apply(value.slice(0, cursor - 1) + value.slice(cursor), cursor - 1);
        return;
      }
      // Ignore navigation / modifier keys; only printable input below.
      if (key.ctrl || key.meta || key.tab || key.upArrow || key.downArrow) return;
      if (input) {
        const clean = input.replace(/[\r\n]/g, '');
        if (clean.length === 0) return;
        apply(value.slice(0, cursor) + clean + value.slice(cursor), cursor + clean.length);
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
