import type { ContextInfo, Entry, LoadedSecret, SecretRef } from '../k8s/types.js';
import { blankEntry, cloneEntries } from '../k8s/secrets.js';

export type FocusZone = 'toolbar' | 'list';
export type SelectKind = 'context' | 'namespace' | 'secret';

export interface Status {
  kind: 'info' | 'error' | 'success';
  text: string;
}

/** Toolbar controls, left to right. */
export const TOOLBAR_CONTROLS = ['context', 'namespace', 'secret', 'reload', 'reset', 'save'] as const;
export type ToolbarControl = (typeof TOOLBAR_CONTROLS)[number];

/** A deferred action to run after the user confirms discarding unsaved edits. */
export type PendingAction =
  | { type: 'reload' }
  | { type: 'reset' }
  | { type: 'selectContext'; name: string }
  | { type: 'selectNamespace'; name: string }
  | { type: 'selectSecret'; name: string }
  | { type: 'quit' };

/** Overlay / editing state machine. Only the active mode consumes input. */
export type Mode =
  | { kind: 'browse' }
  | { kind: 'select'; which: SelectKind }
  | { kind: 'editName'; entryId: string }
  | { kind: 'editValue'; entryId: string }
  | { kind: 'valueModal'; entryId: string; sub: 'view' | 'edit' }
  | { kind: 'confirmSave' }
  | { kind: 'confirmDiscard'; pending: PendingAction };

export interface AppState {
  // cluster selection
  contexts: ContextInfo[];
  currentContext: string | null;
  namespaces: string[];
  currentNamespace: string | null;
  secrets: SecretRef[];
  currentSecret: string | null;
  secretType: string | null;
  resourceVersion: string | null;

  // data
  original: Entry[]; // pristine snapshot from the cluster
  entries: Entry[]; // working copy

  // ui
  focusZone: FocusZone;
  toolbarIndex: number;
  selectedIndex: number;
  viewportRows: number;
  mode: Mode;
  loading: boolean;
  status: Status | null;
}

export const initialState: AppState = {
  contexts: [],
  currentContext: null,
  namespaces: [],
  currentNamespace: null,
  secrets: [],
  currentSecret: null,
  secretType: null,
  resourceVersion: null,
  original: [],
  entries: [],
  focusZone: 'toolbar',
  toolbarIndex: 0,
  selectedIndex: 0,
  viewportRows: 10,
  mode: { kind: 'browse' },
  loading: false,
  status: null,
};

export type Action =
  | { type: 'setLoading'; loading: boolean }
  | { type: 'setStatus'; status: Status | null }
  | { type: 'setContexts'; contexts: ContextInfo[]; current: string | null }
  | { type: 'setNamespaces'; namespaces: string[] }
  | { type: 'setCurrentContext'; name: string }
  | { type: 'setCurrentNamespace'; namespace: string | null }
  | { type: 'setSecrets'; secrets: SecretRef[] }
  | { type: 'setCurrentSecret'; name: string | null }
  | { type: 'loadedSecret'; loaded: LoadedSecret }
  | { type: 'clearSecret' }
  | { type: 'focusZone'; zone: FocusZone }
  | { type: 'toolbarMove'; delta: number }
  | { type: 'setToolbarIndex'; index: number }
  | { type: 'listMove'; delta: number }
  | { type: 'listTo'; index: number }
  | { type: 'setViewportRows'; rows: number }
  | { type: 'openSelect'; which: SelectKind }
  | { type: 'closeMode' }
  | { type: 'beginEditName'; entryId: string }
  | { type: 'beginEditValue'; entryId: string }
  | { type: 'commitName'; entryId: string; key: string }
  | { type: 'commitValue'; entryId: string; value: string }
  | { type: 'openValueModal'; entryId: string }
  | { type: 'setModalSub'; sub: 'view' | 'edit' }
  | { type: 'addEntry' }
  | { type: 'deleteEntry'; entryId: string }
  | { type: 'requestSave' }
  | { type: 'savedOk'; resourceVersion: string | null }
  | { type: 'resetEdits' }
  | { type: 'requestDiscard'; pending: PendingAction };

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

function mapEntry(entries: Entry[], id: string, fn: (e: Entry) => Entry): Entry[] {
  return entries.map((e) => (e.id === id ? fn(e) : e));
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'setLoading':
      return { ...state, loading: action.loading };

    case 'setStatus':
      return { ...state, status: action.status };

    case 'setContexts':
      return { ...state, contexts: action.contexts, currentContext: action.current };

    case 'setCurrentContext':
      return { ...state, currentContext: action.name };

    case 'setNamespaces':
      return { ...state, namespaces: action.namespaces };

    case 'setCurrentNamespace':
      return { ...state, currentNamespace: action.namespace };

    case 'setSecrets':
      return { ...state, secrets: action.secrets };

    case 'setCurrentSecret':
      return { ...state, currentSecret: action.name };

    case 'loadedSecret': {
      const entries = cloneEntries(action.loaded.entries);
      return {
        ...state,
        currentSecret: action.loaded.name,
        currentNamespace: action.loaded.namespace,
        secretType: action.loaded.type,
        resourceVersion: action.loaded.resourceVersion,
        original: action.loaded.entries,
        entries,
        selectedIndex: 0,
        focusZone: 'list',
        mode: { kind: 'browse' },
      };
    }

    case 'clearSecret':
      return {
        ...state,
        currentSecret: null,
        secretType: null,
        resourceVersion: null,
        original: [],
        entries: [],
        selectedIndex: 0,
        mode: { kind: 'browse' },
      };

    case 'focusZone':
      return { ...state, focusZone: action.zone };

    case 'toolbarMove':
      return {
        ...state,
        focusZone: 'toolbar',
        toolbarIndex: clamp(state.toolbarIndex + action.delta, 0, TOOLBAR_CONTROLS.length - 1),
      };

    case 'setToolbarIndex':
      return { ...state, toolbarIndex: clamp(action.index, 0, TOOLBAR_CONTROLS.length - 1) };

    case 'listMove': {
      if (state.entries.length === 0) return { ...state, selectedIndex: 0 };
      return {
        ...state,
        focusZone: 'list',
        selectedIndex: clamp(state.selectedIndex + action.delta, 0, state.entries.length - 1),
      };
    }

    case 'listTo':
      return { ...state, selectedIndex: clamp(action.index, 0, Math.max(0, state.entries.length - 1)) };

    case 'setViewportRows':
      return { ...state, viewportRows: Math.max(1, action.rows) };

    case 'openSelect':
      return { ...state, mode: { kind: 'select', which: action.which } };

    case 'closeMode':
      return { ...state, mode: { kind: 'browse' } };

    case 'beginEditName':
      return { ...state, mode: { kind: 'editName', entryId: action.entryId } };

    case 'beginEditValue':
      return { ...state, mode: { kind: 'editValue', entryId: action.entryId } };

    case 'commitName':
      return {
        ...state,
        entries: mapEntry(state.entries, action.entryId, (e) => ({ ...e, key: action.key })),
        mode: { kind: 'browse' },
      };

    case 'commitValue':
      return {
        ...state,
        entries: mapEntry(state.entries, action.entryId, (e) => ({ ...e, value: action.value })),
        mode: { kind: 'browse' },
      };

    case 'openValueModal':
      return { ...state, mode: { kind: 'valueModal', entryId: action.entryId, sub: 'view' } };

    case 'setModalSub': {
      if (state.mode.kind !== 'valueModal') return state;
      return { ...state, mode: { ...state.mode, sub: action.sub } };
    }

    case 'addEntry': {
      const entry = blankEntry();
      const entries = [...state.entries, entry];
      return {
        ...state,
        entries,
        selectedIndex: entries.length - 1,
        focusZone: 'list',
        mode: { kind: 'editName', entryId: entry.id },
      };
    }

    case 'deleteEntry': {
      const idx = state.entries.findIndex((e) => e.id === action.entryId);
      if (idx === -1) return state;
      const entries = state.entries.filter((e) => e.id !== action.entryId);
      return {
        ...state,
        entries,
        selectedIndex: clamp(state.selectedIndex, 0, Math.max(0, entries.length - 1)),
        mode: { kind: 'browse' },
      };
    }

    case 'requestSave':
      return { ...state, mode: { kind: 'confirmSave' } };

    case 'savedOk': {
      // Promote the working copy to the new pristine snapshot.
      const promoted = state.entries
        .filter((e) => e.key.trim() !== '')
        .map<Entry>((e) => ({ ...e, originalKey: e.key }));
      return {
        ...state,
        original: cloneEntries(promoted),
        entries: promoted,
        resourceVersion: action.resourceVersion ?? state.resourceVersion,
        mode: { kind: 'browse' },
        status: { kind: 'success', text: 'Saved changes to the cluster.' },
      };
    }

    case 'resetEdits':
      return {
        ...state,
        entries: cloneEntries(state.original),
        selectedIndex: clamp(state.selectedIndex, 0, Math.max(0, state.original.length - 1)),
        mode: { kind: 'browse' },
        status: { kind: 'info', text: 'Reverted local edits.' },
      };

    case 'requestDiscard':
      return { ...state, mode: { kind: 'confirmDiscard', pending: action.pending } };

    default:
      return state;
  }
}
