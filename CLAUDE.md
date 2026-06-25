# CLAUDE.md

This file provides guidance to Claude Code when working in the apollo submodule.

## What Apollo3 is (upstream)

Apollo3 is a NestJS + JBrowse genome-annotation editor, a Yarn-PnP monorepo
(ESM) under `packages/*`. This repo is the Curatorium fork of `GMOD/Apollo3`
(the `org.opencontainers.image.source` is `https://github.com/alpapan/Apollo3`);
Curatorium tracks the `curatorium` branch. See the upstream `README.md` /
`packages/website` docs for the editor itself.

## Monorepo Context

Vendored as `apps/apollo` (a **top-level** submodule) inside the Curatorium
monorepo (typically `~/software/curatorium`). It was promoted from the old
nested location `apps/backend/containers/apollo`.

**apollo is the Curatorium curation/annotation editor.** It serves the
Curatorium-extended collaboration server (NestJS, `EXPOSE 3999`,
`CMD yarn start:prod`) which also bundles the JBrowse Apollo plugin UMD and
serves it at `/plugin/*`. It talks to MongoDB at `mongo:27017` (ClusterIP). The
`/curation` + `/api/v0/curation/*` routes use it; the read-only `/jbrowse` +
`/api/v0/genome/*` paths do NOT (see root `docs/apollo-integration.md`).

Although the source now lives at top-level `apps/apollo`, the **image and
deployment stay backend-owned**: built via `apps/backend/skaffold.yaml`
(artifact `localhost:5000/curatorium-apollo`, build `context: ../apollo`) and
deployed via `apps/backend/k8/7-apollo-*.yaml`.

## Build (Node 24.14, Yarn PnP)

There is **no root `build` script** - each workspace package has its own `build`
(so a bare `yarn build` only works from inside a package dir, which is why the
Dockerfile `WORKDIR`s into each package). `yarn install` installs deps but does
**not** build; a fresh clone has no `packages/*/dist`.

The canonical host build (mirrors `Dockerfile`) is the pixi `build` task:

```bash
pixi run -m apps/apollo/pixi.toml build
```

which runs (conda node 24.14, Berry invoked directly via
`node .yarn/releases/yarn-4.14.1.cjs` - NOT via corepack; see
`docs/apollo-pixi-build-corepack-pnp.md`):

```bash
( cd packages/jbrowse-plugin-apollo     && JB_UMD=true node "$PIXI_PROJECT_ROOT/.yarn/releases/yarn-4.14.1.cjs" build )   # @apollo-annotation/shared + tsc project-ref deps + JBrowse UMD plugin
( cd packages/apollo-collaboration-server && node "$PIXI_PROJECT_ROOT/.yarn/releases/yarn-4.14.1.cjs" build )             # build:shared + nest build (schemas/common/mst/shared dists + server)
```

Run this once after a fresh clone / `pixi run install` before any host test,
lint, or commit (see below).

## Test / Lint

```bash
pixi run -m apps/apollo/pixi.toml test       # jest, scoped to src/authentication/ + src/users/ (the specs the fork maintains)
pixi run -m apps/apollo/pixi.toml test-all   # full ACS jest suite (many upstream scaffolds are red - expected)
pixi run -m apps/apollo/pixi.toml lint       # eslint --max-warnings 0 over the whole monorepo
```

- **Use the pixi `test` task, not bare jest.** It invokes
  `node .yarn/releases/yarn-4.14.1.cjs node --experimental-vm-modules $(node .yarn/releases/yarn-4.14.1.cjs bin jest)`;
  a bare `NODE_OPTIONS=... jest` breaks the Yarn-PnP wrapper.
- **Build first.** Both `test` and `lint` need `packages/*/dist`; without a
  build they fail with `Cannot find module .../apollo-schemas/dist/index.js`.
- Node is pinned to **24.14** via this env's `pixi.toml` conda dependency
  (`nodejs = ">=24.14,<24.15"`), not nvm: 24.15+ broke `jest-resolve` and
  ESLint's config-loader under Yarn PnP + ESM. The pixi tasks invoke Berry
  directly via `node "$PIXI_PROJECT_ROOT/.yarn/releases/yarn-4.14.1.cjs"` (NOT
  via corepack - corepack's `runVersion()` fails under Yarn PnP; see
  `docs/apollo-pixi-build-corepack-pnp.md`). `.nvmrc` (24.14) remains for host
  devs who prefer nvm.

## Curatorium-specific auth

- HS256 JWT signed with `CURATORIUM_APOLLO_JWT_SECRET`.
- Returns **403** (not 401) on a bad token.
- Env vars are `CURATORIUM_APOLLO_*` (not bare `APOLLO_*`).

## Commit submodule changes from here

`cd apps/apollo && git add <file> && git commit -m "feat(apollo): …"` on the
`curatorium` branch. The monorepo pins a specific commit of this submodule;
bumping the pin requires a separate commit in the Curatorium monorepo root.
