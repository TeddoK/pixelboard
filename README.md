# Pixelboard

A shared pixel canvas. Everyone who opens the page paints on the same 64x64 grid,
and the canvas is snapshotted every minute so you can replay how it grew.
Built for the PA2577 "Build Something" assignment.

## Services

| Service | Port | What it does |
|---|---|---|
| `web` | 8080 | Serves the page and forwards `/api/*` calls to the two backends. The only thing reachable from outside. |
| `canvas` | 3000 | Owns the pixels. `GET /api/canvas`, `PUT /api/pixel`. Validates input, has a small rate limit. |
| `history` | 3001 | Every `SNAPSHOT_SECONDS` it fetches the canvas over REST and stores a snapshot. `GET /api/snapshots`, `GET /api/snapshots/:bucket`. |
| `mongo` | 27017 | MongoDB 7 with a persistent volume. Not reachable from outside the cluster. |

`web`, `canvas` and `history` are stateless and can be scaled separately. `history` is safe to run
with several replicas because snapshots are keyed by time bucket, so replicas overwrite the same
document instead of creating duplicates.

## Run locally

```
docker compose up --build
```

Open http://localhost:8080. Snapshots are taken every 30 s in compose so the replay has something to show quickly.

## Images

The images are on Docker Hub:

- `teddok/pixelboard-web:1.1`
- `teddok/pixelboard-canvas:1.1`
- `teddok/pixelboard-history:1.1`

To build and push your own, change the user in `k8s/kustomization.yaml`, log in to Docker Hub, then

```
./scripts/build-and-push.sh yourdockerhubuser        # bash
.\scripts\build-and-push.ps1 -User yourdockerhubuser  # powershell
```

## Deploy to Kubernetes

```
kubectl apply -k k8s/
kubectl -n pixelboard get all
```

Docker Desktop: open http://localhost (the `web` Service is a LoadBalancer on port 80, also exposed as NodePort 30080).
minikube: `minikube service web -n pixelboard`.

Scale a service:

```
kubectl -n pixelboard scale deployment canvas --replicas=4
kubectl -n pixelboard scale deployment history --replicas=2
```

Logs:

```
kubectl -n pixelboard logs deployment/history -f
```

Configuration lives in `k8s/config.yaml` (grid size, snapshot interval, rate limit, service URLs)
and the Mongo credentials in `k8s/secret.yaml`. Change the password there before using this anywhere
that is not a laptop.

## Notes

- Pixels are last-writer-wins. Two people painting the same pixel at the same time is not a conflict worth solving here.
- The rate limit is per replica, not global. With three `canvas` replicas a client gets roughly three times the quota. A shared counter in Redis would fix that.
- Snapshots store the whole canvas each time, roughly 160 kB for a full 64x64 board, and old ones are never deleted. A TTL index would be the first fix, diffs for a bigger grid.
