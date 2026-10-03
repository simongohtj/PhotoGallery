# Production image for Photo Gallery
FROM node:20-alpine

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Set working directory
WORKDIR /app

# Install tzdata for accurate timezone support
RUN apk add --no-cache tzdata

# Copy dependency manifests and install production packages
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy application source code with non-root ownership
COPY --chown=node:node . .

# Ensure persistent directories exist with correct permissions for node user
RUN mkdir -p /app/data /app/public/uploads /app/public/audio && \
    chown -R node:node /app/data /app/public/uploads /app/public/audio

# Switch to non-root user for security
USER node

# Expose default HTTP port
EXPOSE 3000

# Health check to ensure Express server responds
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:3000/api/config || exit 1

# Start the gallery server
CMD ["node", "server.js"]
