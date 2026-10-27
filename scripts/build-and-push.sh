#!/usr/bin/env bash
# usage: ./scripts/build-and-push.sh <dockerhub user> [tag]
set -e
USER_NAME="${1:?docker hub user name required}"
TAG="${2:-1.1}"
cd "$(dirname "$0")/.."
for svc in canvas history web; do
  docker build -t "$USER_NAME/pixelboard-$svc:$TAG" "services/$svc"
  docker push "$USER_NAME/pixelboard-$svc:$TAG"
done
