FROM node:20-alpine

# Install bash (Alpine doesn't include it by default, but build scripts require it)
RUN apk add --no-cache bash

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Set environment
ENV COZE_PROJECT_ENV=PROD
ENV HOSTNAME=0.0.0.0

# Build the project (build.sh handles both next build and tsup)
RUN pnpm build

# Expose port (Render injects PORT env variable automatically)
EXPOSE 80

# Start the server
CMD ["node", "dist/server.js"]
