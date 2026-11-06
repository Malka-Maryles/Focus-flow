#!/usr/bin/env bash
# =============================================================================
# FocusFlow — Assignment 4: build & push the two images to Docker Hub.
#
# Run on YOUR computer (Docker Desktop running), from the project root:
#     docker login
#     bash deploy/build-and-push.sh
#
# Why rebuild? The client image now ships the CLOUD nginx.conf (no /api proxy,
# the Load Balancer routes /api instead) and the server image reads $PORT.
# Images are built for linux/amd64 because that is what Cloud Run runs.
# No secrets go into the images: they come from Secret Manager at runtime.
# =============================================================================
set -euo pipefail

DOCKERHUB_USER="${DOCKERHUB_USER:-malkamalk}"
TAG="${TAG:-latest}"

cd "$(dirname "$0")/.."

if [ ! -f public/models/attention_model.onnx ]; then
  echo "ERROR: public/models/attention_model.onnx is missing (the client needs the ONNX model)." >&2
  exit 1
fi

echo ">>> Building client image: $DOCKERHUB_USER/focusflow-frontend:$TAG"
docker buildx build --platform linux/amd64 \
  -t "$DOCKERHUB_USER/focusflow-frontend:$TAG" --push .

echo ">>> Building server image: $DOCKERHUB_USER/focusflow-backend:$TAG"
docker buildx build --platform linux/amd64 \
  -t "$DOCKERHUB_USER/focusflow-backend:$TAG" --push ./backend

echo ">>> Done. Both images are on Docker Hub."
