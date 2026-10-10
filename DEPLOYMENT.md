# DSA OS — Deployment & Production Operations Guide

> **Operating System:** Linux (Ubuntu 22.04+ LTS) or Containerized Cloud  
> **Architecture:** Modular Monolith (FastAPI + PostgreSQL 16 + Redis + React TypeScript SPA)

---

## 1. Quick Start (Local & Evaluation)

### Frontend Development Server
```bash
cd frontend
npm install
npm run dev
# Running on http://localhost:5173
```

### Backend API Server
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Or .venv\Scripts\activate on Windows
pip install -e .
python -m uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000 --reload
# API documentation available at http://localhost:8000/api/docs
```

---

## 2. Docker Compose (Full Stack Deployment)

For staging and production deployments, run the entire stack using `docker-compose.yml`:

```bash
docker compose up -d
```

### Deployed Services:
1. **Frontend (`frontend`):** Nginx serving compiled React SPA on port `80` (or reverse-proxied on `443`).
2. **Backend API (`backend`):** FastAPI async application running on port `8000`.
3. **Database (`postgres`):** PostgreSQL 16 with Row-Level Security on port `5432`.
4. **Cache & Task Broker (`redis`):** Redis 7 on port `6379`.
5. **Object Storage (`minio`):** MinIO S3-compatible private storage on ports `9000` (API) and `9001` (Console).
6. **Background Worker (`worker`):** ARQ async task worker handling document quarantine processing and notifications.
7. **Antivirus Sidecar (`clamav`):** ClamAV daemon on port `3310`.

---

## 3. Database Migrations & Deterministic Seed Data

To initialize database schema and load authentic operational demonstration data for multiple tenants:

```bash
cd backend
# Apply Alembic database migrations
alembic upgrade head

# Seed deterministic multi-tenant data (Apex Capital, BlueStar, Jai Automobiles)
python scripts/seed_data.py
```

### Default Demo Credentials:
- **Tenant 1 (Jai Automobiles / Apex Capital):**
  - Org Slug: `apex-loans` or `jai-automobiles`
  - MD / Owner: `owner@apexloans.com` / `ApexOwner@123`
  - Branch Manager: `manager@apexloans.com` / `ApexManager@123`
  - Sr. Loan Processor: `processor@apexloans.com` / `ApexProcessor@123`
  - Telecaller Desk: `priya.telecaller@jaiautomobiles.com` (role: `telecaller`)
  - Field Officer: `fe@apexloans.com` / `ApexField@123`
  - Chief Accountant: `accountant@apexloans.com` / `ApexAccount@123`
  - Internal Auditor: `auditor@apexloans.com` / `ApexAuditor@123`

- **Tenant 2 (BlueStar Financial Services):**
  - Org Slug: `bluestar`
  - Owner: `owner@bluestar.com` / `BlueStar@123`

---

## 4. Vercel Static Frontend Deployment

1. **Vercel Project:** `Jai-Automobile`
2. **Connected Git Remote:** `https://github.com/shashwat-dev1/Jai-Automobile.git` (`main` branch)
3. **Framework Preset:** `Vite`
4. **Root Directory:** `frontend`
5. **Build Command:** `tsc -b && vite build`
6. **Output Directory:** `dist`
7. **Environment Variables:**
   - `VITE_API_URL`: URL of the deployed FastAPI backend (falls back gracefully to client prototype persistence if offline).

---

## 5. Rollback Procedure

In the event that a rollback to pre-Phase 1 state is required:

### Option A: Instant Vercel Rollback (Zero Downtime)
1. Navigate to the **Vercel Dashboard** for project `Jai-Automobile`.
2. Go to the **Deployments** tab.
3. Locate the previous production deployment prior to commit `feat(phase1): implement Phase 1 rebuild`.
4. Click the three dots `...` and select **Promote to Production** (Instant Rollback).

### Option B: Git Checkpoint Restoration
A recoverable checkpoint branch was created before changes: `checkpoint-pre-phase1`.
To restore via Git:
```bash
git checkout main
git reset --hard checkpoint-pre-phase1
git push origin main --force-with-lease
```
Vercel will automatically re-build and restore the previous state.
