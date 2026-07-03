# CLAUDE.md

> **⛔ Load the `curatorium-apollo` skill before working in this submodule (HARD
> RULE).** It carries the full build/test/lint sequence, the corepack+Yarn-PnP
> failure mode, the Node 24.14 pin rationale, and the Curatorium auth grafts.
> Subagents do not inherit it - name it in the dispatch prompt.

## What this is

Curatorium's fork of `GMOD/Apollo3` (tracks the `curatorium` branch) - the
curation/annotation editor. Vendored as top-level `apps/apollo`; the **image and
deployment stay backend-owned** (`apps/backend/skaffold.yaml` +
`apps/backend/k8/7-apollo-*.yaml`). Only `/curation` + `/api/v0/curation/*` use
it - `/jbrowse` + `/api/v0/genome/*` do not (`docs/apollo-integration.md`).

## Build/test/lint from the monorepo, not locally

```bash
cd ~/software/curatorium
ENV=test pixi run curatorium admin build apollo --rebuild --drop
```

Never `docker build` or `kubectl apply` directly.

## Commit submodule changes from here

`cd apps/apollo && git add <file> && git commit -m "feat(apollo): …"` on the
`curatorium` branch. The monorepo pins a specific commit; bumping the pin is a
separate commit in the Curatorium monorepo root.
