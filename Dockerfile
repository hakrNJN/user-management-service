# Stage 1: Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy dependency definition files
COPY package.json pnpm-lock.yaml ./

# Install all dependencies including devDependencies needed for build
RUN pnpm install --frozen-lockfile

# Copy the rest of the application source code
COPY . .

# Build the TypeScript application
RUN pnpm run build

# Remove development dependencies
# Note: pnpm prune --prod might not be strictly necessary if we copy node_modules
# selectively, but keeping it for clarity or if node_modules structure changes.
# Alternatively, we could reinstall prod dependencies in the final stage.
# Let's reinstall prod dependencies in the final stage for a cleaner approach.
# RUN pnpm prune --prod # Commenting this out

# Stage 2: Production stage
FROM node:20-alpine

WORKDIR /app

# Create a non-root user and group
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Install pnpm for running prod install
RUN npm install -g pnpm

# Copy dependency definition files
COPY package.json pnpm-lock.yaml ./

# Install ONLY production dependencies
RUN pnpm install --prod --frozen-lockfile

# Copy built application from the builder stage
COPY --from=builder /app/dist ./dist
# Copy package.json again in case it's needed by the runtime (though likely not)
COPY package.json .

# Ensure the non-root user owns the application files
# Do this *after* installing dependencies as root, then change ownership
RUN chown -R appuser:appgroup /app

# Switch to the non-root user
USER appuser

# Expose the application port (assuming 3000, adjust if necessary)
EXPOSE 3000

# Command to run the application using the start script defined in package.json
# This uses "node dist/main.js" as per package.json
CMD ["pnpm", "start"]
