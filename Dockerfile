# Build the web PWA and API from the same locked monorepo.
FROM node:24-bookworm-slim AS build
ENV CI=true
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Keep the workspace dependencies available for the versioned DB migration command.
# Migrations are intentionally NOT run automatically at container startup.
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY --from=build /app /app
EXPOSE 8080
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
