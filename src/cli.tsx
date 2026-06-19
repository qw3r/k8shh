import React from 'react';
import { render } from 'ink';
import { App } from './app.js';

// Injected at bundle time by esbuild (`define`); falls back to a dev marker
// when running from source via tsx.
declare const __GAP_VERSION__: string | undefined;
const VERSION = typeof __GAP_VERSION__ === 'string' ? __GAP_VERSION__ : '0.0.0-dev';

const argv = process.argv.slice(2);
if (argv.includes('--version') || argv.includes('-v')) {
  process.stdout.write(`${VERSION}\n`);
  process.exit(0);
}
if (argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(
    `gap-secrets ${VERSION}\n\n` +
      'Interactive Kubernetes secret editor (Ink/Yoga TUI).\n\n' +
      'Usage: gap-secrets\n\n' +
      'Reads your default kubeconfig (same as kubectl). Pick a context, namespace,\n' +
      'and secret, then edit entries. Nothing is written to the cluster until you\n' +
      'confirm the diff on Save.\n',
  );
  process.exit(0);
}

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
