#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from './app.js';

const ENTER_ALT_SCREEN = '\u001B[?1049h';
const LEAVE_ALT_SCREEN = '\u001B[?1049l';

let restored = false;
function restoreScreen(): void {
  if (restored) return;
  restored = true;
  process.stdout.write(LEAVE_ALT_SCREEN);
}

// Use the terminal's alternate screen buffer so the editor owns the full
// viewport and the user's scrollback is preserved on exit.
process.stdout.write(ENTER_ALT_SCREEN);
process.on('exit', restoreScreen);

const { waitUntilExit } = render(<App />);

waitUntilExit().then(restoreScreen, (error: unknown) => {
  restoreScreen();
  console.error(error);
  process.exitCode = 1;
});
