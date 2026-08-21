import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Box, Text, useApp, useInput, useStdin, useStdout } from 'ink';
import { spawn } from 'node:child_process';
import { K8sClient, describeError, isAuthError } from './k8s/client.js';
import { buildMergePatch, computeChanges, findDuplicateKeys, isDirty } from './k8s/secrets.js';
import { type AppState, type PendingAction, type RestartItem, type RetryAction, TOOLBAR_CONTROLS, initialState, reducer } from './state/store.js';
import { Toolbar } from './components/Toolbar.js';
import { SecretList } from './components/SecretList.js';
import { SelectList } from './components/SelectList.js';
import { StatusBar } from './components/StatusBar.js';
import { ValueEditorModal } from './components/ValueEditorModal.js';
import { DiffConfirmModal } from './components/DiffConfirmModal.js';
import { FilterBar } from './components/FilterBar.js';
import { loadLastSelection, saveLastSelection, getPerContextSelection } from './state/persistence.js';
import { saveThemeName } from './state/config.js';
import { theme, applyTheme, getCurrentThemeName, THEME_NAMES } from './theme.js';

// Matches cli.tsx: the alt-screen is toggled so we can hand the terminal to an
// interactive child process (gcloud auth login) and take it back afterwards.
const ENTER_ALT_SCREEN = '[?1049h';
const LEAVE_ALT_SCREEN = '[?1049l';

/** Track terminal size and re-render on resize. */
function useTerminalSize(): { columns: number; rows: number } {
  const { stdout } = useStdout();
  const [size, setSize] = useState({ columns: stdout.columns || 80, rows: stdout.rows || 24 });
  useEffect(() => {
    const onResize = (): void => setSize({ columns: stdout.columns || 80, rows: stdout.rows || 24 });
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);
  return size;
}

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SCAN_W = 7; // ░▒▓█▓▒░

function CenteredModal({ height, children }: { height: number; children: React.ReactNode }) {
  return (
    <Box width="100%" height={height} flexDirection="column" alignItems="center" justifyContent="center">
      <Box width="75%">{children}</Box>
    </Box>
  );
}

function AuthErrorModal({
  message,
  onRetry,
  onLogin,
  onDismiss,
}: {
  message: string;
  onRetry: () => void;
  onLogin: () => void;
  onDismiss: () => void;
}) {
  useInput((input, key) => {
    if (key.escape) return onDismiss();
    if (input === 'l') return onLogin();
    if (key.return || input === 'r') return onRetry();
  });
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.error} paddingX={1}>
      <Text bold color={theme.error}>
        Authentication error
      </Text>
      <Text>{message}</Text>
      <Text dimColor>Log in with gcloud (opens your browser), then the action retries.</Text>
      <Text dimColor>l gcloud auth login · Enter/r retry · Esc dismiss</Text>
    </Box>
  );
}

function RestartProgressModal({ items, onClose }: { items: RestartItem[]; onClose: () => void }) {
  const [tick, setTick] = useState(0);
  const allDone = items.every((i) => i.status === 'done' || i.status === 'error');
  useEffect(() => {
    if (allDone) return;
    const id = setInterval(() => setTick((t) => t + 1), 80);
    return () => clearInterval(id);
  }, [allDone]);
  useInput((input, key) => {
    if (key.escape || (allDone && (key.return || input === 'q'))) onClose();
  });
  const doneCount = items.filter((i) => i.status === 'done').length;
  const errCount = items.filter((i) => i.status === 'error').length;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.accent} paddingX={1}>
      <Text bold color={theme.accent}>
        Rolling restart — {items.length} deployment{items.length !== 1 ? 's' : ''}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {items.map((item) => (
          <Box key={item.name}>
            <Text color={item.status === 'done' ? 'green' : item.status === 'error' ? 'red' : theme.accent}>
              {item.status === 'running'
                ? SPINNER[tick % SPINNER.length]
                : item.status === 'done'
                  ? '✓'
                  : item.status === 'error'
                    ? '✗'
                    : '·'}
            </Text>
            <Text> {item.name}</Text>
            {item.status !== 'pending' && <Text dimColor>  {item.status}</Text>}
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        {allDone ? (
          <Text>
            {doneCount > 0 ? `${doneCount} restarted` : ''}
            {errCount > 0 ? `${doneCount > 0 ? ', ' : ''}${errCount} failed` : ''} — Enter/Esc to
            close
          </Text>
        ) : (
          <Text dimColor>Esc to dismiss (restart continues in background)</Text>
        )}
      </Box>
    </Box>
  );
}

function LoadingModal({ message, tick, width, onQuit }: {
  message: string | null;
  tick: number;
  width: number;
  onQuit: () => void;
}) {
  const inner = Math.max(SCAN_W + 2, width - 6);
  const travel = Math.max(1, inner - SCAN_W);
  const cycle = travel * 2;
  const raw = tick % cycle;
  const pos = raw <= travel ? raw : cycle - raw;
  useInput((input) => { if (input === 'q') onQuit(); });
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.accent} paddingX={2} paddingY={1} width={width}>
      <Box>
        <Text color={theme.border}>{'─'.repeat(pos)}</Text>
        <Text color={theme.accent} dimColor>░</Text>
        <Text color={theme.accent}>▒</Text>
        <Text color={theme.accent}>▓</Text>
        <Text bold color={theme.accent}>█</Text>
        <Text color={theme.accent}>▓</Text>
        <Text color={theme.accent}>▒</Text>
        <Text color={theme.accent} dimColor>░</Text>
        <Text color={theme.border}>{'─'.repeat(Math.max(0, inner - pos - SCAN_W))}</Text>
      </Box>
      <Box marginTop={1}>
        <Text>{message ?? 'Loading…'}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.muted}>q  quit</Text>
      </Box>
    </Box>
  );
}

function ConfirmDiscard({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingAction;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useInput((input, key) => {
    if (key.escape || input === 'n') return onCancel();
    if (key.return || input === 'y') return onConfirm();
  });
  const verb = pending.type === 'quit' ? 'Quit' : 'Continue';
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.error} paddingX={1}>
      <Text bold color={theme.error}>
        Discard unsaved changes?
      </Text>
      <Text>You have unsaved edits. {verb} and lose them?</Text>
      <Text dimColor>y/Enter confirm · n/Esc cancel</Text>
    </Box>
  );
}

export function App() {
  const { exit } = useApp();
  const { stdin, setRawMode, isRawModeSupported } = useStdin();
  const size = useTerminalSize();
  const [state, dispatch] = useReducer(reducer, initialState);
  const clientRef = useRef<K8sClient | null>(null);
  const [ballTick, setBallTick] = useState(0);
  // True while the terminal is handed to an interactive child (gcloud auth login).
  const [suspended, setSuspended] = useState(false);

  useEffect(() => {
    if (!state.loading) return;
    const id = setInterval(() => setBallTick((t) => t + 1), 60);
    return () => clearInterval(id);
  }, [state.loading]);

  // Auto-clear info/success status so the help line reappears.
  useEffect(() => {
    if (!state.status || state.status.kind === 'error') return;
    const id = setTimeout(() => dispatch({ type: 'setStatus', status: null }), 3000);
    return () => clearTimeout(id);
  }, [state.status]);

  const setError = (e: unknown): void =>
    dispatch({ type: 'setStatus', status: { kind: 'error', text: describeError(e) } });
  const setInfo = (text: string): void => dispatch({ type: 'setStatus', status: { kind: 'info', text } });
  const setAuthOrError = (e: unknown, retry: RetryAction): void =>
    isAuthError(e)
      ? dispatch({ type: 'showAuthError', message: describeError(e), retry })
      : setError(e);

  // ---- async data loaders -------------------------------------------------
  async function loadNamespaces(): Promise<void> {
    const client = clientRef.current;
    if (!client) return;
    dispatch({ type: 'setLoading', loading: true });
    try {
      dispatch({ type: 'setNamespaces', namespaces: await client.listNamespaces() });
    } catch (e) {
      setAuthOrError(e, { type: 'loadNamespaces' });
    } finally {
      dispatch({ type: 'setLoading', loading: false });
    }
  }

  async function loadSecrets(namespace: string): Promise<void> {
    const client = clientRef.current;
    if (!client) return;
    dispatch({ type: 'setLoading', loading: true });
    try {
      dispatch({ type: 'setSecrets', secrets: await client.listSecrets(namespace) });
    } catch (e) {
      setAuthOrError(e, { type: 'loadSecrets', namespace });
    } finally {
      dispatch({ type: 'setLoading', loading: false });
    }
  }

  async function loadSecret(namespace: string, name: string, focusList = true): Promise<void> {
    const client = clientRef.current;
    if (!client) return;
    dispatch({ type: 'setLoading', loading: true });
    try {
      const loaded = await client.readSecret(namespace, name);
      dispatch({ type: 'loadedSecret', loaded, focusList });
      dispatch({ type: 'setStatus', status: null });
      saveLastSelection({ context: client.getCurrentContext() || undefined, namespace, secret: name });
    } catch (e) {
      setAuthOrError(e, { type: 'loadSecret', namespace, name });
    } finally {
      dispatch({ type: 'setLoading', loading: false });
    }
  }

  async function performReload(): Promise<void> {
    if (state.currentNamespace && state.currentSecret) {
      await loadSecret(state.currentNamespace, state.currentSecret);
    }
  }

  async function performSelectContext(name: string): Promise<void> {
    const client = clientRef.current;
    if (!client) return;
    try {
      client.setContext(name);
    } catch (e) {
      setError(e);
      return;
    }
    dispatch({ type: 'setCurrentContext', name });
    dispatch({ type: 'clearSecret' });
    dispatch({ type: 'setSecrets', secrets: [] });
    const ns = client.getContextNamespace(name);
    dispatch({ type: 'setCurrentNamespace', namespace: ns });
    await loadNamespaces();
    if (ns) {
      await loadSecrets(ns);
      const remembered = getPerContextSelection(name);
      if (remembered && remembered.namespace === ns && remembered.secret) {
        await loadSecret(ns, remembered.secret, false);
      }
    }
  }

  async function performSelectNamespace(name: string): Promise<void> {
    dispatch({ type: 'setCurrentNamespace', namespace: name });
    dispatch({ type: 'clearSecret' });
    dispatch({ type: 'setSecrets', secrets: [] });
    await loadSecrets(name);
  }

  async function performSelectSecret(name: string): Promise<void> {
    if (state.currentNamespace) await loadSecret(state.currentNamespace, name);
  }

  async function performSave(restart: boolean): Promise<void> {
    const client = clientRef.current;
    const namespace = state.currentNamespace;
    const secret = state.currentSecret;
    if (!client || !namespace || !secret) return;
    dispatch({ type: 'setLoading', loading: true, message: 'Saving changes…' });
    try {
      const patch = buildMergePatch(state.original, state.entries);
      await client.patchSecret(namespace, secret, patch);
      let note = '';
      if (restart) {
        try {
          const names = await client.restartDeploymentsUsingSecret(namespace, secret);
          note = names.length > 0 ? ` Restarted ${names.length} deployment(s).` : ' No dependent deployments.';
        } catch (e) {
          note = ` (restart failed: ${describeError(e)})`;
        }
      }
      const loaded = await client.readSecret(namespace, secret);
      dispatch({ type: 'loadedSecret', loaded });
      dispatch({ type: 'setStatus', status: { kind: 'success', text: `Saved changes to the cluster.${note}` } });
    } catch (e) {
      setAuthOrError(e, { type: 'save' });
    } finally {
      dispatch({ type: 'setLoading', loading: false });
    }
  }

  async function performRestart(): Promise<void> {
    const client = clientRef.current;
    if (!client || !state.currentNamespace || !state.currentSecret) {
      setInfo('No secret loaded.');
      return;
    }
    const ns = state.currentNamespace;
    const secret = state.currentSecret;
    dispatch({ type: 'setLoading', loading: true, message: 'Finding deployments…' });
    let names: string[];
    try {
      names = await client.findDeploymentsUsingSecret(ns, secret);
    } catch (e) {
      dispatch({ type: 'setLoading', loading: false });
      setAuthOrError(e, { type: 'restart' });
      return;
    }
    if (names.length === 0) {
      dispatch({ type: 'setLoading', loading: false });
      setInfo('No deployments reference this secret.');
      return;
    }
    dispatch({ type: 'showRestartProgress', names });
    dispatch({ type: 'setLoading', loading: false });
    await client.restartDeploymentsUsingSecret(ns, secret, (name, status) => {
      dispatch({ type: 'updateRestartItem', name, status });
    });
  }

  // ---- init ---------------------------------------------------------------
  useEffect(() => {
    let client: K8sClient;
    try {
      client = new K8sClient();
    } catch (e) {
      setError(e);
      return;
    }
    clientRef.current = client;
    const contexts = client.listContexts();
    const last = loadLastSelection();
    const kubeCurrent = client.getCurrentContext() || null;

    // Prefer the remembered context if it still exists in the kubeconfig.
    let context = kubeCurrent;
    if (last?.context && contexts.some((c) => c.name === last.context)) {
      context = last.context;
    }
    if (context && context !== kubeCurrent) {
      try {
        client.setContext(context);
      } catch (e) {
        setError(e);
      }
    }
    dispatch({ type: 'setContexts', contexts, current: context });

    if (!context) {
      setInfo('No current context set — press Enter on “context” to choose one.');
      return;
    }

    // Namespace: remembered (only when its context matches) else the context default.
    const rememberedNs = last?.context === context ? (last?.namespace ?? null) : null;
    const ns = rememberedNs ?? client.getContextNamespace(context);
    if (ns) dispatch({ type: 'setCurrentNamespace', namespace: ns });

    // Start focused on the secret selector when context + namespace are known;
    // keep focus on the toolbar during the initial load (don't jump to the list).
    dispatch({ type: 'setToolbarIndex', index: TOOLBAR_CONTROLS.indexOf(ns ? 'secret' : 'namespace') });

    const rememberedSecret =
      last?.context === context && last?.namespace === ns ? (last?.secret ?? null) : null;

    void (async () => {
      await loadNamespaces();
      if (ns) await loadSecrets(ns);
      if (ns && rememberedSecret) await loadSecret(ns, rememberedSecret, false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- layout sizing ------------------------------------------------------
  const toolbarHeight = 2; // flat header: title + selectors/actions
  const statusHeight = 2; // flat status: mode line + help/status line
  const middleRows = Math.max(4, size.rows - toolbarHeight - statusHeight);
  const showFilter = state.mode.kind === 'filter' || state.filter.length > 0;
  // 2 rules + 1 list header + 1 footer (+1 filter line when shown)
  const listBodyRows = Math.max(1, middleRows - (showFilter ? 5 : 4));
  const innerWidth = Math.max(20, size.columns - 2);
  const ruleW = Math.max(1, size.columns);

  useEffect(() => {
    dispatch({ type: 'setViewportRows', rows: listBodyRows });
  }, [listBodyRows]);

  // ---- derived ------------------------------------------------------------
  const dirty = isDirty(state.original, state.entries);
  const changes = computeChanges(state.original, state.entries);
  const mode = state.mode;

  const filteredEntries = useMemo(() => {
    const q = state.filter.trim().toLowerCase();
    if (q === '') return state.entries;
    return state.entries.filter((e) => e.key.toLowerCase().includes(q) || e.value.toLowerCase().includes(q));
  }, [state.entries, state.filter]);

  const selectedIndex = Math.min(state.selectedIndex, Math.max(0, filteredEntries.length - 1));
  const selected = filteredEntries[selectedIndex];

  // ---- action helpers -----------------------------------------------------
  const handleSave = (): void => {
    if (!state.currentSecret) return setInfo('No secret loaded.');
    if (state.entries.some((e) => e.key.trim() === '')) {
      return dispatch({ type: 'setStatus', status: { kind: 'error', text: 'Every entry needs a name.' } });
    }
    const dups = findDuplicateKeys(state.entries);
    if (dups.length > 0) {
      return dispatch({
        type: 'setStatus',
        status: { kind: 'error', text: `Duplicate keys: ${dups.join(', ')}` },
      });
    }
    if (changes.length === 0) return setInfo('No changes to save.');
    dispatch({ type: 'requestSave' });
  };

  const handleReload = (): void => {
    if (!state.currentSecret) return setInfo('No secret loaded.');
    if (dirty) dispatch({ type: 'requestDiscard', pending: { type: 'reload' } });
    else void performReload();
  };

  const handleReset = (): void => {
    if (!dirty) return setInfo('Nothing to reset.');
    dispatch({ type: 'requestDiscard', pending: { type: 'reset' } });
  };

  const handleQuit = (): void => {
    if (dirty) dispatch({ type: 'requestDiscard', pending: { type: 'quit' } });
    else exit();
  };

  const runPending = (pending: PendingAction): void => {
    dispatch({ type: 'closeMode' });
    switch (pending.type) {
      case 'reload':
        void performReload();
        break;
      case 'reset':
        dispatch({ type: 'resetEdits' });
        break;
      case 'selectContext':
        void performSelectContext(pending.name);
        break;
      case 'selectNamespace':
        void performSelectNamespace(pending.name);
        break;
      case 'selectSecret':
        void performSelectSecret(pending.name);
        break;
      case 'quit':
        exit();
        break;
    }
  };

  const runRetry = (retry: RetryAction): void => {
    dispatch({ type: 'closeMode' });
    switch (retry.type) {
      case 'loadNamespaces': void loadNamespaces(); break;
      case 'loadSecrets':    void loadSecrets(retry.namespace); break;
      case 'loadSecret':     void loadSecret(retry.namespace, retry.name); break;
      case 'save':           handleSave(); break;
      case 'restart':        void performRestart(); break;
    }
  };

  /**
   * Hand the terminal to an interactive `gcloud auth login`, then take it back
   * and retry the action that failed. We drop raw mode + leave the alt-screen so
   * gcloud can print its URL / open a browser, and keep `suspended` set so our
   * own key handlers don't steal stdin while the child runs.
   */
  const runGcloudLogin = async (retry: RetryAction): Promise<void> => {
    setSuspended(true);
    dispatch({ type: 'closeMode' }); // unmount the auth modal so it stops reading input
    if (isRawModeSupported) setRawMode(false);
    stdin.pause();
    process.stdout.write(LEAVE_ALT_SCREEN);
    process.stdout.write('\nRunning: gcloud auth login\n\n');

    const code = await new Promise<number>((resolve) => {
      const child = spawn('gcloud', ['auth', 'login'], { stdio: 'inherit' });
      child.on('error', () => resolve(-1));
      child.on('exit', (c) => resolve(c ?? -1));
    });

    process.stdout.write(ENTER_ALT_SCREEN);
    stdin.resume();
    if (isRawModeSupported) setRawMode(true);
    setSuspended(false);

    if (code === 0) {
      setInfo('Re-authenticated with gcloud — retrying…');
      runRetry(retry);
    } else if (code === -1) {
      setError('Could not run gcloud — is it installed and on your PATH?');
    } else {
      setError(`gcloud auth login exited with code ${code}.`);
    }
  };

  const activateToolbar = (): void => {
    const control = TOOLBAR_CONTROLS[state.toolbarIndex];
    switch (control) {
      case 'context':
        if (state.contexts.length > 0) dispatch({ type: 'openSelect', which: 'context' });
        else setInfo('No contexts found in kubeconfig.');
        break;
      case 'namespace':
        if (!state.currentContext) setInfo('Choose a context first.');
        else dispatch({ type: 'openSelect', which: 'namespace' });
        break;
      case 'secret':
        if (!state.currentNamespace) setInfo('Choose a namespace first.');
        else dispatch({ type: 'openSelect', which: 'secret' });
        break;
      case 'reload':
        handleReload();
        break;
      case 'reset':
        handleReset();
        break;
      case 'save':
        handleSave();
        break;
      case 'restart':
        void performRestart();
        break;
    }
  };

  const beginEdit = (field: 'name' | 'value'): void => {
    if (!selected) return;
    if (selected.binary) return setInfo('Binary value is read-only.');
    dispatch(
      field === 'name'
        ? { type: 'beginEditName', entryId: selected.id }
        : { type: 'beginEditValue', entryId: selected.id },
    );
  };

  const cancelEdit = (): void => {
    if (mode.kind === 'editName') {
      const e = state.entries.find((x) => x.id === mode.entryId);
      if (e && e.originalKey === null && e.key.trim() === '') {
        dispatch({ type: 'deleteEntry', entryId: e.id });
        return;
      }
    }
    dispatch({ type: 'closeMode' });
  };

  const chooseFromList = (which: 'context' | 'namespace' | 'secret', name: string): void => {
    const current =
      which === 'context'
        ? state.currentContext
        : which === 'namespace'
          ? state.currentNamespace
          : state.currentSecret;
    if (name === current) {
      dispatch({ type: 'closeMode' });
      return;
    }
    if (dirty) {
      const pending: PendingAction =
        which === 'context'
          ? { type: 'selectContext', name }
          : which === 'namespace'
            ? { type: 'selectNamespace', name }
            : { type: 'selectSecret', name };
      dispatch({ type: 'requestDiscard', pending });
      return;
    }
    dispatch({ type: 'closeMode' });
    if (which === 'context') void performSelectContext(name);
    else if (which === 'namespace') void performSelectNamespace(name);
    else void performSelectSecret(name);
  };

  // ---- global theme shortcut (all non-text modes) ---------------------------
  const isTextEditing = mode.kind === 'editName' || mode.kind === 'editValue' || mode.kind === 'filter';
  useInput(
    (input) => {
      if (input === 'T') dispatch({ type: 'openThemeSelect' });
    },
    { isActive: !suspended && !isTextEditing && !state.loading },
  );

  // ---- global input (browse only) ----------------------------------------
  useInput(
    (input, key) => {
      if (input === 'q') return handleQuit();
      if (key.tab) {
        return dispatch({ type: 'focusZone', zone: state.focusZone === 'toolbar' ? 'list' : 'toolbar' });
      }
      if (input === 's') return handleSave();
      if (input === 'r') return handleReload();
      if (input === 'x') return handleReset();
      if (input === '/') return dispatch({ type: 'openFilter' });
      if (key.escape && state.filter) return dispatch({ type: 'setFilter', value: '' });

      if (state.focusZone === 'toolbar') {
        if (key.leftArrow || input === 'h') return dispatch({ type: 'toolbarMove', delta: -1 });
        if (key.rightArrow || input === 'l') return dispatch({ type: 'toolbarMove', delta: 1 });
        if (key.return) return activateToolbar();
        return;
      }

      // list zone
      const count = filteredEntries.length;
      if (key.upArrow || input === 'k') return dispatch({ type: 'listMove', delta: -1, count });
      if (key.downArrow || input === 'j') return dispatch({ type: 'listMove', delta: 1, count });
      if (key.leftArrow) return dispatch({ type: 'selectColumn', column: 'name' });
      if (key.rightArrow) return dispatch({ type: 'selectColumn', column: 'value' });
      if (key.pageUp) return dispatch({ type: 'listMove', delta: -state.viewportRows, count });
      if (key.pageDown) return dispatch({ type: 'listMove', delta: state.viewportRows, count });
      if (key.home) return dispatch({ type: 'listTo', index: 0, count });
      if (key.end) return dispatch({ type: 'listTo', index: count - 1, count });
      if (key.return) {
        if (!selected) return;
        if (state.selectedColumn === 'name') return beginEdit('name');
        return dispatch({ type: 'openValueModal', entryId: selected.id });
      }
      if (input === 'n') return beginEdit('name');
      if (input === 'v') return beginEdit('value');
      if (input === 'a') {
        if (state.filter) dispatch({ type: 'setFilter', value: '' });
        return dispatch({ type: 'addEntry' });
      }
      if (input === 'd') {
        if (selected) dispatch({ type: 'deleteEntry', entryId: selected.id });
        return;
      }
      if (input === '[') return dispatch({ type: 'adjustNameColumn', delta: -1 });
      if (input === ']') return dispatch({ type: 'adjustNameColumn', delta: 1 });
    },
    { isActive: mode.kind === 'browse' && !state.loading && !suspended },
  );

  // ---- render -------------------------------------------------------------
  const editingId = mode.kind === 'editName' || mode.kind === 'editValue' ? mode.entryId : null;
  const editingField: 'name' | 'value' | null =
    mode.kind === 'editName' ? 'name' : mode.kind === 'editValue' ? 'value' : null;

  const help =
    mode.kind === 'browse'
      ? state.focusZone === 'toolbar'
        ? '←/→ select · Enter open/activate · Tab list · s save · r reload · x reset · T theme · q quit'
        : '↑/↓ row · ←/→ col · Enter edit · Tab selectors · / search · n name · v value · a add · d del · s save · [/] col width · T theme · q quit'
      : '';

  function renderMiddle(): React.ReactNode {
    const modalWidth = Math.floor(size.columns * 0.75);
    const modalHeight = Math.floor(middleRows * 0.85);

    if (state.loading) {
      const loadingW = Math.min(Math.floor(size.columns * 0.55), 52);
      return (
        <Box width="100%" height={middleRows} flexDirection="column" alignItems="center" justifyContent="center">
          <LoadingModal
            message={state.loadingMessage}
            tick={ballTick}
            width={loadingW}
            onQuit={() => exit()}
          />
        </Box>
      );
    }

    switch (mode.kind) {
      case 'select': {
        const items =
          mode.which === 'context'
            ? state.contexts.map((c) => ({ label: c.name, value: c.name, hint: c.cluster }))
            : mode.which === 'namespace'
              ? state.namespaces.map((n) => ({ label: n, value: n }))
              : state.secrets.map((s) => ({ label: s.name, value: s.name, hint: s.type }));
        const titles = { context: 'Select context', namespace: 'Select namespace', secret: 'Select secret' };
        const current =
          mode.which === 'context'
            ? state.currentContext
            : mode.which === 'namespace'
              ? state.currentNamespace
              : state.currentSecret;
        return (
          <CenteredModal height={middleRows}>
            <SelectList
              title={titles[mode.which]}
              items={items}
              currentValue={current}
              height={modalHeight}
              onSelect={(v) => chooseFromList(mode.which, v)}
              onCancel={() => dispatch({ type: 'closeMode' })}
            />
          </CenteredModal>
        );
      }
      case 'valueModal': {
        const entry = state.entries.find((e) => e.id === mode.entryId);
        if (!entry) return null;
        return (
          <CenteredModal height={middleRows}>
            <ValueEditorModal
              entry={entry}
              sub={mode.sub}
              width={modalWidth}
              height={modalHeight}
              onSetSub={(sub) => dispatch({ type: 'setModalSub', sub })}
              onCommit={(id, value) => dispatch({ type: 'commitValue', entryId: id, value })}
              onCancel={() => dispatch({ type: 'closeMode' })}
            />
          </CenteredModal>
        );
      }
      case 'confirmSave':
        return (
          <CenteredModal height={middleRows}>
            <DiffConfirmModal
              changes={changes}
              width={modalWidth}
              height={modalHeight}
              restartOnSave={state.restartOnSave}
              onToggleRestart={() => dispatch({ type: 'toggleRestartOnSave' })}
              onConfirm={() => {
                const restart = state.restartOnSave;
                dispatch({ type: 'closeMode' });
                void performSave(restart);
              }}
              onCancel={() => dispatch({ type: 'closeMode' })}
            />
          </CenteredModal>
        );
      case 'confirmDiscard':
        return (
          <CenteredModal height={middleRows}>
            <ConfirmDiscard
              pending={mode.pending}
              onConfirm={() => runPending(mode.pending)}
              onCancel={() => dispatch({ type: 'closeMode' })}
            />
          </CenteredModal>
        );
      case 'authError':
        return (
          <CenteredModal height={middleRows}>
            <AuthErrorModal
              message={mode.message}
              onRetry={() => runRetry(mode.retry)}
              onLogin={() => void runGcloudLogin(mode.retry)}
              onDismiss={() => dispatch({ type: 'closeMode' })}
            />
          </CenteredModal>
        );
      case 'themeSelect':
        return (
          <CenteredModal height={middleRows}>
            <SelectList
              title="Theme"
              items={THEME_NAMES.map((n) => ({ label: n, value: n }))}
              currentValue={getCurrentThemeName()}
              height={Math.min(THEME_NAMES.length + 4, modalHeight)}
              onSelect={(name) => {
                applyTheme(name);
                saveThemeName(name);
                dispatch({ type: 'closeMode' });
                dispatch({ type: 'setStatus', status: { kind: 'info', text: `Theme: ${name}` } });
              }}
              onCancel={() => dispatch({ type: 'closeMode' })}
            />
          </CenteredModal>
        );
      case 'restartProgress':
        return (
          <CenteredModal height={middleRows}>
            <RestartProgressModal
              items={mode.items}
              onClose={() => dispatch({ type: 'closeMode' })}
            />
          </CenteredModal>
        );
      default: {
        return (
          <Box flexDirection="column" flexGrow={1} width="100%">
            <Text color={theme.border}>{'─'.repeat(ruleW)}</Text>
            {showFilter && (
              <FilterBar
                query={state.filter}
                active={mode.kind === 'filter'}
                matchCount={filteredEntries.length}
                total={state.entries.length}
                onChange={(v) => dispatch({ type: 'setFilter', value: v })}
                onSubmit={() => dispatch({ type: 'closeMode' })}
                onCancel={() => {
                  dispatch({ type: 'setFilter', value: '' });
                  dispatch({ type: 'closeMode' });
                }}
              />
            )}
            <SecretList
              entries={filteredEntries}
              original={state.original}
              selectedIndex={selectedIndex}
              rows={listBodyRows}
              width={innerWidth}
              focused={state.focusZone === 'list'}
              selectedColumn={state.selectedColumn}
              editingId={editingId}
              editingField={editingField}
              emptyHint={state.filter ? 'no entries match the search' : undefined}
              nameColumnOffset={state.nameColumnOffset}
              onCommitName={(id, key) => dispatch({ type: 'commitName', entryId: id, key })}
              onCommitValue={(id, value) => dispatch({ type: 'commitValue', entryId: id, value })}
              onCancelEdit={cancelEdit}
            />
            <Text color={theme.border}>{'─'.repeat(ruleW)}</Text>
          </Box>
        );
      }
    }
  }

  return (
    <Box flexDirection="column" width={size.columns} height={size.rows}>
      <Toolbar state={state} dirty={dirty} />
      <Box flexDirection="column" flexGrow={1}>
        {renderMiddle()}
      </Box>
      <StatusBar state={state} dirty={dirty} help={help} />
    </Box>
  );
}

export type { AppState };
