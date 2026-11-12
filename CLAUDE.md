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
- Cadence comes from the plan index. When it gives none, commit once per program of work inside the submodule: `git -C apps/apollo add <file>` (explicit files), then `git -C apps/apollo commit`, ending the message with the `Claude-Session:` trailer the root `CLAUDE.md` requires.
- Bump the pointer in the monorepo root in the following turn, once every submodule of the program is committed: `git add apps/apollo` and commit, with the same trailer. This gives one root commit per program of work. Discipline: `docs/worktree-guide.md`, "Submodule inventory".
- Keep the submodule on branch `curatorium`; never leave it detached.
- Build before committing: the `build` task in `apps/apollo/pixi.toml` produces the `packages/*/dist` outputs that the host test and lint need, and its comment lists the pre-commit hook (`.husky/pre-commit`) among the consumers. Run `pixi run -m apps/apollo/pixi.toml build` once after a fresh clone or `pixi run -m apps/apollo/pixi.toml install`, before any host test or lint and before committing.
