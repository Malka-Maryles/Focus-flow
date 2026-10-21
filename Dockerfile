# Frontend Dockerfile for FocusFlow (Vite + React + TypeScript)
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first for Docker caching
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy application source code
COPY . .

# Build the frontend assets
RUN npm run build

# Copy onnxruntime-web WASM assets into dist so nginx can serve them
RUN cp node_modules/onnxruntime-web/dist/*.wasm dist/ 2>/dev/null || true && \
    cp node_modules/onnxruntime-web/dist/*.mjs dist/ 2>/dev/null || true

# Serve stage using nginx with /api proxy to backend
FROM nginx:alpine AS runner

WORKDIR /app

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
