# gap-cli-secrets

Interactive Kubernetes **secret editor** in your terminal, built with [Ink](https://github.com/vadimdemedes/ink) (React + Yoga flexbox) and the official [`@kubernetes/client-node`](https://github.com/kubernetes-client/javascript) SDK.

It treats a Secret's `data` keys as an application's environment variables: pick a context → namespace → secret, then edit each `NAME = VALUE` pair. Large/JSON values can be opened in a fullscreen modal, pretty-printed, and edited. Saving shows a diff and writes back **only the changed keys** via a merge patch.

## Requirements

- A working `kubectl` context (this app reads your default kubeconfig — the same `$KUBECONFIG` / `~/.kube/config` that kubectl uses). No cluster credentials are stored by this tool.
- [mise](https://mise.jdx.dev) to manage the toolchain (pins Node 24 LTS).

## Getting started

```sh
mise install        # installs Node 24 (from mise.toml)
mise run install    # npm install
mise run dev        # launch the TUI
```

Other tasks:

```sh
mise run start      # launch the TUI (alias of dev)
mise run typecheck  # tsc --noEmit
mise run build      # compile to dist/
mise run test       # unit tests
mise run fmt        # prettier
```

## Keybindings

Browse list: `↑/↓` or `j/k` move · `PgUp/PgDn` · `Home/End` · `Enter` open value editor · `n` edit name · `v` inline-edit value · `a` add · `d` delete · `s` save · `r` reload · `x` reset · `Tab` switch panes · `q` quit.

Value modal — view: `e` edit · `p` pretty (JSON) · `m` minify (JSON) · `↑/↓` scroll · `Esc` close. Edit: type freely · arrows move the cursor · `Enter` newline · `Esc` back to view.

Save confirm: `y`/`Enter` to apply · `n`/`Esc` to cancel.

## Safety

- Nothing is written to the cluster until you confirm the diff on **Save**.
- Only changed/added/removed keys are patched (`stringData` for upserts, `data: { key: null }` for deletes); other keys are left untouched.
- Non-UTF8 (binary) secret values are shown read-only to avoid corrupting them.

See [`PLAN.md`](./PLAN.md) for the design.
