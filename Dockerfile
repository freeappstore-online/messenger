FROM node:22-slim AS build
WORKDIR /app
RUN npm i -g pnpm
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY shared/package.json shared/
COPY server/package.json server/
RUN pnpm install --frozen-lockfile
COPY shared/ shared/
COPY server/ server/
RUN pnpm --filter server build

FROM node:22-slim
WORKDIR /app
RUN npm i -g pnpm
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY shared/package.json shared/
COPY server/package.json server/
RUN pnpm install --frozen-lockfile --prod
COPY shared/src/ shared/src/
COPY --from=build /app/server/dist server/dist/
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server/dist/index.js"]
