import { loadConfig } from './state/config.js';

export interface Theme {
  accent: string;   // primary accent — selection cursor, modal borders, mode block bg
  on: string;       // text on accent background
  border: string;   // horizontal rules and subtle separators
  muted: string;    // secondary text — column headers, hints, pagination
  success: string;
  error: string;
  warn: string;
  syntax: {
    key: string;    // JSON object keys
    string: string; // JSON string values
    number: string; // JSON numbers
    bool: string;   // JSON booleans
    null: string;   // JSON null
  };
}

const themes: Record<string, Theme> = {
  amber: {
    accent: '#fab283',
    on: 'black',
    border: 'gray',
    muted: 'gray',
    success: 'green',
    error: 'red',
    warn: 'yellow',
    syntax: { key: 'cyan', string: 'green', number: 'yellow', bool: 'magenta', null: 'red' },
  },
  'catppuccin-mocha': {
    accent: '#cba6f7',
    on: 'black',
    border: '#585b70',
    muted: '#6c7086',
    success: '#a6e3a1',
    error: '#f38ba8',
    warn: '#f9e2af',
    syntax: { key: '#89dceb', string: '#a6e3a1', number: '#fab387', bool: '#cba6f7', null: '#f38ba8' },
  },
  'tokyo-night': {
    accent: '#7aa2f7',
    on: 'black',
    border: '#3b4261',
    muted: '#565f89',
    success: '#9ece6a',
    error: '#f7768e',
    warn: '#e0af68',
    syntax: { key: '#73daca', string: '#9ece6a', number: '#ff9e64', bool: '#bb9af7', null: '#f7768e' },
  },
  nord: {
    accent: '#88c0d0',
    on: 'black',
    border: '#3b4252',
    muted: '#4c566a',
    success: '#a3be8c',
    error: '#bf616a',
    warn: '#ebcb8b',
    syntax: { key: '#81a1c1', string: '#a3be8c', number: '#d08770', bool: '#b48ead', null: '#bf616a' },
  },
  dracula: {
    accent: '#bd93f9',
    on: 'black',
    border: '#44475a',
    muted: '#6272a4',
    success: '#50fa7b',
    error: '#ff5555',
    warn: '#f1fa8c',
    syntax: { key: '#8be9fd', string: '#f1fa8c', number: '#ffb86c', bool: '#bd93f9', null: '#ff5555' },
  },
};

export const THEME_NAMES = Object.keys(themes) as string[];

let currentThemeName = 'amber';

function resolveTheme(): Theme {
  try {
    const { theme: name } = loadConfig();
    currentThemeName = (name && themes[name]) ? name : 'amber';
  } catch {
    currentThemeName = 'amber';
  }
  return { ...themes[currentThemeName]!, syntax: { ...themes[currentThemeName]!.syntax } };
}

export const theme: Theme = resolveTheme();

export function getCurrentThemeName(): string {
  return currentThemeName;
}

/** Apply a named theme by mutating the singleton in place. Returns the resolved name. */
export function applyTheme(name: string): string {
  const next = themes[name];
  if (!next) return currentThemeName;
  currentThemeName = name;
  Object.assign(theme, next);
  Object.assign(theme.syntax, next.syntax);
  return name;
}
