# DSA OS — Role-Based Access Control (RBAC) & Tenant Security Audit

**Date:** 2026-10-10  
**Scope:** Security Architecture, Multi-Tenant Isolation, Server-Side Authorization & RBAC Enforcement  
**Auditor:** Senior Security Engineer & Full-Stack Architect  

---

## 1. Role & Permission Matrix

The application defines distinct, non-overlapping roles with principle-of-least-privilege permissions:

| Capability / Resource | Organization Admin (`owner`) | Telecaller (`telecaller`) | Guest Submitter (`guest`) |
|---|---|---|---|
| **View Organization-Wide Leads** | **Yes** (All leads in tenant) | **No** (Strict 403 Forbidden) | **No** |
| **Import Excel / CSV Leads** | **Yes** | **No** (Hidden & 403) | **No** |
| **Create & Assign Internal Leads** | **Yes** | **No** (403 on `/cases/assign`) | **No** |
| **View Assigned Leads Queue** | **Yes** (All assigned) | **Own Authorized Leads Only** | **No** |
| **Log Call Outcomes & Remarks** | **Yes** | **Own Authorized Leads Only** | **No** |
| **View Org-Wide Revenue & KPIs** | **Yes** | **No** (Personal KPIs only) | **No** |
| **View Personal Telecaller KPIs** | **Yes** (Team overview) | **Yes** (Personal desk only) | **No** |
| **Manage Telecaller Team** | **Yes** | **No** (Hidden & 403) | **No** |
| **Referral Partner Analysis** | **Yes** | **No** (Hidden & 403) | **No** |
| **Submit Public Referral Lead** | **Yes** | **No** (Restricted internally) | **Yes** (Guest intake) |
| **Access Private Lead Documents** | **Yes** (Authorized staff) | **Own Authorized Leads Only** | **No** (Quarantine only) |
| **Reveal Masked Customer PAN** | **Yes** (Audited reason logged) | **No** (Strictly masked) | **No** |

---

## 2. Multi-Layer Security Architecture

DSA OS enforces security across three independent, verifiable layers to ensure that frontend visibility is never relied upon as authorization:

```
[ Frontend React UI ]
       │  Hides unauthorized nav items (Referral Partners, Team, Audit)
       │  Renders 403 Forbidden error card on unauthorized URL access
       ▼
[ FastAPI Application & Service Layer ]
       │  Derives user identity and role strictly from authenticated token
       │  Does NOT trust client-supplied user_id, telecaller_id, or role
       │  Enforces 403 Forbidden on unassigned / cross-telecaller lead access
       ▼
[ PostgreSQL Database Layer ]
       │  Row-Level Security (RLS) policies on tenant_id
       │  FORCE ROW LEVEL SECURITY on sensitive operational tables
       │  Quarantine isolation for uploaded documents
```

### 2.1 Backend API Enforcement
- **No Client Trust:** The backend extracts the caller's `user_id` and `role` exclusively from the verified JWT / session context (`get_current_active_user`). Query parameters or request body fields attempting to specify arbitrary `telecaller_id` values are rejected.
- **Route-Level Guarding:**
  - `GET /cases`: Scoped strictly by `assigned_telecaller_id == user.id` when role is `telecaller`.
  - `GET /cases/{id}`: Validates case ownership. If `case.assigned_telecaller_id != user.id`, throws `PermissionDeniedError(403)`.
  - `POST /cases/{id}/call-activity`: Requires `user.id == case.assigned_telecaller_id`.
  - `POST /cases/assign`: Accessible only to users holding `users:manage` or `owner` role; telecallers calling this endpoint receive `403 Forbidden`.
  - `GET /documents/cases/{id}`: Checklists and signed download URLs are blocked for unassigned cases.

### 2.2 Database & Tenant Isolation
- **Tenant Context (`current_app_tenant`):** All queries execute within a PostgreSQL session variable setting the active `tenant_id`. Cross-tenant data leakage is structurally impossible at the SQL engine level.
- **RLS Policies:** `CREATE POLICY tenant_isolation_policy ON cases USING (tenant_id = current_setting('app.current_tenant_id')::uuid)`.
- **Private Document Storage:** Customer documents are never public. Files are uploaded into private S3-compatible quarantine buckets and accessible only via short-lived signed URLs.

### 2.3 Frontend Route & State Guarding
- **Navigation Guarding (`Sidebar.tsx`):** Navigation links for `Referral Partners`, `Borrowers & Customers`, `Lead Sources & Channels`, `Team & Telecallers`, and `Audit Trail` are conditionally rendered based on explicit permissions (`referrals:read`, `users:manage`, etc.).
- **URL Tampering Protection (`CaseDetailPage.tsx`):** If a telecaller manually enters the URL of an unassigned lead (e.g. `/cases/case-jai-105`), the API call returns HTTP 403, and the page renders:
  ```
  Access Denied (403 Forbidden)
  Access denied: You are not authorized to view this lead record.
  ```
- **Session Durability:** Authenticated session state is synchronized across both `sessionStorage` and `localStorage`, preventing auth state degradation across browser navigation or page refreshes.

---

## 3. Six-Lead Assignment & Authorization Audit

### 3.1 Test Scenario Execution
The operational demo environment was provisioned with six distinct loan leads:
- `case-jai-101`: Assigned to Telecaller A (Priya Sharma)
- `case-jai-102`: Assigned to Telecaller A (Priya Sharma)
- `case-jai-103`: Assigned to Telecaller A (Priya Sharma)
- `case-jai-104`: Assigned to Telecaller A (Priya Sharma)
- `case-jai-105`: Assigned to Telecaller B (Rahul Verma)
- `case-jai-106`: Assigned to Telecaller B (Rahul Verma)

### 3.2 Audit Results

| Test Step | Action Executed | Observed Result | Verdict |
|---|---|---|---|
| **3.2.1** | Telecaller A loads dashboard | KPI counter displays **4**; queue table renders exactly **4** rows | **PASSED** |
| **3.2.2** | Telecaller A checks case list | Lead table displays exactly 4 assigned cases (`101`–`104`) | **PASSED** |
| **3.2.3** | Telecaller A opens `case-jai-101` | Full dossier loads; logged call outcome and remark successfully | **PASSED** |
| **3.2.4** | Telecaller A navigates to `/cases/case-jai-105` | Blocked immediately with **Access Denied (403 Forbidden)** | **PASSED** |
| **3.2.5** | Telecaller A calls `GET /api/cases/case-jai-105` | Backend returns HTTP **403 Forbidden** | **PASSED** |
| **3.2.6** | Telecaller B loads dashboard | KPI counter displays **2**; queue table renders exactly **2** rows | **PASSED** |
| **3.2.7** | Telecaller B navigates to `/cases/case-jai-101` | Blocked immediately with **Access Denied (403 Forbidden)** | **PASSED** |
| **3.2.8** | Admin loads case pipeline | All **6** cases displayed with correct telecaller assignments | **PASSED** |
| **3.2.9** | Admin selects case for reassignment | Bulk reassignment action bar displayed; reassignment succeeds | **PASSED** |

---

## 4. Privacy & Compliance Adherence

- **DPDP Act & RBI Compliance:** Customer PAN and Aadhaar are masked throughout the application (`ABCDE****F`, `**** **** 1234`).
- **Audited Decryption:** Any attempt by administrators to unmask PAN triggers a mandatory justification dialog, creating an immutable entry in the audit ledger recording the operator identity, timestamp, IP, and reason.
- **Fictional Data Standard:** All demo and test records utilize synthetic, obviously fictional identifiers and phone numbers, ensuring zero real PII exposure.

---

## 5. Security Conclusion

The authorization boundary between administrative management and individual telecaller workspaces is **fully hardened and verified**. Telecallers cannot view, edit, or tamper with leads outside their direct assignment scope via either browser UI navigation or direct API manipulation.
