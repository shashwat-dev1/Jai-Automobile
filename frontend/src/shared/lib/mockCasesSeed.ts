/**
 * Jai Automobiles — Production Prototype Synthetic Cases Seed
 * Provides 38 realistic cases spanning 3 distinct date tiers to validate:
 * - All Time (38 cases)
 * - Last 90 Days (34 cases, excludes >90d records)
 * - Last 30 Days (26 cases, excludes >30d records)
 */

import type { MockCase } from './mockDatabase'

export function createMockCases(): MockCase[] {
  const now = Date.now()
  const day = 86400000

  // 38 Realistic Synthetic Cases spanning recent (<30d), mid (30-90d), and historical (>90d)
  const caseSpecs = [
    // --- Recent (< 30 days) — 26 cases ---
    { no: 'JA-2025-0101', name: 'Rajesh Kumar Sharma', phone: '9820198201', veh: 'Hyundai Creta 2021 SX (O)', amt: 850000, tele: 'usr-telecaller-1', teleName: 'Priya Sharma', outcome: 'interested', status: 'disbursed', daysAgo: 1 },
    { no: 'JA-2025-0102', name: 'Amitabh Singh Chauhan', phone: '9833441122', veh: 'Mahindra XUV700 AX7', amt: 1450000, tele: 'usr-telecaller-2', teleName: 'Rahul Verma', outcome: 'interested', status: 'disbursed', daysAgo: 2 },
    { no: 'JA-2025-0103', name: 'Sunil Manohar Gavaskar', phone: '9769012345', veh: 'Maruti Suzuki Brezza ZXi', amt: 620000, tele: 'usr-telecaller-1', teleName: 'Priya Sharma', outcome: 'interested', status: 'in_calling', daysAgo: 3 },
    { no: 'JA-2025-0104', name: 'Deepak Mohanlal Mehta', phone: '9821054321', veh: 'Tata Ace Gold EV', amt: 1200000, tele: 'usr-telecaller-2', teleName: 'Rahul Verma', outcome: 'interested', status: 'in_calling', daysAgo: 4 },
    { no: 'JA-2025-0105', name: 'Sneha Aniruddha Roy', phone: '9820499112', veh: 'Tata Safari Dark Edition', amt: 1800000, tele: 'usr-telecaller-1', teleName: 'Priya Sharma', outcome: 'interested', status: 'in_calling', daysAgo: 5 },
    { no: 'JA-2025-0106', name: 'Virender Singh Rathore', phone: '9845112233', veh: 'Honda City ZX 2019', amt: 550000, tele: 'usr-telecaller-2', teleName: 'Rahul Verma', outcome: 'interested', status: 'in_calling', daysAgo: 6 },
    { no: 'JA-2025-0107', name: 'Arjun Deshmukh', phone: '9833112244', veh: 'Kia Seltos GTX Plus', amt: 1350000, tele: 'usr-telecaller-1', teleName: 'Priya Sharma', outcome: 'interested', status: 'in_calling', daysAgo: 7 },
    { no: 'JA-2025-0108', name: 'Karan Mehra', phone: '9819922334', veh: 'Hyundai Creta SX (O)', amt: 1100000, tele: 'usr-telecaller-1', teleName: 'Priya Sharma', outcome: 'follow_up', status: 'callback_scheduled', daysAgo: 8 },
    { no: 'JA-2025-0109', name: 'Pooja Hegde', phone: '9821098765', veh: 'Tata Nexon Fearless+', amt: 900000, tele: 'usr-telecaller-1', teleName: 'Priya Sharma', outcome: 'interested', status: 'in_calling', daysAgo: 9 },
    { no: 'JA-2025-0110', name: 'Vikram Joshi', phone: '9876543210', veh: 'Mahindra Scorpio-N Z8', amt: 1600000, tele: 'usr-telecaller-2', teleName: 'Rahul Verma', outcome: 'follow_up', status: 'callback_scheduled', daysAgo: 10 },
    { no: 'JA-2025-0111', name: 'Ananya Deshmukh', phone: '9833221100', veh: 'Maruti Grand Vitara Alpha', amt: 1250000, tele: 'usr-telecaller-1', teleName: 'Priya Sharma', outcome: 'follow_up', status: 'callback_scheduled', daysAgo: 11 },
    { no: 'JA-2025-0112', name: 'Rohit Shetty', phone: '9820112233', veh: 'Mahindra Thar 4x4 Hardtop', amt: 1500000, tele: 'usr-telecaller-2', teleName: 'Rahul Verma', outcome: 'follow_up', status: 'callback_scheduled', daysAgo: 12 },
    { no: 'JA-2025-0113', name: 'Meena Sundaram', phone: '9821199887', veh: 'Hyundai i20 Asta (O)', amt: 950000, tele: 'usr-telecaller-1', teleName: 'Priya Sharma', outcome: 'follow_up', status: 'callback_scheduled', daysAgo: 15 },
    { no: 'JA-2025-0114', name: 'Ravi Teja', phone: '9844055667', veh: 'Tata Ace Gold Petrol', amt: 750000, tele: 'usr-telecaller-2', teleName: 'Rahul Verma', outcome: 'follow_up', status: 'callback_scheduled', daysAgo: 15 },
    { no: 'JA-2025-0115', name: 'Manoj Bajpayee', phone: '9819001122', veh: 'Toyota Innova Hycross', amt: 2800000, tele: 'usr-telecaller-1', teleName: 'Priya Sharma', outcome: 'in_calling', status: 'in_calling', daysAgo: 16 },
    { no: 'JA-2025-0116', name: 'Pankaj Tripathi', phone: '9820554433', veh: 'Mahindra Bolero Camper', amt: 880000, tele: 'usr-telecaller-2', teleName: 'Rahul Verma', outcome: 'in_calling', status: 'in_calling', daysAgo: 18 },
    { no: 'JA-2025-0117', name: 'Deepak Jadhav', phone: '9899011234', veh: 'Maruti WagonR VXi', amt: 450000, tele: undefined, teleName: undefined, outcome: 'new', status: 'lead', daysAgo: 20 },
    { no: 'JA-2025-0118', name: 'Alok Nath', phone: '9811223344', veh: 'Mahindra Bolero Maxi Truck', amt: 700000, tele: undefined, teleName: undefined, outcome: 'new', status: 'lead', daysAgo: 22 },
    { no: 'JA-2025-0119', name: 'Sunita Rao', phone: '9833009988', veh: 'Maruti Swift Dzire ZXi', amt: 680000, tele: undefined, teleName: undefined, outcome: 'new', status: 'lead', daysAgo: 24 },
    { no: 'JA-2025-0120', name: 'Mahesh Bhatt', phone: '9820776655', veh: 'Kia Carens Prestige Plus', amt: 1400000, tele: undefined, teleName: undefined, outcome: 'interested', status: 'disbursed', daysAgo: 25 },
    { no: 'JA-2025-0121', name: 'Shilpa Shetty', phone: '9819887766', veh: 'Toyota Fortuner Legender', amt: 3800000, tele: undefined, teleName: undefined, outcome: 'interested', status: 'disbursed', daysAgo: 26 },
    { no: 'JA-2025-0122', name: 'Ajay Devgn', phone: '9820665544', veh: 'Tata Harrier Fearless', amt: 1900000, tele: undefined, teleName: undefined, outcome: 'connected', status: 'disbursed', daysAgo: 27 },
    { no: 'JA-2025-0123', name: 'Suniel Shetty', phone: '9820443322', veh: 'Honda Elevate ZX', amt: 1200000, tele: undefined, teleName: undefined, outcome: 'connected', status: 'disbursed', daysAgo: 28 },
    { no: 'JA-2025-0124', name: 'Anil Kapoor', phone: '9819332211', veh: 'Mahindra Scorpio Classic S11', amt: 1300000, tele: undefined, teleName: undefined, outcome: 'connected', status: 'disbursed', daysAgo: 28 },
    { no: 'JA-2025-0125', name: 'Jackie Shroff', phone: '9820221100', veh: 'Maruti Fronx Alpha Turbo', amt: 820000, tele: undefined, teleName: undefined, outcome: 'connected', status: 'disbursed', daysAgo: 29 },
    { no: 'JA-2025-0126', name: 'Govinda Ahuja', phone: '9819110099', veh: 'Hyundai Venue SX (O)', amt: 980000, tele: undefined, teleName: undefined, outcome: 'connected', status: 'disbursed', daysAgo: 29 },

    // --- Mid Range (30 - 90 days) — 8 cases ---
    { no: 'JA-2025-0127', name: 'Farhan Akhtar', phone: '9820998877', veh: 'BMW X1 sDrive20d', amt: 3200000, tele: 'usr-telecaller-1', teleName: 'Priya Sharma', outcome: 'interested', status: 'in_calling', daysAgo: 40 },
    { no: 'JA-2025-0128', name: 'Shahid Kapoor', phone: '9819887766', veh: 'Range Rover Velar (Used)', amt: 6500000, tele: 'usr-telecaller-2', teleName: 'Rahul Verma', outcome: 'interested', status: 'in_calling', daysAgo: 45 },
    { no: 'JA-2025-0129', name: 'Saif Ali Khan', phone: '9820776655', veh: 'Audi Q5 Technology', amt: 4500000, tele: undefined, teleName: undefined, outcome: 'connected', status: 'closed', daysAgo: 50 },
    { no: 'JA-2025-0130', name: 'Ranveer Singh', phone: '9819665544', veh: 'Mercedes-Benz C200', amt: 4800000, tele: undefined, teleName: undefined, outcome: 'connected', status: 'closed', daysAgo: 55 },
    { no: 'JA-2025-0131', name: 'Varun Dhawan', phone: '9820554433', veh: 'Volkswagen Polo GT TSI', amt: 650000, tele: undefined, teleName: undefined, outcome: 'new', status: 'lead', daysAgo: 60 },
    { no: 'JA-2025-0132', name: 'Sidharth Malhotra', phone: '9819443322', veh: 'Skoda Slavia Style', amt: 1100000, tele: undefined, teleName: undefined, outcome: 'connected', status: 'disbursed', daysAgo: 65 },
    { no: 'JA-2025-0133', name: 'Kartik Aaryan', phone: '9820332211', veh: 'Lamborghini Urus (Pre-owned)', amt: 22000000, tele: undefined, teleName: undefined, outcome: 'follow_up', status: 'callback_scheduled', daysAgo: 75 },
    { no: 'JA-2025-0134', name: 'Ayushmann Khurrana', phone: '9819221100', veh: 'MG Hector Sharp Pro', amt: 1700000, tele: undefined, teleName: undefined, outcome: 'interested', status: 'lead', daysAgo: 80 },

    // --- Historical (> 90 days) — 4 cases ---
    { no: 'JA-2025-0135', name: 'Rajkummar Rao', phone: '9820110099', veh: 'Kia Sonet GTX Plus', amt: 850000, tele: undefined, teleName: undefined, outcome: 'new', status: 'lead', daysAgo: 100 },
    { no: 'JA-2025-0136', name: 'Vicky Kaushal', phone: '9819009988', veh: 'Jeep Compass Limited', amt: 2100000, tele: undefined, teleName: undefined, outcome: 'connected', status: 'closed', daysAgo: 110 },
    { no: 'JA-2025-0137', name: 'Diljit Dosanjh', phone: '9820887766', veh: 'Mercedes G63 AMG (Used)', amt: 18000000, tele: undefined, teleName: undefined, outcome: 'follow_up', status: 'callback_scheduled', daysAgo: 115 },
    { no: 'JA-2025-0138', name: 'John Abraham', phone: '9819776655', veh: 'Nissan GT-R Track Edition', amt: 9500000, tele: undefined, teleName: undefined, outcome: 'interested', status: 'lead', daysAgo: 120 },
  ]

  return caseSpecs.map((spec, idx) => {
    const createdAt = new Date(now - spec.daysAgo * day).toISOString()
    const updatedAt = new Date(now - Math.max(0, spec.daysAgo - 1) * day).toISOString()
    return {
      id: `case-jai-${101 + idx}`,
      case_no: spec.no,
      applicant_name: spec.name,
      primary_applicant_name: spec.name,
      mobile: spec.phone,
      primary_applicant_mobile: spec.phone,
      product: 'used_car',
      product_type: 'used_car',
      status: spec.status,
      applied_loan_amount: spec.amt,
      loan_amount_requested: spec.amt,
      sanctioned_loan_amount: spec.status === 'disbursed' ? spec.amt : undefined,
      loan_amount_sanctioned: spec.status === 'disbursed' ? spec.amt : undefined,
      disbursed_loan_amount: spec.status === 'disbursed' ? spec.amt : undefined,
      loan_amount_disbursed: spec.status === 'disbursed' ? spec.amt : undefined,
      lender_name: 'HDFC Bank',
      vehicle_details: spec.veh,
      vehicle_summary: spec.veh,
      source_name: idx % 2 === 0 ? 'Maruti True Value - Andheri West' : 'Public Referral Partner Portal',
      owner_name: 'Aarav Sharma',
      assigned_telecaller_id: spec.tele,
      assigned_telecaller_name: spec.teleName,
      call_outcome: spec.outcome,
      telecaller_remarks: `Operational outreach status: ${spec.outcome}`,
      call_attempts_count: spec.tele ? 1 : 0,
      has_consent: true,
      age_in_days: spec.daysAgo,
      version: 1,
      created_at: createdAt,
      updated_at: updatedAt,
      primary_party: {
        id: `party-${101 + idx}`,
        name: spec.name,
        mobile_primary: spec.phone,
        city: 'Mumbai',
      },
    }
  })
}
