FROM node:20-alpine

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
ENV PORT=80
ENV HOSTNAME=0.0.0.0

# Build the project
RUN pnpm build
RUN pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify

# Expose port
EXPOSE 80

# Start the server
CMD ["node", "dist/server.js"]
