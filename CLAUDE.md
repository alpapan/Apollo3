# CLAUDE.md

> **Load the `curatorium-apollo` skill before working in this submodule (HARD
> RULE).** Carries the build/test/lint sequence, corepack+Yarn-PnP failure mode,
> Node 24.22 rationale, and Curatorium auth grafts. Subagents do not inherit it: name it in the prompt.

## What this is

- Curatorium's fork of `GMOD/Apollo3` (`curatorium` branch): the curation/annotation editor, vendored as top-level `apps/apollo`.
- Image and deployment stay backend-owned (`apps/backend/skaffold.yaml`, `apps/backend/k8/7-apollo-*.yaml`).
- Only `/curation` and `/api/v0/curation/*` use it, not `/jbrowse` or `/api/v0/genome/*` (`docs/apollo-integration.md`).

## Build/test/lint from the monorepo, not locally

- From the monorepo root: `ENV=test pixi run curatorium k3s build apollo --rebuild --drop`
- Host tasks (`build` first, then `test` and `lint`): `pixi run -m apps/apollo/pixi.toml <task>`; the skill carries the sequence.

## Commits

- `apps/apollo` is a submodule (fork branch `curatorium`); the monorepo pins a specific commit of it.
- Commit from the monorepo root, one commit per program (root `CLAUDE.md`): stage files explicitly (`git add apps/apollo/<file>`) and end the message with the `Claude-Session:` trailer the root file requires.
