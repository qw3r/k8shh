import { CoreV1Api, KubeConfig, PatchStrategy, setHeaderOptions } from '@kubernetes/client-node';
import type { ContextInfo, LoadedSecret, MergePatchBody, SecretRef } from './types.js';
import { entriesFromData } from './secrets.js';

/**
 * Thin wrapper around `@kubernetes/client-node` that loads the default
 * kubeconfig (same one kubectl uses) and exposes just the operations the TUI
 * needs. The UI never touches the SDK directly.
 */
export class K8sClient {
  private kc: KubeConfig;
  private core: CoreV1Api;

  constructor() {
    this.kc = new KubeConfig();
    this.kc.loadFromDefault();
    this.core = this.kc.makeApiClient(CoreV1Api);
  }

  /** All contexts defined in the kubeconfig. */
  listContexts(): ContextInfo[] {
    return this.kc.getContexts().map((c) => ({
      name: c.name,
      cluster: c.cluster,
      user: c.user,
    }));
  }

  /** The currently selected context name (may be empty if none set). */
  getCurrentContext(): string {
    return this.kc.getCurrentContext();
  }

  /** Switch context and rebuild the API client so the new credentials/server take effect. */
  setContext(name: string): void {
    this.kc.setCurrentContext(name);
    this.core = this.kc.makeApiClient(CoreV1Api);
  }

  /** The default namespace declared on a context, if any. */
  getContextNamespace(name: string): string | null {
    return this.kc.getContextObject(name)?.namespace ?? null;
  }

  /** List namespace names, sorted. */
  async listNamespaces(): Promise<string[]> {
    const res = await this.core.listNamespace();
    return res.items
      .map((n) => n.metadata?.name)
      .filter((n): n is string => typeof n === 'string')
      .sort((a, b) => a.localeCompare(b));
  }

  /** List all secrets in a namespace (no type filter), sorted by name. */
  async listSecrets(namespace: string): Promise<SecretRef[]> {
    const res = await this.core.listNamespacedSecret({ namespace });
    return res.items
      .map((s) => ({ name: s.metadata?.name ?? '', type: s.type ?? 'Opaque' }))
      .filter((s) => s.name !== '')
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Read a secret and map it into editable entries. */
  async readSecret(namespace: string, name: string): Promise<LoadedSecret> {
    const secret = await this.core.readNamespacedSecret({ name, namespace });
    return {
      name,
      namespace,
      type: secret.type ?? 'Opaque',
      resourceVersion: secret.metadata?.resourceVersion ?? null,
      entries: entriesFromData(secret.data ?? {}),
    };
  }

  /**
   * Apply a JSON merge patch to a secret, touching only the keys in `body`.
   * Returns the new resourceVersion when the server reports one.
   */
  async patchSecret(namespace: string, name: string, body: MergePatchBody): Promise<string | null> {
    const updated = await this.core.patchNamespacedSecret(
      { name, namespace, body },
      setHeaderOptions('Content-Type', PatchStrategy.MergePatch),
    );
    return updated.metadata?.resourceVersion ?? null;
  }
}

/** Extract a human-friendly message from a client-node / fetch error. */
export function describeError(err: unknown): string {
  if (err && typeof err === 'object') {
    const anyErr = err as { body?: unknown; message?: unknown; code?: unknown };
    if (anyErr.body && typeof anyErr.body === 'object') {
      const body = anyErr.body as { message?: unknown };
      if (typeof body.message === 'string') return body.message;
    }
    if (typeof anyErr.message === 'string') return anyErr.message;
    if (typeof anyErr.code !== 'undefined') return `request failed (${String(anyErr.code)})`;
  }
  return String(err);
}
