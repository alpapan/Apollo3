# CLAUDE.md

> **⛔ Load the `curatorium-apollo` skill before working in this submodule (HARD
> RULE).** Carries the build/test/lint sequence, corepack+Yarn-PnP failure mode,
> Node 24.14 rationale, and Curatorium auth grafts. Subagents don't inherit it -
> name it.

## What this is

Curatorium's fork of `GMOD/Apollo3` (`curatorium` branch) - the
curation/annotation editor, vendored as top-level `apps/apollo`. **Image +
deployment stay backend-owned**
(`apps/backend/skaffold.yaml`+`k8/7-apollo-*.yaml`). Only
`/curation`+`/api/v0/curation/*` use it, not `/jbrowse`+`/api/v0/genome/*`
(`docs/apollo-integration.md`).

## Build/test/lint from the monorepo, not locally

```bash
cd ~/software/curatorium
ENV=test pixi run curatorium admin build apollo --rebuild --drop
```

Never `docker build` or `kubectl apply` directly.

## Commit submodule changes from here

`cd apps/apollo && git add <file> && git commit -m "feat(apollo): …"` on the
`curatorium` branch. The monorepo pins a specific commit; bumping it needs a
separate commit at the Curatorium monorepo root.
