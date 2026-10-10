# DSA OS — Deployment

> Deployment architecture for development, staging, and pilot production.

---

## Development Environment

```bash
docker compose up
```

Services:
- `backend` — FastAPI with uvicorn (hot-reload)
- `worker` — ARQ worker
- `frontend` — Vite dev server with proxy to backend
- `postgres` — PostgreSQL 16
- `redis` — Redis 7
- `minio` — MinIO object storage
- `clamav` — ClamAV malware scanning (sidecar)

Ports:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- MinIO console: `http://localhost:9001`
- PostgreSQL: `localhost:5432`

## Pilot Production

Single VM or small cluster in India-region provider with Docker Compose.

- Nginx reverse proxy with TLS (Let's Encrypt)
- PostgreSQL with volume encryption and daily backups
- MinIO with separate data volume
- Redis persistent storage
- All services on internal Docker network (not exposed)

## Environment Variables

Managed via `.env` file (not committed). See `.env.example` for template.

Key variables:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` — MinIO/S3 config
- `JWT_SECRET_KEY` — JWT signing key
- `ENCRYPTION_KEY` — Fernet key for field encryption
- `ALLOWED_ORIGINS` — CORS allowed origins

## Backup Strategy

- **Database**: daily `pg_dump` compressed and encrypted, stored off-server
- **Object storage**: daily MinIO mirror/sync to separate location
- **Retention**: 30 days of daily backups
- **Restore test**: monthly automated restore to staging
- **RPO**: 24 hours; **RTO**: 8 hours

## Monitoring (PH-10)

- Prometheus metrics from FastAPI and PostgreSQL exporters
- Grafana dashboards for: request latency, error rate, queue depth, storage usage, backup status
- Alerting: email/webhook on errors, high latency, failed backups
