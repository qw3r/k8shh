import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
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
import { loadLastSelection, saveLastSelection } from './state/persistence.js';

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
  onDismiss,
}: {
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  useInput((input, key) => {
    if (key.escape) return onDismiss();
    if (key.return || input === 'r') return onRetry();
  });
  return (
    <Box flexDirection="column" borderStyle="double" borderColor="red" paddingX={1}>
      <Text bold color="red">
        Authentication error
      </Text>
      <Text>{message}</Text>
      <Text dimColor>Run: gcloud auth login  (or refresh your token), then retry.</Text>
      <Text dimColor>Enter/r retry · Esc dismiss</Text>
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
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">
        Rolling restart — {items.length} deployment{items.length !== 1 ? 's' : ''}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {items.map((item) => (
          <Box key={item.name}>
            <Text color={item.status === 'done' ? 'green' : item.status === 'error' ? 'red' : 'cyan'}>
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
    <Box flexDirection="column" borderStyle="double" borderColor="red" paddingX={1}>
      <Text bold color="red">
        Discard unsaved changes?
      </Text>
      <Text>You have unsaved edits. {verb} and lose them?</Text>
      <Text dimColor>y/Enter confirm · n/Esc cancel</Text>
    </Box>
  );
}

export function App() {
  const { exit } = useApp();
  const size = useTerminalSize();
  const [state, dispatch] = useReducer(reducer, initialState);
  const clientRef = useRef<K8sClient | null>(null);
  const [ballTick, setBallTick] = useState(0);

  useEffect(() => {
    if (!state.loading) return;
    const id = setInterval(() => setBallTick((t) => t + 1), 40);
    return () => clearInterval(id);
  }, [state.loading]);

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
    if (ns) await loadSecrets(ns);
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
  const toolbarHeight = 3;
  const statusHeight = 4; // border adds 2 lines to 2-line status bar
  const middleRows = Math.max(4, size.rows - toolbarHeight - statusHeight);
  const showFilter = state.mode.kind === 'filter' || state.filter.length > 0;
  // 2 (outer panel border) + 3 (filter with border, when shown) + 1 (header) + 1 (footer)
  const listBodyRows = Math.max(1, middleRows - (showFilter ? 7 : 4));
  const innerWidth = Math.max(20, size.columns - 4);
  const borderInnerWidth = Math.max(0, size.columns - 2);
  // Knight-rider block ~10% wide, bouncing within a centered zone (~30% of the border).
  const ballW = Math.max(3, Math.floor(borderInnerWidth * 0.1));
  const zoneW = Math.min(borderInnerWidth, ballW * 3);
  const zoneStart = Math.floor((borderInnerWidth - zoneW) / 2);
  const ballPos = (() => {
    const travel = Math.max(1, zoneW - ballW);
    const cycle = travel * 2;
    const raw = ballTick % cycle;
    return zoneStart + (raw <= travel ? raw : cycle - raw);
  })();

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
    { isActive: mode.kind === 'browse' && !state.loading },
  );

  // ---- render -------------------------------------------------------------
  const editingId = mode.kind === 'editName' || mode.kind === 'editValue' ? mode.entryId : null;
  const editingField: 'name' | 'value' | null =
    mode.kind === 'editName' ? 'name' : mode.kind === 'editValue' ? 'value' : null;

  const help =
    mode.kind === 'browse'
      ? state.focusZone === 'toolbar'
        ? '←/→ select · Enter open/activate · Tab list · s save · r reload · x reset · q quit'
        : '↑/↓ row · ←/→ col · Enter edit · Tab selectors · / search · n name · v value · a add · d del · s save · [/] col width · q quit'
      : '';

  function renderMiddle(): React.ReactNode {
    const modalWidth = Math.floor(size.columns * 0.75);
    const modalHeight = Math.floor(middleRows * 0.85);
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
              onDismiss={() => dispatch({ type: 'closeMode' })}
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
        const focusColor = state.focusZone === 'list' ? 'cyan' : 'gray';
        const right = Math.max(0, borderInnerWidth - ballPos - ballW);
        const topBorder = state.loading ? (
          <Box>
            <Text color={focusColor}>{'╭' + '─'.repeat(ballPos)}</Text>
            <Text bold color="white">{'▓'.repeat(ballW)}</Text>
            <Text color={focusColor}>{'─'.repeat(right) + '╮'}</Text>
          </Box>
        ) : (
          <Text color={focusColor}>{'╭' + '─'.repeat(borderInnerWidth) + '╮'}</Text>
        );
        return (
          <Box flexDirection="column" flexGrow={1} width="100%">
            {topBorder}
            <Box
              flexGrow={1}
              borderStyle="round"
              borderTop={false}
              borderBottom={false}
              borderColor={focusColor}
            >
              <Box flexDirection="column" flexGrow={1}>
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
              </Box>
            </Box>
            <Text color={focusColor}>{'╰' + '─'.repeat(borderInnerWidth) + '╯'}</Text>
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
