"""
DSA OS — Production-Grade Realistic Development & Operations Seed Data

Populates a comprehensive, authentic operational dataset for vehicle-loan operations:
- Organization: Apex Capital Advisors
- Empanelled Lenders: HDFC Bank, ICICI Bank, Kotak Mahindra, Axis Bank, Tata Capital, Cholamandalam
- Real Lead Sources: Maruti & Hyundai Authorized Dealers, Pre-Owned Dealerships, Sub-DSA Partner Network
- Full Case Lifecycle: 16 realistic vehicle-loan cases (New Car, Used Car, Commercial Vehicle)
- Active Pipeline across all stages: Lead -> Docs -> Login -> Sanction -> Disbursal -> PDD -> Closed
- Real PDD Tracking: Invoice, Insurance with Bank Hypothecation, Form 34, RC Endorsement
- Payout Receivables & Commission Grid: Accrued commission receivables, TDS deductions, sub-DSA splits
- Bank Statement Reconciliation: Exact UTR matches and authentic short-payment discrepancy for queue testing
- Operational Follow-up Tasks & SLA Timers

Complies with AGENTS.md:
- No real citizen PII; authentic synthetic Indian naming and structure.
- Never uses "Demo", "Dummy", "Test", or role labels in parentheses.
"""

import asyncio
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
import logging
import uuid

from sqlalchemy import delete, select
from app.database import get_engine, get_session_factory, set_tenant_context
from app.modules.auth.models import User
from app.modules.auth.security import hash_password
from app.modules.cases.models import Case, CaseParty, CaseStatusHistory, ConsentRecord, Vehicle
from app.modules.cases.state_machine import (
    CASE_STATUS_CLOSED,
    CASE_STATUS_DISBURSED,
    CASE_STATUS_DOCS_COLLECTED,
    CASE_STATUS_DOCS_IN_PROGRESS,
    CASE_STATUS_FILE_LOGGED_IN,
    CASE_STATUS_IN_REVIEW_LENDER,
    CASE_STATUS_LEAD,
    CASE_STATUS_LEAD_QUALIFIED,
    CASE_STATUS_PDD_PENDING,
    CASE_STATUS_SANCTIONED,
)
from app.modules.documents.models import Document, DocumentType
from app.modules.lenders.models import Lender, LenderApplication
from app.modules.parties.models import Party
from app.modules.payout.models import PayoutExpectation, PayoutRule, PayoutSplit
from app.modules.payout.reconciliation.models import ImportBatch, PayoutReceipt, Reconciliation
from app.modules.pdd.models import PDDItem
from app.modules.sources.models import Source
from app.modules.tenancy.models import Organization
from app.modules.workflow.models import SLAConfig, Task
from app.shared.encryption import encrypt_field

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Deterministic IDs
ORG_A_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
ORG_B_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")


async def clean_org_data(session, org_id: uuid.UUID) -> None:
    """Safely wipe existing domain records for org to enable clean deterministic re-seed."""
    logger.info("Cleaning existing operational data for org %s...", org_id)
    await session.execute(delete(Reconciliation).where(Reconciliation.org_id == org_id))
    await session.execute(delete(PayoutReceipt).where(PayoutReceipt.org_id == org_id))
    await session.execute(delete(ImportBatch).where(ImportBatch.org_id == org_id))
    await session.execute(delete(PayoutSplit).where(PayoutSplit.org_id == org_id))
    await session.execute(delete(PayoutExpectation).where(PayoutExpectation.org_id == org_id))
    await session.execute(delete(PayoutRule).where(PayoutRule.org_id == org_id))
    await session.execute(delete(Document).where(Document.org_id == org_id))
    await session.execute(delete(PDDItem).where(PDDItem.org_id == org_id))
    await session.execute(delete(Task).where(Task.org_id == org_id))
    await session.execute(delete(LenderApplication).where(LenderApplication.org_id == org_id))
    await session.execute(delete(Vehicle).where(Vehicle.org_id == org_id))
    await session.execute(delete(ConsentRecord).where(ConsentRecord.org_id == org_id))
    await session.execute(delete(CaseStatusHistory).where(CaseStatusHistory.org_id == org_id))
    await session.execute(delete(CaseParty).where(CaseParty.org_id == org_id))
    await session.execute(delete(Case).where(Case.org_id == org_id))
    await session.execute(delete(Party).where(Party.org_id == org_id))
    await session.execute(delete(SLAConfig).where(SLAConfig.org_id == org_id))
    await session.execute(delete(Source).where(Source.org_id == org_id))
    await session.execute(delete(Lender).where(Lender.org_id == org_id))
    await session.commit()


async def seed() -> None:
    session_factory = get_session_factory()
    now_utc = datetime.now(UTC)
    today = now_utc.date()

    async with session_factory() as session:
        logger.info("Verifying Organizations...")
        org_a = await session.get(Organization, ORG_A_ID)
        if not org_a:
            org_a = Organization(
                id=ORG_A_ID,
                name="Apex Capital Advisors",
                slug="apex-loans",
                plan="growth",
                region="in-west-1",
                settings={
                    "currency": "INR",
                    "timezone": "Asia/Kolkata",
                    "branding": {
                        "name": "Apex Capital Advisors",
                        "tagline": "Commercial Vehicle & Equipment Lending",
                        "logo_url": "/jai_auto_logo.jpg",
                        "theme_preset": "navy_slate",
                        "primary_color": "#2563eb",
                        "accent_color": "#94a3b8",
                    },
                    "modules": {
                        "cases": True,
                        "documents": True,
                        "lenders": True,
                        "pdd": True,
                        "payout": True,
                        "reconciliation": True,
                        "reports": True,
                        "audit": True,
                    },
                },
                is_active=True,
            )
            session.add(org_a)
        else:
            org_a.name = "Apex Capital Advisors"
            org_a.settings = {
                "currency": "INR",
                "timezone": "Asia/Kolkata",
                "branding": {
                    "name": "Apex Capital Advisors",
                    "tagline": "Commercial Vehicle & Equipment Lending",
                    "logo_url": "/jai_auto_logo.jpg",
                    "theme_preset": "navy_slate",
                    "primary_color": "#2563eb",
                    "accent_color": "#94a3b8",
                },
                "modules": {
                    "cases": True,
                    "documents": True,
                    "lenders": True,
                    "pdd": True,
                    "payout": True,
                    "reconciliation": True,
                    "reports": True,
                    "audit": True,
                },
            }

        org_b = await session.get(Organization, ORG_B_ID)
        if not org_b:
            org_b = Organization(
                id=ORG_B_ID,
                name="BlueStar Financial Services",
                slug="bluestar",
                plan="starter",
                region="in-west-1",
                settings={
                    "currency": "INR",
                    "timezone": "Asia/Kolkata",
                    "branding": {
                        "name": "BlueStar Financial Services",
                        "tagline": "Retail & Two-Wheeler Auto Finance",
                        "logo_url": "/jai_auto_logo.jpg",
                        "theme_preset": "sapphire_royal",
                        "primary_color": "#4f46e5",
                        "accent_color": "#38bdf8",
                    },
                    "modules": {
                        "cases": True,
                        "documents": True,
                        "lenders": True,
                        "pdd": True,
                        "payout": True,
                        "reconciliation": False,
                        "reports": True,
                        "audit": False,
                    },
                },
                is_active=True,
            )
            session.add(org_b)
        else:
            org_b.name = "BlueStar Financial Services"
            org_b.settings = {
                "currency": "INR",
                "timezone": "Asia/Kolkata",
                "branding": {
                    "name": "BlueStar Financial Services",
                    "tagline": "Retail & Two-Wheeler Auto Finance",
                    "logo_url": "/jai_auto_logo.jpg",
                    "theme_preset": "sapphire_royal",
                    "primary_color": "#4f46e5",
                    "accent_color": "#38bdf8",
                },
                "modules": {
                    "cases": True,
                    "documents": True,
                    "lenders": True,
                    "pdd": True,
                    "payout": True,
                    "reconciliation": False,
                    "reports": True,
                    "audit": False,
                },
            }

        await session.commit()

        # Clean existing domain data for Org A to avoid conflicts
        from sqlalchemy import text
        await session.execute(
            text("SELECT set_config('app.current_org_id', :org_id, false)"),
            {"org_id": str(ORG_A_ID)},
        )
        await clean_org_data(session, ORG_A_ID)
        await session.execute(
            text("SELECT set_config('app.current_org_id', :org_id, false)"),
            {"org_id": str(ORG_A_ID)},
        )

        # ---------------------------------------------------------------------
        # 1. Team Users (Clean, professional Indian names)
        # ---------------------------------------------------------------------
        logger.info("Upserting team users for Apex Capital Advisors...")
        users_def = [
            ("Aarav Sharma", "owner@apexloans.com", "9820011001", "owner", "ApexOwner@123"),
            ("Priya Patel", "manager@apexloans.com", "9820011002", "manager", "ApexManager@123"),
            ("Rohan Verma", "processor@apexloans.com", "9820011003", "processor", "ApexProcessor@123"),
            ("Kavita Singh", "fe@apexloans.com", "9820011004", "field_executive", "ApexField@123"),
            ("Sanjay Gupta", "accountant@apexloans.com", "9820011005", "accountant", "ApexAccount@123"),
            ("Meera Iyer", "auditor@apexloans.com", "9820011006", "auditor", "ApexAuditor@123"),
        ]

        user_objs: dict[str, User] = {}
        for name, email, mobile, role, pwd in users_def:
            res = await session.execute(
                select(User).where(User.org_id == ORG_A_ID, User.email == email)
            )
            existing_user = res.scalar_one_or_none()
            if existing_user:
                existing_user.name = name
                existing_user.mobile = mobile
                existing_user.role = role
                existing_user.password_hash = hash_password(pwd)
                existing_user.is_active = True
                user_objs[role] = existing_user
            else:
                new_user = User(
                    id=uuid.uuid4(),
                    org_id=ORG_A_ID,
                    name=name,
                    email=email,
                    mobile=mobile,
                    role=role,
                    password_hash=hash_password(pwd),
                    auth_version=1,
                    is_active=True,
                )
                session.add(new_user)
                user_objs[role] = new_user

        await session.commit()
        owner_user = user_objs["owner"]
        manager_user = user_objs["manager"]
        processor_user = user_objs["processor"]
        fe_user = user_objs["field_executive"]

        # ---------------------------------------------------------------------
        # 2. Empanelled Lenders
        # ---------------------------------------------------------------------
        logger.info("Seeding empanelled banking partners...")
        lenders_data = [
            ("HDFC Bank", "HDFC", "bank", ["new_car", "used_car", "commercial_vehicle"], "APEX-HDFC-0428", "Vikas Mehrotra", "vikas.m@hdfcbank.com", "9820111222"),
            ("ICICI Bank", "ICICI", "bank", ["new_car", "used_car", "refinance"], "APEX-ICICI-1102", "Sunil Kulkarni", "sunil.k@icicibank.com", "9820222333"),
            ("Kotak Mahindra Bank", "KOTAK", "bank", ["new_car", "used_car"], "KOT-APEX-8821", "Ramesh Solanki", "ramesh.s@kotak.com", "9820333444"),
            ("Axis Bank", "AXIS", "bank", ["new_car", "used_car", "commercial_vehicle"], "AXIS-DSA-5520", "Deepak Shenoy", "deepak.s@axisbank.com", "9820444555"),
            ("Tata Capital", "TATACAP", "nbfc", ["used_car", "commercial_vehicle", "two_wheeler"], "TATA-CF-9012", "Arun Nambiar", "arun.n@tatacapital.com", "9820555666"),
            ("Cholamandalam Finance", "CHOLA", "nbfc", ["commercial_vehicle", "used_car"], "CHOLA-CV-3310", "M. Natarajan", "m.natarajan@chola.murugappa.com", "9820666777"),
        ]

        lender_map: dict[str, Lender] = {}
        for name, code, ltype, prods, dsa_code, contact, email, mob in lenders_data:
            lender = Lender(
                id=uuid.uuid4(),
                org_id=ORG_A_ID,
                name=name,
                code=code,
                type=ltype,
                products=prods,
                dsa_code=dsa_code,
                contact_person=contact,
                contact_email=email,
                contact_mobile=mob,
                is_active=True,
                version=1,
            )
            session.add(lender)
            lender_map[code] = lender

        await session.commit()

        # ---------------------------------------------------------------------
        # 3. Payout Rules (Commission Grids)
        # ---------------------------------------------------------------------
        logger.info("Configuring effective commission rules...")
        rules_def = [
            ("HDFC", "new_car", Decimal("1.650")),
            ("HDFC", "used_car", Decimal("2.100")),
            ("ICICI", "new_car", Decimal("1.750")),
            ("ICICI", "used_car", Decimal("2.250")),
            ("KOTAK", "new_car", Decimal("1.800")),
            ("KOTAK", "used_car", Decimal("2.300")),
            ("AXIS", "new_car", Decimal("1.700")),
            ("AXIS", "used_car", Decimal("2.150")),
            ("TATACAP", "used_car", Decimal("2.500")),
            ("TATACAP", "commercial_vehicle", Decimal("2.750")),
            ("CHOLA", "commercial_vehicle", Decimal("2.800")),
        ]

        payout_rules_map: dict[tuple[str, str], PayoutRule] = {}
        for l_code, product, rate in rules_def:
            p_rule = PayoutRule(
                id=uuid.uuid4(),
                org_id=ORG_A_ID,
                lender_id=lender_map[l_code].id,
                product=product,
                effective_from=date(2026, 1, 1),
                effective_to=None,
                basis="percent",
                rate_percent=rate,
                gating_type="pdd_complete",
                tds_rate_percent=Decimal("5.00"),
                gst_mode="forward_charge",
                is_active=True,
                version=1,
            )
            session.add(p_rule)
            payout_rules_map[(l_code, product)] = p_rule

        # ---------------------------------------------------------------------
        # 4. Lead Sources
        # ---------------------------------------------------------------------
        logger.info("Setting up dealer and partner lead sources...")
        sources_def = [
            ("Sai Motors (Maruti Suzuki)", "dealer", "Santosh Deshmukh", "9819001122", "sai.sales@saimotors.co.in", Decimal("0.40")),
            ("National Wheels (Hyundai)", "dealer", "Girish Tawde", "9819002233", "girish@nationalwheels.com", Decimal("0.45")),
            ("Metro Car Zone (Pre-Owned)", "dealer", "Harshvardhan Jain", "9819003344", "harsh@metrocarzone.in", Decimal("0.50")),
            ("Apex Sub-DSA Network", "sub_dsa", "Nitin Gaikwad", "9819004455", "nitin@apexnetwork.com", Decimal("0.60")),
            ("Sharma Commercials (Tata)", "dealer", "Inderjit Sharma", "9819005566", "inderjit@sharmatrucks.com", Decimal("0.50")),
            ("Direct Walk-in & Web Inflow", "direct", "Priya Patel", "9819006677", "inflow@apexloans.com", Decimal("0.00")),
        ]

        source_map: dict[str, Source] = {}
        for sname, stype, contact, phone, email, d_payout in sources_def:
            src = Source(
                id=uuid.uuid4(),
                org_id=ORG_A_ID,
                name=sname,
                type=stype,
                contact_person=contact,
                phone=phone,
                email=email,
                payout_rate_default=d_payout,
                is_active=True,
                version=1,
            )
            session.add(src)
            source_map[sname] = src

        # ---------------------------------------------------------------------
        # 5. SLA Configurations
        # ---------------------------------------------------------------------
        sla_specs = [
            ("lead", 24),
            ("lead_qualified", 24),
            ("docs_in_progress", 48),
            ("docs_collected", 24),
            ("file_logged_in", 48),
            ("in_review_lender", 72),
            ("queries_raised", 24),
            ("sanctioned", 48),
            ("disbursed", 72),
            ("pdd_pending", 168),
        ]
        for stg, hrs in sla_specs:
            session.add(
                SLAConfig(
                    id=uuid.uuid4(),
                    org_id=ORG_A_ID,
                    entity_type="case",
                    status=stg,
                    sla_hours=hrs,
                    is_active=True,
                    version=1,
                )
            )

        await session.commit()

        # ---------------------------------------------------------------------
        # 6. Customers (Parties)
        # ---------------------------------------------------------------------
        logger.info("Seeding realistic verified customer profiles...")
        parties_data = [
            ("Rajesh Malhotra", "9821100201", "rajesh.m@tcs.com", "salaried", "B-402, Seawoods Palm Beach Road", "Navi Mumbai", "Maharashtra", "400706", Decimal("165000.00"), date(1986, 4, 12), "6182", "3910"),
            ("Vikramaditya Singhania", "9821100202", "vikram@singhanialogistics.in", "self_employed", "Plot 14, MIDC Industrial Area", "Taloja", "Maharashtra", "410208", Decimal("340000.00"), date(1980, 11, 25), "8921", "7204"),
            ("Sneha Kulkarni", "9821100203", "sneha.kulkarni@infosys.com", "salaried", "Flat 1204, Lodha Splendora, Ghodbunder Rd", "Thane", "Maharashtra", "400615", Decimal("145000.00"), date(1991, 8, 19), "4419", "5812"),
            ("Harish Chandra Verma", "9821100204", "vermatraders.borivali@gmail.com", "self_employed", "Shop 8, Station Road, Borivali West", "Mumbai", "Maharashtra", "400092", Decimal("185000.00"), date(1978, 2, 14), "3109", "4411"),
            ("Amitabha Banerjee", "9821100205", "a.banerjee@sbicap.com", "salaried", "A-201, Raheja Heights, Malad East", "Mumbai", "Maharashtra", "400097", Decimal("210000.00"), date(1984, 9, 30), "7740", "8823"),
            ("Sunita Narang", "9821100206", "dr.sunita@narangpathlabs.com", "self_employed", "14, Shivaji Park, Dadar West", "Mumbai", "Maharashtra", "400028", Decimal("280000.00"), date(1982, 6, 8), "9012", "1198"),
            ("Deepak Kumar Yadav", "9821100207", "deepak.yadav.transport@gmail.com", "self_employed", "Gate 3, APMC Market, Vashi", "Navi Mumbai", "Maharashtra", "400703", Decimal("130000.00"), date(1988, 12, 3), "2489", "6631"),
            ("Pooja Deshmukh", "9821100208", "pooja.d@mahindra.com", "salaried", "B-903, Hiranandani Estate", "Thane", "Maharashtra", "400607", Decimal("155000.00"), date(1993, 3, 17), "5123", "9087"),
            ("Manoj Tiwari", "9821100209", "manojtiwari.enterprises@gmail.com", "self_employed", "Gala 5, Laxmi Industrial Estate, Andheri", "Mumbai", "Maharashtra", "400053", Decimal("220000.00"), date(1979, 7, 22), "8341", "3450"),
            ("Anjali Nair", "9821100210", "anjali@nairarchitects.in", "salaried", "11, Bandra Reclamation", "Mumbai", "Maharashtra", "400050", Decimal("175000.00"), date(1990, 10, 5), "6901", "7712"),
            ("Suresh Babu Reddy", "9821100211", "suresh.reddy.trading@gmail.com", "self_employed", "Sector 19, Turbhe Wholesale Yard", "Navi Mumbai", "Maharashtra", "400705", Decimal("190000.00"), date(1983, 1, 15), "1845", "4902"),
            ("Rahul Saxena", "9821100212", "rahul.saxena@lnt.com", "salaried", "C-601, Godrej Woodsman, Powai", "Mumbai", "Maharashtra", "400076", Decimal("195000.00"), date(1987, 5, 29), "9342", "8120"),
            ("Vandana Joshi", "9821100213", "vandana.joshi@somaiya.edu", "salaried", "D-14, Tilak Nagar, Chembur", "Mumbai", "Maharashtra", "400089", Decimal("125000.00"), date(1976, 11, 10), "4590", "2390"),
            ("Pradeep Chawla", "9821100214", "chawla.hospitality@gmail.com", "self_employed", "3, Linking Road, Khar West", "Mumbai", "Maharashtra", "400052", Decimal("310000.00"), date(1981, 8, 4), "7211", "6701"),
            ("Neha Mehra", "9821100215", "neha.mehra@deloitte.com", "salaried", "Tower 3, Rustomjee Urbania", "Thane", "Maharashtra", "400601", Decimal("160000.00"), date(1994, 2, 28), "3678", "5019"),
            ("Kishore Shenoy", "9821100216", "shenoy.motors@rediffmail.com", "self_employed", "Shop 12, Swastik Park, Chembur", "Mumbai", "Maharashtra", "400071", Decimal("140000.00"), date(1985, 6, 16), "8119", "9940"),
        ]

        party_objs: list[Party] = []
        for name, mob, email, emp, addr1, city, state, pin, inc, dob, pan_last, aadh_last in parties_data:
            dummy_pan = f"AAAPM{pan_last}"
            p = Party(
                id=uuid.uuid4(),
                org_id=ORG_A_ID,
                name=name,
                mobile_primary=mob,
                email=email,
                employment_type=emp,
                address_line1=addr1,
                city=city,
                state=state,
                pincode=pin,
                monthly_income=inc,
                dob=dob,
                pan_encrypted=encrypt_field(dummy_pan),
                pan_last_four=pan_last,
                aadhaar_last_four=aadh_last,
                version=1,
            )
            session.add(p)
            party_objs.append(p)

        await session.commit()

        # ---------------------------------------------------------------------
        # 7. Operational Cases Across Full Lifecycle
        # ---------------------------------------------------------------------
        logger.info("Constructing active case pipeline and vehicle assets...")

        # Case specifications:
        # (case_no, product_type, status, party_idx, source_key, loan_req, loan_sanc, loan_disb, veh_make, veh_model, veh_variant, veh_year, cond, reg_no, val_amt, days_ago)
        cases_specs = [
            # Disbursed & Completed Cases (Revenue generated)
            ("APX-2026-0101", "new_car", CASE_STATUS_DISBURSED, 0, "National Wheels (Hyundai)", Decimal("1450000.00"), Decimal("1450000.00"), Decimal("1450000.00"), "Hyundai", "Creta", "SX (O) 1.5 Diesel AT", 2026, "new", "MH-02-FE-8192", Decimal("1850000.00"), 25),
            ("APX-2026-0102", "new_car", CASE_STATUS_DISBURSED, 1, "Sai Motors (Maruti Suzuki)", Decimal("1080000.00"), Decimal("1080000.00"), Decimal("1080000.00"), "Maruti Suzuki", "Brezza", "ZXi Plus AT Dual Tone", 2026, "new", "MH-03-DF-4401", Decimal("1320000.00"), 18),
            ("APX-2026-0103", "new_car", CASE_STATUS_DISBURSED, 2, "Direct Walk-in & Web Inflow", Decimal("1620000.00"), Decimal("1620000.00"), Decimal("1620000.00"), "Tata Motors", "Nexon EV", "Empowered Plus LR", 2026, "new", "MH-04-EV-9011", Decimal("1980000.00"), 12),
            ("APX-2026-0104", "used_car", CASE_STATUS_DISBURSED, 3, "Metro Car Zone (Pre-Owned)", Decimal("1250000.00"), Decimal("1250000.00"), Decimal("1250000.00"), "Mahindra", "Thar", "LX 4-Str Hard Top Diesel", 2023, "used", "MH-01-CP-7788", Decimal("1420000.00"), 8),
            ("APX-2026-0105", "used_car", CASE_STATUS_PDD_PENDING, 4, "Apex Sub-DSA Network", Decimal("920000.00"), Decimal("920000.00"), Decimal("920000.00"), "Honda", "City", "ZX CVT Petrol", 2022, "used", "MH-02-BR-3329", Decimal("1050000.00"), 4),
            ("APX-2026-0106", "new_car", CASE_STATUS_CLOSED, 15, "National Wheels (Hyundai)", Decimal("1380000.00"), Decimal("1380000.00"), Decimal("1380000.00"), "Kia", "Seltos", "GTX Plus 1.5 Turbo DCT", 2026, "new", "MH-02-EQ-1920", Decimal("1760000.00"), 45),

            # Sanctioned Cases (Awaiting disbursal document / margin money)
            ("APX-2026-0107", "new_car", CASE_STATUS_SANCTIONED, 5, "Direct Walk-in & Web Inflow", Decimal("2800000.00"), Decimal("2650000.00"), None, "Toyota", "Innova Hycross", "ZX (O) Hybrid", 2026, "new", None, Decimal("3250000.00"), 3),
            ("APX-2026-0108", "new_car", CASE_STATUS_SANCTIONED, 6, "National Wheels (Hyundai)", Decimal("1300000.00"), Decimal("1300000.00"), None, "Skoda", "Slavia", "Style 1.5 TSI AT", 2026, "new", None, Decimal("1620000.00"), 2),
            ("APX-2026-0109", "used_car", CASE_STATUS_SANCTIONED, 7, "Metro Car Zone (Pre-Owned)", Decimal("1750000.00"), Decimal("1650000.00"), None, "Mahindra", "Scorpio-N", "Z8L 4WD AT Diesel", 2023, "used", "MH-04-KA-8012", Decimal("1950000.00"), 5),

            # In Underwriting & Lender Processing
            ("APX-2026-0110", "commercial_vehicle", CASE_STATUS_IN_REVIEW_LENDER, 8, "Sharma Commercials (Tata)", Decimal("540000.00"), None, None, "Tata Motors", "Ace Gold", "HT Plus Diesel BS6", 2026, "new", None, Decimal("680000.00"), 4),
            ("APX-2026-0111", "used_car", CASE_STATUS_FILE_LOGGED_IN, 9, "Apex Sub-DSA Network", Decimal("1120000.00"), None, None, "Volkswagen", "Taigun", "Topline 1.0 TSI AT", 2022, "used", "MH-12-TX-5511", Decimal("1280000.00"), 2),

            # Document Stage & Early Pipeline
            ("APX-2026-0112", "new_car", CASE_STATUS_DOCS_COLLECTED, 10, "National Wheels (Hyundai)", Decimal("890000.00"), None, None, "Hyundai", "Venue", "SX Knight Edition 1.0 Turbo", 2026, "new", None, Decimal("1140000.00"), 3),
            ("APX-2026-0113", "commercial_vehicle", CASE_STATUS_DOCS_IN_PROGRESS, 11, "Sharma Commercials (Tata)", Decimal("710000.00"), None, None, "Mahindra", "Bolero Maxi Truck", "Plus CNG 1.3T", 2026, "new", None, Decimal("890000.00"), 2),
            ("APX-2026-0114", "used_car", CASE_STATUS_DOCS_IN_PROGRESS, 12, "Metro Car Zone (Pre-Owned)", Decimal("650000.00"), None, None, "Maruti Suzuki", "Swift", "ZXi AMT", 2021, "used", "MH-03-CC-9182", Decimal("740000.00"), 1),
            ("APX-2026-0115", "commercial_vehicle", CASE_STATUS_LEAD_QUALIFIED, 13, "Sharma Commercials (Tata)", Decimal("820000.00"), None, None, "Ashok Leyland", "Bada Dost", "i4 Diesel Pickup", 2026, "new", None, Decimal("1020000.00"), 1),
            ("APX-2026-0116", "new_car", CASE_STATUS_LEAD, 14, "Sai Motors (Maruti Suzuki)", Decimal("950000.00"), None, None, "Maruti Suzuki", "Grand Vitara", "Delta AT", 2026, "new", None, Decimal("1250000.00"), 0),
        ]

        created_cases: list[Case] = []
        for (
            c_no, prod, stg, p_idx, s_key, l_req, l_sanc, l_disb,
            v_make, v_model, v_var, v_yr, cond, reg_no, val_amt, days_ago
        ) in cases_specs:
            case_id = uuid.uuid4()
            created_at = now_utc - timedelta(days=days_ago, hours=2)
            c = Case(
                id=case_id,
                org_id=ORG_A_ID,
                case_no=c_no,
                product_type=prod,
                status=stg,
                loan_amount_requested=l_req,
                loan_amount_sanctioned=l_sanc,
                loan_amount_disbursed=l_disb,
                source_id=source_map[s_key].id,
                source_executive=source_map[s_key].contact_person,
                owner_id=owner_user.id if p_idx % 2 == 0 else manager_user.id,
                assigned_processor_id=processor_user.id,
                entered_stage_at=created_at,
                created_at=created_at,
                updated_at=created_at,
                version=1,
            )
            session.add(c)
            created_cases.append(c)

            # Link primary applicant
            session.add(
                CaseParty(
                    id=uuid.uuid4(),
                    org_id=ORG_A_ID,
                    case_id=case_id,
                    party_id=party_objs[p_idx].id,
                    role="applicant",
                    is_primary=True,
                    version=1,
                )
            )

            # Link vehicle
            session.add(
                Vehicle(
                    id=uuid.uuid4(),
                    org_id=ORG_A_ID,
                    case_id=case_id,
                    vehicle_type="four_wheeler" if prod != "commercial_vehicle" else "commercial",
                    make=v_make,
                    model=v_model,
                    variant=v_var,
                    year_of_manufacture=v_yr,
                    condition=cond,
                    registration_no=reg_no,
                    valuation_amount=val_amt,
                    version=1,
                )
            )

            # Record privacy consent
            session.add(
                ConsentRecord(
                    id=uuid.uuid4(),
                    org_id=ORG_A_ID,
                    party_id=party_objs[p_idx].id,
                    case_id=case_id,
                    purpose="loan_processing",
                    consent_type="physical_form",
                    is_given=True,
                    recorded_by=owner_user.id,
                    recorded_at=created_at,
                    version=1,
                )
            )

            # Record initial history
            session.add(
                CaseStatusHistory(
                    id=uuid.uuid4(),
                    org_id=ORG_A_ID,
                    case_id=case_id,
                    from_status=None,
                    to_status=stg,
                    reason="Initial intake",
                    changed_by=owner_user.id,
                    created_at=created_at,
                    version=1,
                )
            )

        await session.commit()

        # ---------------------------------------------------------------------
        # 8. Lender Applications & Sanctions
        # ---------------------------------------------------------------------
        logger.info("Configuring multi-lender submissions and winning sanctions...")

        # Map case_no to case entity
        case_dict = {c.case_no: c for c in created_cases}

        # Applications config:
        # (case_no, lender_code, status, sanc_amt, rate, tenure, disb_amt, is_winning, disb_date)
        app_specs = [
            # Case 1 (APX-2026-0101): Disbursed by HDFC Bank
            ("APX-2026-0101", "HDFC", "disbursed", Decimal("1450000.00"), Decimal("8.75"), 60, Decimal("1450000.00"), True, today - timedelta(days=25)),
            ("APX-2026-0101", "ICICI", "rejected", None, None, None, None, False, None),

            # Case 2 (APX-2026-0102): Disbursed by ICICI Bank
            ("APX-2026-0102", "ICICI", "disbursed", Decimal("1080000.00"), Decimal("8.85"), 60, Decimal("1080000.00"), True, today - timedelta(days=18)),
            ("APX-2026-0102", "KOTAK", "sanctioned", Decimal("1050000.00"), Decimal("8.95"), 60, None, False, None),

            # Case 3 (APX-2026-0103): Disbursed by Kotak Bank
            ("APX-2026-0103", "KOTAK", "disbursed", Decimal("1620000.00"), Decimal("8.90"), 84, Decimal("1620000.00"), True, today - timedelta(days=12)),
            ("APX-2026-0103", "HDFC", "sanctioned", Decimal("1600000.00"), Decimal("9.00"), 84, None, False, None),

            # Case 4 (APX-2026-0104): Disbursed by Tata Capital
            ("APX-2026-0104", "TATACAP", "disbursed", Decimal("1250000.00"), Decimal("11.50"), 48, Decimal("1250000.00"), True, today - timedelta(days=8)),
            ("APX-2026-0104", "CHOLA", "under_verification", None, None, None, None, False, None),

            # Case 5 (APX-2026-0105): Disbursed by Axis Bank (PDD Pending)
            ("APX-2026-0105", "AXIS", "disbursed", Decimal("920000.00"), Decimal("11.25"), 48, Decimal("920000.00"), True, today - timedelta(days=4)),

            # Case 6 (APX-2026-0106): Closed after full settlement by HDFC
            ("APX-2026-0106", "HDFC", "disbursed", Decimal("1380000.00"), Decimal("8.65"), 60, Decimal("1380000.00"), True, today - timedelta(days=45)),

            # Case 7 (APX-2026-0107): Sanctioned by HDFC & ICICI
            ("APX-2026-0107", "HDFC", "sanctioned", Decimal("2650000.00"), Decimal("8.70"), 60, None, False, None),
            ("APX-2026-0107", "ICICI", "sanctioned", Decimal("2550000.00"), Decimal("8.80"), 60, None, False, None),

            # Case 8 (APX-2026-0108): Sanctioned by Axis Bank
            ("APX-2026-0108", "AXIS", "sanctioned", Decimal("1300000.00"), Decimal("8.95"), 60, None, False, None),

            # Case 9 (APX-2026-0109): Sanctioned by Tata Capital
            ("APX-2026-0109", "TATACAP", "sanctioned", Decimal("1650000.00"), Decimal("11.75"), 48, None, False, None),

            # Case 10 (APX-2026-0110): Logged in with Tata Capital & Chola
            ("APX-2026-0110", "TATACAP", "logged_in", None, None, None, None, False, None),
            ("APX-2026-0110", "CHOLA", "logged_in", None, None, None, None, False, None),

            # Case 11 (APX-2026-0111): Logged in with Kotak
            ("APX-2026-0111", "KOTAK", "under_verification", None, None, None, None, False, None),
        ]

        winning_apps: dict[str, LenderApplication] = {}
        for c_no, l_code, stg, s_amt, s_rate, s_tenure, d_amt, is_win, d_date in app_specs:
            target_case = case_dict[c_no]
            l_app = LenderApplication(
                id=uuid.uuid4(),
                org_id=ORG_A_ID,
                case_id=target_case.id,
                lender_id=lender_map[l_code].id,
                product=target_case.product_type,
                status=stg,
                sanction_amount=s_amt,
                sanction_rate=s_rate,
                sanction_tenure_months=s_tenure,
                sanction_date=today - timedelta(days=15) if s_amt else None,
                disbursal_amount=d_amt,
                disbursal_date=d_date,
                is_winning=is_win,
                entered_stage_at=now_utc - timedelta(days=3),
                version=1,
            )
            session.add(l_app)
            if is_win:
                winning_apps[c_no] = l_app

        await session.commit()

        # ---------------------------------------------------------------------
        # 9. PDD Items for Disbursed Cases
        # ---------------------------------------------------------------------
        logger.info("Attaching Post-Disbursal Document tracking items...")
        pdd_case_keys = ["APX-2026-0101", "APX-2026-0102", "APX-2026-0103", "APX-2026-0104", "APX-2026-0105", "APX-2026-0106"]

        for c_no in pdd_case_keys:
            target_case = case_dict[c_no]
            win_app = winning_apps[c_no]
            disb_d = win_app.disbursal_date or today

            # 4 Standard PDD deliverables
            if c_no in ["APX-2026-0101", "APX-2026-0106"]:
                statuses = ["acknowledged_by_lender", "acknowledged_by_lender", "acknowledged_by_lender", "acknowledged_by_lender"]
            elif c_no == "APX-2026-0102":
                statuses = ["acknowledged_by_lender", "acknowledged_by_lender", "sent_to_lender", "collected"]
            elif c_no == "APX-2026-0103":
                statuses = ["acknowledged_by_lender", "collected", "pending", "pending"]
            elif c_no == "APX-2026-0104":
                statuses = ["collected", "pending", "pending", "pending"]  # 1 overdue
            else:
                statuses = ["collected", "pending", "pending", "pending"]

            items_def = [
                ("invoice_challan", "Tax Invoice & Delivery Challan", disb_d + timedelta(days=7), statuses[0]),
                ("insurance_clause", "Insurance Policy with Bank Hypothecation Clause", disb_d + timedelta(days=15), statuses[1]),
                ("form_34", "Form 34 RTO Notice of Hypothecation", disb_d + timedelta(days=30), statuses[2]),
                ("rc_hypothecation", "RC Hypothecation Endorsement", disb_d + timedelta(days=45), statuses[3]),
            ]

            for dtype, title, due_d, st in items_def:
                # Deliberately make one item overdue for Attention Panel testing
                eff_due = due_d
                if c_no == "APX-2026-0104" and dtype == "insurance_clause":
                    eff_due = today - timedelta(days=2)  # Overdue by 2 days!

                session.add(
                    PDDItem(
                        id=uuid.uuid4(),
                        org_id=ORG_A_ID,
                        case_id=target_case.id,
                        lender_application_id=win_app.id,
                        document_type=dtype,
                        title=title,
                        status=st,
                        due_date=eff_due,
                        collected_at=now_utc - timedelta(days=3) if st in ["collected", "sent_to_lender", "acknowledged_by_lender"] else None,
                        submitted_to_lender_at=now_utc - timedelta(days=1) if st in ["sent_to_lender", "acknowledged_by_lender"] else None,
                        acknowledged_at=now_utc if st == "acknowledged_by_lender" else None,
                        version=1,
                    )
                )

        await session.commit()

        # ---------------------------------------------------------------------
        # 10. Payout Expectations, Receipts & Reconciliation Ledger
        # ---------------------------------------------------------------------
        logger.info("Generating payout receivables ledger and bank reconciliation...")

        # Expectations for winning disbursed cases:
        # (case_no, lender_code, disb_amt, rate, status, gating_status)
        payout_specs = [
            ("APX-2026-0101", "HDFC", Decimal("1450000.00"), Decimal("1.650"), "paid", "satisfied"),
            ("APX-2026-0102", "ICICI", Decimal("1080000.00"), Decimal("1.750"), "due", "satisfied"),
            ("APX-2026-0103", "KOTAK", Decimal("1620000.00"), Decimal("1.800"), "held", "pending"),
            ("APX-2026-0104", "TATACAP", Decimal("1250000.00"), Decimal("2.500"), "held", "pending"),
            ("APX-2026-0105", "AXIS", Decimal("920000.00"), Decimal("2.150"), "held", "pending"),
            ("APX-2026-0106", "HDFC", Decimal("1380000.00"), Decimal("1.650"), "paid", "satisfied"),
        ]

        expectations: dict[str, PayoutExpectation] = {}
        for c_no, l_code, disb_amt, rate, exp_st, g_st in payout_specs:
            target_case = case_dict[c_no]
            win_app = winning_apps[c_no]
            matched_rule = payout_rules_map[(l_code, target_case.product_type)]

            gross = (disb_amt * rate / Decimal("100.00")).quantize(Decimal("0.01"))
            tds = (gross * Decimal("0.05")).quantize(Decimal("0.01"))
            net = gross - tds

            exp = PayoutExpectation(
                id=uuid.uuid4(),
                org_id=ORG_A_ID,
                case_id=target_case.id,
                lender_application_id=win_app.id,
                rule_id=matched_rule.id,
                rule_snapshot={
                    "rule_id": str(matched_rule.id),
                    "lender": l_code,
                    "rate_percent": str(rate),
                    "basis": "percent",
                },
                disbursal_amount=disb_amt,
                gross_amount=gross,
                tds_rate_percent=Decimal("5.00"),
                tds_amount=tds,
                net_amount=net,
                status=exp_st,
                gating_status=g_st,
                is_override=False,
                version=1,
            )
            session.add(exp)
            expectations[c_no] = exp

            # Add sub-DSA or dealer split if source has payout_rate_default > 0
            src = target_case.source
            if src and src.payout_rate_default and src.payout_rate_default > 0:
                dealer_share = (net * src.payout_rate_default).quantize(Decimal("0.01"))
                session.add(
                    PayoutSplit(
                        id=uuid.uuid4(),
                        org_id=ORG_A_ID,
                        expectation_id=exp.id,
                        beneficiary_type="source",
                        source_id=src.id,
                        share_type="percent",
                        share_value=src.payout_rate_default * Decimal("100.00"),
                        split_amount=dealer_share,
                        version=1,
                    )
                )

        await session.commit()

        # ---------------------------------------------------------------------
        # 11. Bank Statement Import Batch & Matched Receipts
        # ---------------------------------------------------------------------
        logger.info("Importing verified bank payout statements and reconciliation links...")

        # Batch 1: HDFC Bank Statement
        hdfc_batch = ImportBatch(
            id=uuid.uuid4(),
            org_id=ORG_A_ID,
            lender_id=lender_map["HDFC"].id,
            filename="HDFC_COMMISSION_DISB_SEP2026.xlsx",
            total_rows=2,
            matched_rows=2,
            unmatched_rows=0,
            error_rows=0,
            total_received_amount=Decimal("44360.25"),
            status="committed",
            created_by=owner_user.id,
            version=1,
        )
        session.add(hdfc_batch)

        # Receipt 1 for Case APX-2026-0101
        exp_101 = expectations["APX-2026-0101"]
        rcpt_101 = PayoutReceipt(
            id=uuid.uuid4(),
            org_id=ORG_A_ID,
            lender_id=lender_map["HDFC"].id,
            import_batch_id=hdfc_batch.id,
            loan_account_no="HDFC-AUTO-8821901",
            customer_name="Rajesh Malhotra",
            received_amount=exp_101.gross_amount,
            tds_amount=exp_101.tds_amount,
            net_amount=exp_101.net_amount,
            payment_date=today - timedelta(days=5),
            utr_reference="HDFCR52026092000847291",
            match_status="matched",
            case_id=exp_101.case_id,
            lender_application_id=exp_101.lender_application_id,
            version=1,
        )
        session.add(rcpt_101)

        session.add(
            Reconciliation(
                id=uuid.uuid4(),
                org_id=ORG_A_ID,
                expectation_id=exp_101.id,
                receipt_id=rcpt_101.id,
                expected_amount=exp_101.net_amount,
                received_amount=rcpt_101.net_amount,
                variance_amount=Decimal("0.00"),
                status="matched",
                tolerance_used=Decimal("10.00"),
                is_manual=False,
                reconciled_by=owner_user.id,
                reconciled_at=now_utc - timedelta(days=5),
                version=1,
            )
        )

        # Receipt 2 for Case APX-2026-0106
        exp_106 = expectations["APX-2026-0106"]
        rcpt_106 = PayoutReceipt(
            id=uuid.uuid4(),
            org_id=ORG_A_ID,
            lender_id=lender_map["HDFC"].id,
            import_batch_id=hdfc_batch.id,
            loan_account_no="HDFC-AUTO-7719280",
            customer_name="Kishore Shenoy",
            received_amount=exp_106.gross_amount,
            tds_amount=exp_106.tds_amount,
            net_amount=exp_106.net_amount,
            payment_date=today - timedelta(days=30),
            utr_reference="HDFCR52026090500192842",
            match_status="matched",
            case_id=exp_106.case_id,
            lender_application_id=exp_106.lender_application_id,
            version=1,
        )
        session.add(rcpt_106)

        session.add(
            Reconciliation(
                id=uuid.uuid4(),
                org_id=ORG_A_ID,
                expectation_id=exp_106.id,
                receipt_id=rcpt_106.id,
                expected_amount=exp_106.net_amount,
                received_amount=rcpt_106.net_amount,
                variance_amount=Decimal("0.00"),
                status="matched",
                tolerance_used=Decimal("10.00"),
                is_manual=False,
                reconciled_by=owner_user.id,
                reconciled_at=now_utc - timedelta(days=30),
                version=1,
            )
        )

        # Batch 2: ICICI Bank Statement (Contains 1 Short-Payment Variance for Case 2)
        icici_batch = ImportBatch(
            id=uuid.uuid4(),
            org_id=ORG_A_ID,
            lender_id=lender_map["ICICI"].id,
            filename="ICICI_PAYOUT_SETTLEMENT_W39.csv",
            total_rows=1,
            matched_rows=1,
            unmatched_rows=0,
            error_rows=0,
            total_received_amount=Decimal("16955.00"),
            status="committed",
            created_by=owner_user.id,
            version=1,
        )
        session.add(icici_batch)

        exp_102 = expectations["APX-2026-0102"]
        # ICICI credited 16,955 instead of 17,955 (-1,000 discrepancy)
        rcpt_102 = PayoutReceipt(
            id=uuid.uuid4(),
            org_id=ORG_A_ID,
            lender_id=lender_map["ICICI"].id,
            import_batch_id=icici_batch.id,
            loan_account_no="ICICI-AL-990182",
            customer_name="Vikramaditya Singhania",
            received_amount=Decimal("17900.00"),
            tds_amount=Decimal("945.00"),
            net_amount=Decimal("16955.00"),
            payment_date=today - timedelta(days=2),
            utr_reference="ICICR52026092900712948",
            match_status="matched",
            case_id=exp_102.case_id,
            lender_application_id=exp_102.lender_application_id,
            notes="TDS discrepancy noted. Lender deducted additional administrative deduction of INR 1000.",
            version=1,
        )
        session.add(rcpt_102)

        session.add(
            Reconciliation(
                id=uuid.uuid4(),
                org_id=ORG_A_ID,
                expectation_id=exp_102.id,
                receipt_id=rcpt_102.id,
                expected_amount=exp_102.net_amount,
                received_amount=rcpt_102.net_amount,
                variance_amount=Decimal("-1000.00"),
                status="short",  # Short payment variance!
                tolerance_used=Decimal("10.00"),
                is_manual=False,
                reconciled_by=manager_user.id,
                reconciled_at=now_utc - timedelta(days=2),
                notes="Short payment under review with ICICI channel manager.",
                version=1,
            )
        )

        # ---------------------------------------------------------------------
        # 12. Active Operational Follow-up Tasks (Today View)
        # ---------------------------------------------------------------------
        logger.info("Scheduling team follow-up tasks and SLA alerts...")
        tasks_def = [
            (
                "Collect updated 6-month bank statement from Sneha Kulkarni",
                "Case APX-2026-0103 — Salary increment letter and latest 6-month statement required by Kotak credit cell.",
                case_dict["APX-2026-0103"].id,
                processor_user.id,
                now_utc + timedelta(hours=4),
                "pending",
                "document_pickup",
            ),
            (
                "Resolve branch query on engine number punching for Case APX-2026-0104",
                "Tata Capital technical valuer raised chassis pencil print query.",
                case_dict["APX-2026-0104"].id,
                fe_user.id,
                now_utc - timedelta(hours=6),  # Overdue task!
                "pending",
                "query_resolution",
            ),
            (
                "Follow up with HDFC branch manager for Case APX-2026-0107 sanction letter",
                "High ticket Innova Hycross hybrid loan awaiting final credit committee signoff.",
                case_dict["APX-2026-0107"].id,
                manager_user.id,
                now_utc + timedelta(hours=6),
                "pending",
                "bank_followup",
            ),
            (
                "Submit original Form 34 to ICICI Vashi operations hub",
                "Form 34 RTO notice signed by customer; dispatch required to avoid PDD penalty.",
                case_dict["APX-2026-0102"].id,
                fe_user.id,
                now_utc + timedelta(hours=28),
                "pending",
                "document_pickup",
            ),
            (
                "Clarify INR 1,000 commission variance with ICICI accounts cell",
                "Reconciliation short payment of INR 1000 on Case APX-2026-0102.",
                case_dict["APX-2026-0102"].id,
                owner_user.id,
                now_utc + timedelta(hours=48),
                "pending",
                "call",
            ),
            (
                "Welcome call and delivery satisfaction check for Brezza disbursal",
                "Confirm dealer delivery receipt and customer handoff.",
                case_dict["APX-2026-0102"].id,
                processor_user.id,
                now_utc - timedelta(days=2),
                "completed",
                "call",
            ),
        ]

        for t_title, t_desc, cid, uid, due_at, t_st, t_type in tasks_def:
            session.add(
                Task(
                    id=uuid.uuid4(),
                    org_id=ORG_A_ID,
                    case_id=cid,
                    title=t_title,
                    description=t_desc,
                    owner_id=uid,
                    due_date=due_at,
                    status=t_st,
                    type=t_type,
                    completed_at=now_utc - timedelta(days=1) if t_st == "completed" else None,
                    version=1,
                )
            )

        # ---------------------------------------------------------------------
        # 13. Case Documents with Deterministic OCR Scans & Statuses
        # ---------------------------------------------------------------------
        logger.info("Attaching realistic Case Documents with OCR extraction results...")
        doc_type_stmt = select(DocumentType)
        doc_types_res = await session.execute(doc_type_stmt)
        dt_by_code = {dt.code: dt for dt in doc_types_res.scalars().all()}

        # 1. APX-2026-0101: Complete & Verified (PAN, Aadhaar, Bank Statement, Salary Slip, RC Copy)
        c1 = case_dict["APX-2026-0101"]
        c1_party_id = (await session.execute(select(CaseParty.party_id).where(CaseParty.case_id == c1.id))).scalars().first()
        c1_veh_id = (await session.execute(select(Vehicle.id).where(Vehicle.case_id == c1.id))).scalars().first()

        c1_docs = [
            ("pan_card", "rahul_deshmukh_pan.pdf", 48200, "verified", {
                "document_type": "PAN",
                "overall_confidence": 0.98,
                "fields": [
                    {"name": "customer_name", "value": "Rahul Deshmukh", "confidence": 0.99, "status": "verified"},
                    {"name": "pan_number", "value": "AAAPM1001A", "confidence": 0.98, "status": "verified"},
                    {"name": "dob", "value": "1988-04-12", "confidence": 0.97, "status": "verified"}
                ]
            }),
            ("aadhaar_card", "rahul_deshmukh_aadhaar.pdf", 62100, "verified", {
                "document_type": "Aadhaar",
                "overall_confidence": 0.96,
                "fields": [
                    {"name": "customer_name", "value": "Rahul Deshmukh", "confidence": 0.98, "status": "verified"},
                    {"name": "aadhaar_number", "value": "XXXX-XXXX-1001", "confidence": 0.95, "status": "verified"},
                    {"name": "address", "value": "B-402, Seawoods Estate, Navi Mumbai 400706", "confidence": 0.94, "status": "verified"}
                ]
            }),
            ("salary_slip", "rahul_tcs_salary_slip.pdf", 95400, "verified", {
                "document_type": "Salary Slip",
                "overall_confidence": 0.94,
                "fields": [
                    {"name": "employer_name", "value": "Tata Consultancy Services Ltd", "confidence": 0.96, "status": "verified"},
                    {"name": "gross_salary", "value": "115000", "confidence": 0.94, "status": "verified"},
                    {"name": "net_salary", "value": "98000", "confidence": 0.95, "status": "verified"}
                ]
            }),
            ("bank_statement", "rahul_hdfc_statement_6m.pdf", 312000, "verified", {
                "document_type": "Bank Statement",
                "overall_confidence": 0.93,
                "fields": [
                    {"name": "bank_name", "value": "HDFC Bank Ltd", "confidence": 0.97, "status": "verified"},
                    {"name": "account_number", "value": "XXXX1001", "confidence": 0.92, "status": "verified"},
                    {"name": "avg_monthly_balance", "value": "142000", "confidence": 0.91, "status": "verified"}
                ]
            }),
            ("rc_copy", "creta_rc_smartcard.pdf", 84000, "verified", {
                "document_type": "RC Copy",
                "overall_confidence": 0.97,
                "fields": [
                    {"name": "registration_number", "value": "MH-01-AX-1001", "confidence": 0.98, "status": "verified"},
                    {"name": "vehicle_make", "value": "Hyundai", "confidence": 0.99, "status": "verified"},
                    {"name": "vehicle_model", "value": "Creta SX", "confidence": 0.96, "status": "verified"}
                ]
            })
        ]

        for dt_code, f_name, f_sz, f_st, scan_res in c1_docs:
            if dt_code in dt_by_code:
                session.add(
                    Document(
                        id=uuid.uuid4(),
                        org_id=ORG_A_ID,
                        case_id=c1.id,
                        party_id=c1_party_id,
                        vehicle_id=c1_veh_id if dt_code == "rc_copy" else None,
                        document_type_id=dt_by_code[dt_code].id,
                        file_name=f_name,
                        file_key=f"documents/{ORG_A_ID}/{c1.id}/{f_name}",
                        file_size=f_sz,
                        mime_type="application/pdf",
                        status=f_st,
                        scan_result=scan_res,
                        uploaded_by=processor_user.id,
                        uploaded_at=now_utc - timedelta(days=26),
                        verified_by=owner_user.id,
                        verified_at=now_utc - timedelta(days=25),
                        version=1
                    )
                )

        # 2. APX-2026-0102: Under Review / Pending Human Verification
        c2 = case_dict["APX-2026-0102"]
        c2_party_id = (await session.execute(select(CaseParty.party_id).where(CaseParty.case_id == c2.id))).scalars().first()

        c2_docs = [
            ("pan_card", "ananya_sharma_pan.pdf", 51200, "under_review", {
                "document_type": "PAN",
                "overall_confidence": 0.91,
                "fields": [
                    {"name": "customer_name", "value": "Ananya Sharma", "confidence": 0.92, "status": "needs_review"},
                    {"name": "pan_number", "value": "AAAPM1002A", "confidence": 0.91, "status": "needs_review"},
                    {"name": "dob", "value": "1992-08-19", "confidence": 0.89, "status": "needs_review"}
                ]
            }),
            ("bank_statement", "ananya_icici_statement.pdf", 280000, "under_review", {
                "document_type": "Bank Statement",
                "overall_confidence": 0.88,
                "fields": [
                    {"name": "bank_name", "value": "ICICI Bank Ltd", "confidence": 0.94, "status": "needs_review"},
                    {"name": "account_number", "value": "XXXX1002", "confidence": 0.86, "status": "needs_review"},
                    {"name": "avg_monthly_balance", "value": "89000", "confidence": 0.84, "status": "needs_review"}
                ]
            })
        ]

        for dt_code, f_name, f_sz, f_st, scan_res in c2_docs:
            if dt_code in dt_by_code:
                session.add(
                    Document(
                        id=uuid.uuid4(),
                        org_id=ORG_A_ID,
                        case_id=c2.id,
                        party_id=c2_party_id,
                        document_type_id=dt_by_code[dt_code].id,
                        file_name=f_name,
                        file_key=f"documents/{ORG_A_ID}/{c2.id}/{f_name}",
                        file_size=f_sz,
                        mime_type="application/pdf",
                        status=f_st,
                        scan_result=scan_res,
                        uploaded_by=processor_user.id,
                        uploaded_at=now_utc - timedelta(days=2),
                        version=1
                    )
                )

        # 3. APX-2026-0103: One Rejected Document (Income blurred) & One Verified
        c3 = case_dict["APX-2026-0103"]
        c3_party_id = (await session.execute(select(CaseParty.party_id).where(CaseParty.case_id == c3.id))).scalars().first()
        if "pan_card" in dt_by_code:
            session.add(
                Document(
                    id=uuid.uuid4(),
                    org_id=ORG_A_ID,
                    case_id=c3.id,
                    party_id=c3_party_id,
                    document_type_id=dt_by_code["pan_card"].id,
                    file_name="amit_verma_pan.pdf",
                    file_key=f"documents/{ORG_A_ID}/{c3.id}/amit_verma_pan.pdf",
                    file_size=49000,
                    mime_type="application/pdf",
                    status="verified",
                    scan_result={"document_type": "PAN", "overall_confidence": 0.97, "fields": [{"name": "customer_name", "value": "Amit Verma", "confidence": 0.98, "status": "verified"}, {"name": "pan_number", "value": "AAAPM1003A", "confidence": 0.97, "status": "verified"}]},
                    uploaded_by=processor_user.id,
                    uploaded_at=now_utc - timedelta(days=14),
                    verified_by=owner_user.id,
                    verified_at=now_utc - timedelta(days=13),
                    version=1
                )
            )
        if "salary_slip" in dt_by_code:
            session.add(
                Document(
                    id=uuid.uuid4(),
                    org_id=ORG_A_ID,
                    case_id=c3.id,
                    party_id=c3_party_id,
                    document_type_id=dt_by_code["salary_slip"].id,
                    file_name="amit_verma_salary_slip_blurry.pdf",
                    file_key=f"documents/{ORG_A_ID}/{c3.id}/amit_verma_salary_slip_blurry.pdf",
                    file_size=38000,
                    mime_type="application/pdf",
                    status="rejected",
                    reject_reason="Income figure blurred and unreadable; please upload computer-generated statement with employer seal.",
                    uploaded_by=processor_user.id,
                    uploaded_at=now_utc - timedelta(days=14),
                    version=1
                )
            )

        await session.commit()
        logger.info("Apex Capital Advisors successfully seeded with 16 realistic vehicle-loan cases and documents!")

    await get_engine().dispose()


if __name__ == "__main__":
    asyncio.run(seed())
