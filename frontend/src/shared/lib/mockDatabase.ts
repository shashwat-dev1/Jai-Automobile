/**
 * Jai Automobiles — Production Prototype Client Database
 * Provides persistent, realistic operational records so the prototype never fails with HTTP 500.
 */

export interface MockCase {
  id: string
  case_no: string
  applicant_name: string
  mobile: string
  product: string
  status: string
  applied_loan_amount: number
  sanctioned_loan_amount?: number
  disbursed_loan_amount?: number
  lender_name?: string
  vehicle_details?: string
  created_at: string
}

export const JAI_MOCK_CASES: MockCase[] = [
  {
    id: 'case-jai-101',
    case_no: 'JA-2025-0101',
    applicant_name: 'Rajesh Kumar Sharma',
    mobile: '9820198201',
    product: 'used_car',
    status: 'disbursed',
    applied_loan_amount: 850000,
    sanctioned_loan_amount: 800000,
    disbursed_loan_amount: 800000,
    lender_name: 'HDFC Bank',
    vehicle_details: 'Hyundai Creta 2021 SX (O)',
    created_at: '2025-02-14T10:30:00Z',
  },
  {
    id: 'case-jai-102',
    case_no: 'JA-2025-0102',
    applicant_name: 'Amitabh Singh Chauhan',
    mobile: '9833441122',
    product: 'new_car',
    status: 'sanctioned',
    applied_loan_amount: 1450000,
    sanctioned_loan_amount: 1400000,
    lender_name: 'ICICI Bank',
    vehicle_details: 'Mahindra XUV700 AX7',
    created_at: '2025-02-18T14:15:00Z',
  },
  {
    id: 'case-jai-103',
    case_no: 'JA-2025-0103',
    applicant_name: 'Sunil Manohar Gavaskar',
    mobile: '9769012345',
    product: 'used_car',
    status: 'under_lender_review',
    applied_loan_amount: 620000,
    lender_name: 'Kotak Mahindra Bank',
    vehicle_details: 'Maruti Suzuki Brezza ZXi 2022',
    created_at: '2025-02-22T09:45:00Z',
  },
  {
    id: 'case-jai-104',
    case_no: 'JA-2025-0104',
    applicant_name: 'Deepak Mohanlal Mehta',
    mobile: '9821054321',
    product: 'commercial_vehicle',
    status: 'docs_collected',
    applied_loan_amount: 1200000,
    lender_name: 'Tata Capital',
    vehicle_details: 'Tata Ace Gold EV',
    created_at: '2025-02-25T11:20:00Z',
  },
  {
    id: 'case-jai-105',
    case_no: 'JA-2025-0105',
    applicant_name: 'Pooja Anand Deshmukh',
    mobile: '9819283746',
    product: 'new_car',
    status: 'lead',
    applied_loan_amount: 980000,
    vehicle_details: 'Tata Nexon Fearless+',
    created_at: '2025-02-28T16:00:00Z',
  },
  {
    id: 'case-jai-106',
    case_no: 'JA-2025-0106',
    applicant_name: 'Virender Singh Rathore',
    mobile: '9845112233',
    product: 'loan_against_car',
    status: 'disbursed',
    applied_loan_amount: 550000,
    sanctioned_loan_amount: 500000,
    disbursed_loan_amount: 500000,
    lender_name: 'Cholamandalam Finance',
    vehicle_details: 'Honda City ZX 2019 Refinance',
    created_at: '2025-02-10T12:00:00Z',
  },
]

export const JAI_MOCK_DASHBOARD = {
  pipeline_summary: {
    active_files_count: 24,
    new_inflow_count: 7,
    total_loan_amount_requested: 38500000,
    disbursed_volume: 18400000,
    disbursed_count: 14,
  },
  payout_summary: {
    total_expected_net: 384000,
    total_received_net: 312000,
    outstanding_net: 72000,
    realisation_rate_pct: 81.25,
    variance_net: '0',
  },
  funnel_stages: [
    { stage: 'lead_intake', count: 7, label: 'Lead Intake', volume: 6800000 },
    { stage: 'docs_collection', count: 5, label: 'Docs Collection', volume: 5200000 },
    { stage: 'login_bank', count: 4, label: 'Bank Login', volume: 4900000 },
    { stage: 'sanctioned', count: 3, label: 'Sanctioned', volume: 3800000 },
    { stage: 'disbursed', count: 14, label: 'Disbursed', volume: 18400000 },
    { stage: 'pdd_pending', count: 5, label: 'PDD Gating', volume: 6200000 },
    { stage: 'payout_settled', count: 12, label: 'Payout Settled', volume: 15600000 },
  ],
  attention_items: [
    {
      id: 'att-1',
      title: 'PDD Hypothecation Pending > 15 days',
      case_no: 'JA-2025-0101',
      customer_name: 'Rajesh Kumar Sharma',
      urgency: 'high',
      amount: '₹18,500 Hold',
    },
    {
      id: 'att-2',
      title: 'Bank Sanction Terms Expiring in 48h',
      case_no: 'JA-2025-0102',
      customer_name: 'Amitabh Singh Chauhan',
      urgency: 'medium',
      amount: '₹14.0L Sanction',
    },
    {
      id: 'att-3',
      title: 'RC Endorsement Form 34 Required',
      case_no: 'JA-2025-0106',
      customer_name: 'Virender Singh Rathore',
      urgency: 'high',
      amount: '₹12,000 Hold',
    },
  ],
  monthly_commissions: [
    { month: 'Oct 2024', expected_amount: '280000', settled_amount: '280000', case_count: 8 },
    { month: 'Nov 2024', expected_amount: '340000', settled_amount: '325000', case_count: 11 },
    { month: 'Dec 2024', expected_amount: '410000', settled_amount: '395000', case_count: 14 },
    { month: 'Jan 2025', expected_amount: '460000', settled_amount: '430000', case_count: 16 },
    { month: 'Feb 2025', expected_amount: '384000', settled_amount: '312000', case_count: 14 },
  ],
  monthly_commission: [
    { month: 'Oct 2024', expected_amount: '280000', settled_amount: '280000', case_count: 8 },
    { month: 'Nov 2024', expected_amount: '340000', settled_amount: '325000', case_count: 11 },
    { month: 'Dec 2024', expected_amount: '410000', settled_amount: '395000', case_count: 14 },
    { month: 'Jan 2025', expected_amount: '460000', settled_amount: '430000', case_count: 16 },
    { month: 'Feb 2025', expected_amount: '384000', settled_amount: '312000', case_count: 14 },
  ],
  top_sources: [
    { source_name: 'Maruti True Value - Andheri West', files_count: 8, volume: '₹72.5L', payout: '₹1.45L' },
    { source_name: 'Hyundai H-Promise - Thane', files_count: 6, volume: '₹58.0L', payout: '₹1.16L' },
    { source_name: 'Autocars Mumbai Dealership', files_count: 5, volume: '₹44.0L', payout: '₹88,000' },
    { source_name: 'Direct Showroom Walk-in', files_count: 5, volume: '₹41.5L', payout: '₹83,000' },
  ],
}

export const JAI_MOCK_PDD = {
  summary: {
    total_pending: 8,
    bucket_0_7_count: 3,
    bucket_8_15_count: 2,
    bucket_16_30_count: 2,
    bucket_30_plus_count: 1,
    clawback_risk_amount: 18500,
  },
  items: [
    {
      id: 'pdd-1',
      case_id: 'case-jai-101',
      case_no: 'JA-2025-0101',
      customer_name: 'Rajesh Kumar Sharma',
      lender_name: 'HDFC Bank',
      doc_type_code: 'rc_hypo_copy',
      title: 'Original RC with HDFC Bank Hypothecation',
      due_date: '2025-03-01',
      days_overdue: 9,
      is_overdue: true,
      priority: 'high',
      status: 'pending',
      owner_name: 'Rohan Verma',
    },
    {
      id: 'pdd-2',
      case_id: 'case-jai-106',
      case_no: 'JA-2025-0106',
      customer_name: 'Virender Singh Rathore',
      lender_name: 'Cholamandalam',
      doc_type_code: 'form_34',
      title: 'Form 34 Duly Signed RTO Copy',
      due_date: '2025-03-05',
      days_overdue: 5,
      is_overdue: true,
      priority: 'critical',
      status: 'collected',
      owner_name: 'Rohan Verma',
    },
  ],
}

export const JAI_MOCK_EXPECTATIONS = [
  {
    id: 'exp-1',
    case_id: 'case-jai-101',
    case_no: 'JA-2025-0101',
    applicant_name: 'Rajesh Kumar Sharma',
    lender_name: 'HDFC Bank',
    product: 'used_car',
    disbursed_amount: '800000.00',
    gross_amount: '16000.00',
    tds_amount: '800.00',
    net_amount: '15200.00',
    status: 'held',
    pdd_status: 'pending',
    created_at: '2025-02-14',
  },
  {
    id: 'exp-2',
    case_id: 'case-jai-106',
    case_no: 'JA-2025-0106',
    applicant_name: 'Virender Singh Rathore',
    lender_name: 'Cholamandalam',
    product: 'loan_against_car',
    disbursed_amount: '500000.00',
    gross_amount: '12500.00',
    tds_amount: '625.00',
    net_amount: '11875.00',
    status: 'due',
    pdd_status: 'collected',
    created_at: '2025-02-10',
  },
]
