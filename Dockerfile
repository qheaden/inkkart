# Build stage: bundle the app with Bun
FROM oven/bun:1 AS build
WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build the static bundle
COPY index.html tsconfig.json ./
COPY src ./src
RUN bun run build

# Serve stage: static files via nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
