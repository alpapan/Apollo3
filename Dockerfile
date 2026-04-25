# syntax=docker/dockerfile:1

FROM localhost:5000/node:24.14 AS setup
WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/ .yarn/
COPY packages/ packages/
RUN find packages/ -type f \! \( -name "package.json" -o -name "yarn.lock" \) -delete && \
find . -type d -empty -delete

FROM localhost:5000/node:24.14 AS build
WORKDIR /app
COPY --from=setup /app .
RUN yarn install --immutable
COPY . .
# Build the JBrowse plugin first so the runtime image can serve its UMD
# bundle alongside the NestJS API. The rollup config gates UMD output on
# JB_UMD=true (default is ESM + CJS only); we opt in here so the runtime
# stage can COPY the UMD bundle. Output:
# packages/jbrowse-plugin-apollo/dist/jbrowse-plugin-apollo.umd.production.js.
WORKDIR /app/packages/jbrowse-plugin-apollo
RUN JB_UMD=true yarn build
WORKDIR /app/packages/apollo-collaboration-server
RUN yarn build

FROM localhost:5000/node:24.14
LABEL org.opencontainers.image.source=https://github.com/alpapan/Apollo3
LABEL org.opencontainers.image.description="Curatorium-extended Apollo collaboration server (bundles the JBrowse Apollo plugin UMD and serves it from /plugin)"
WORKDIR /app
COPY --from=setup /app .
COPY --from=build /app/packages/apollo-collaboration-server/dist /app/packages/apollo-collaboration-server/dist
COPY --from=build /app/packages/apollo-common/dist /app/packages/apollo-common/dist
COPY --from=build /app/packages/apollo-mst/dist /app/packages/apollo-mst/dist
COPY --from=build /app/packages/apollo-schemas/dist /app/packages/apollo-schemas/dist
COPY --from=build /app/packages/apollo-shared/dist /app/packages/apollo-shared/dist
# Curatorium extension: bundle the built plugin UMD so main.ts can serve
# it via express.static at /plugin/*. Same version pinning as the server
# image — both are produced from the same monorepo commit.
COPY --from=build /app/packages/jbrowse-plugin-apollo/dist/jbrowse-plugin-apollo.umd.production.min.js /app/plugin/jbrowse-plugin-apollo.umd.production.min.js
RUN yarn workspaces focus --production @apollo-annotation/collaboration-server
EXPOSE 3999
CMD ["yarn", "start:prod"]
