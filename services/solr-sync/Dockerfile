FROM node:20-alpine AS builder

WORKDIR /build

# Install all dependencies (including devDependencies for building)
COPY package*.json ./
RUN npm ci && \
    npm cache clean --force

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Install production dependencies only
RUN npm ci --omit=dev && \
    npm cache clean --force

# Production stage
FROM node:20-alpine

# Install PM2 globally and create user
RUN npm install -g pm2@latest && \
    npm cache clean --force && \
    (addgroup -g 1001 appuser || true) && \
    (adduser -D -u 1001 -G appuser appuser || true)

WORKDIR /app

# Copy built files and dependencies
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package*.json ./
COPY pm2.config.cjs ./

# Set ownership
RUN chown -R appuser:appuser /app

USER appuser

# Start with PM2
CMD ["npm", "start"]

