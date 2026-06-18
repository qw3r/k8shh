/** A single editable secret entry, modeled as one env var (key = value). */
export interface Entry {
  /** Stable id for React keys and selection (independent of the editable key). */
  id: string;
  /** Current env var name (left side, editable). */
  key: string;
  /** Current decoded value (right side, editable). Empty string for binary. */
  value: string;
  /** The key as loaded from the cluster, or null if this entry was newly added. */
  originalKey: string | null;
  /** True when the stored value is not valid UTF-8 — shown read-only to avoid corruption. */
  binary: boolean;
}

/** Lightweight reference to a Secret in the selected namespace. */
export interface SecretRef {
  name: string;
  type: string;
}

/** Basic context info pulled from the kubeconfig. */
export interface ContextInfo {
  name: string;
  cluster: string;
  user: string;
}

/** Result of mapping a cluster Secret into editable entries. */
export interface LoadedSecret {
  name: string;
  namespace: string;
  type: string;
  resourceVersion: string | null;
  entries: Entry[];
}

/** A single change between the pristine snapshot and the working copy. */
export type EntryChange =
  | { kind: 'added'; key: string; newValue: string; binary: boolean }
  | { kind: 'removed'; key: string }
  | { kind: 'changed'; key: string; oldValue: string; newValue: string }
  | {
      kind: 'renamed';
      oldKey: string;
      key: string;
      valueChanged: boolean;
      oldValue: string;
      newValue: string;
    };

/** Body for a JSON merge patch against a Secret. */
export interface MergePatchBody {
  /** Upserts: server base64-encodes these (added / renamed / changed keys). */
  stringData?: Record<string, string>;
  /** Deletions: `null` removes the key (removed / old-name-of-renamed keys). */
  data?: Record<string, string | null>;
}
