# DSA OS — Design References

> These design reference images represent the **Release 1** visual direction for DSA OS.
> They are **concept references**, not pixel-perfect specifications.
> The PRD/SRS takes precedence over any design detail.

---

## Reference Images

### 1. Dashboard Overview (`dsa_os_dashboard_overview.jpg`)

Business overview dashboard showing:
- KPI summary strip (Active Cases, Disbursed This Month, Payout Due, Overdue Tasks)
- Case Pipeline data table with status chips
- Dark forest green sidebar navigation
- Warm ivory content area following Graphite Ledger design system

### 2. Case Detail (`dsa_os_case_detail.jpg`)

Individual case dossier view showing:
- Three-column layout: Customer Dossier, Loan Details, Lender Applications
- Document Checklist with progress indicator
- Case Timeline showing status transitions
- Masked PII fields (PAN shown as `XXXX-XXXX-1234`)

### 3. Payout Reconciliation (`dsa_os_payout_reconciliation.jpg`)

Payout and reconciliation workspace showing:
- Tab navigation: Expectations, Receipts, Reconciliation, Rules
- Financial KPI strip with payout totals
- Reconciliation data table with variance tracking
- Configurable TDS rate field (not hardcoded)

---

## Scope Compliance

These references have been verified to **NOT include**:
- ❌ E-mandate / NACH
- ❌ Vehicle eligibility / Lender fit scoring / match percentages
- ❌ RBI compliance claims / Aadhaar OTP verification
- ❌ SMS notification references
- ❌ Automatic TDS 5% claim
- ❌ Lender Match Matrix
- ❌ Real customer data

All data shown is **synthetic demo data** as required by AGENTS.md.

---

## Data Compliance

All identifiers visible in these references use the synthetic patterns defined in `docs/DESIGN_SYSTEM.md`:
- PAN: `XXXX-XXXX-1234` (masked)
- Mobile: `+91 90000 00001`
- Vehicle: `RJ-00-XX-0000`
- Customer names: `Rajesh Kumar Demo`, `Priya Sharma Demo`, etc.
- Lenders: `HDFC Bank Demo`, `ICICI Bank Demo`, etc.
