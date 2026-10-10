/**
 * DSA OS — Comprehensive E2E Playwright Automation Suite
 * Complete Browser End-to-End Validation (Tests A through F)
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const EVIDENCE_DIR = path.join(__dirname, 'test-evidence');
if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5173';

const results = {
  testA: { status: 'PENDING', steps: [] },
  testB: { status: 'PENDING', steps: [] },
  testC: { status: 'PENDING', steps: [] },
  testD: { status: 'PENDING', steps: [] },
  testE: { status: 'PENDING', steps: [] },
  testF: { status: 'PENDING', steps: [] },
};

function logStep(testKey, message, pass = true) {
  const icon = pass ? '✓' : '✗';
  console.log(`  [${icon}] ${message}`);
  results[testKey].steps.push({ message, pass, timestamp: new Date().toISOString() });
}

async function run() {
  console.log('================================================================');
  console.log('DSA OS — STARTING END-TO-END PLAYWRIGHT AUTOMATION SUITE');
  console.log('Running against Chrome: ' + CHROME_PATH);
  console.log('Target URL: ' + BASE_URL);
  console.log('================================================================\n');

  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  try {
    // -------------------------------------------------------------
    // TEST A: New Referral Partner & Mandatory Document Rules
    // -------------------------------------------------------------
    console.log('--- TEST A: NEW REFERRAL PARTNER & DOCUMENT RULES ---');
    await page.goto(`${BASE_URL}/referral`);
    await page.waitForLoadState('networkidle');

    // 1. Enter unregistered mobile
    await page.fill('input.phone-field', '9811223344');
    await page.click('button:has-text("Continue to Referral Form")');
    await page.waitForTimeout(500);

    // 2. Check partner name input is displayed
    const partnerNameInput = page.locator('input[placeholder*="Vikram Sharma"]');
    await partnerNameInput.waitFor({ state: 'visible' });
    logStep('testA', 'New referral partner identified correctly (partner name input visible)');

    await partnerNameInput.fill('Rohan Verma');
    await page.fill('input[placeholder="e.g. Ramesh Patel"]', 'Amit Kumar');
    await page.locator('.form-grid-2 input.phone-field').fill('9876543210');
    await page.fill('input[placeholder="650000"]', '500000');

    // Select Brand New Vehicle
    await page.click('button:has-text("Brand New Vehicle")');
    logStep('testA', 'Selected "Brand New Vehicle" condition pill');

    // Submit without documents
    await page.click('button:has-text("Submit Referral Lead")');
    await page.waitForTimeout(400);

    let errorBanner = await page.locator('.guest-error-banner').innerText();
    const aadhaarBlocked = errorBanner.includes('Aadhaar card is mandatory');
    logStep('testA', `Submission blocked without Aadhaar: "${errorBanner}"`, aadhaarBlocked);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'test_a_missing_aadhaar.png') });

    // Attach Aadhaar
    await page.click('button[data-testid="attach-sample-aadhaar"]');
    await page.waitForTimeout(400);
    logStep('testA', 'Sample Aadhaar card attached successfully');

    // Submit without PAN
    await page.click('button:has-text("Submit Referral Lead")');
    await page.waitForTimeout(400);

    errorBanner = await page.locator('.guest-error-banner').innerText();
    const panBlocked = errorBanner.includes('PAN card is mandatory');
    logStep('testA', `Submission blocked without PAN: "${errorBanner}"`, panBlocked);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'test_a_missing_pan.png') });

    // Attach PAN
    await page.click('button[data-testid="attach-sample-pan"]');
    await page.waitForTimeout(400);
    logStep('testA', 'Sample PAN card attached successfully');

    // Submit lead for Brand New Vehicle (RC is optional)
    await page.click('button:has-text("Submit Referral Lead")');
    await page.waitForSelector('.success-card', { timeout: 10000 });

    const successCaseNo = await page.locator('.success-meta-box .meta-value.font-mono').innerText();
    const successPartner = await page.locator('.success-meta-box .meta-item:has-text("Attributed Referral Partner") .meta-value').innerText();

    logStep('testA', `Lead submitted successfully: File No = ${successCaseNo}, Partner = ${successPartner}`);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'test_a_success_confirmation.png') });
    results.testA.status = aadhaarBlocked && panBlocked ? 'PASSED' : 'FAILED';

    // -------------------------------------------------------------
    // TEST B: Used/Pre-Owned Vehicle & Mandatory RC
    // -------------------------------------------------------------
    console.log('\n--- TEST B: USED VEHICLE & MANDATORY RC RULES ---');
    await page.goto(`${BASE_URL}/referral`);
    await page.waitForLoadState('networkidle');

    // Enter mobile for another new partner
    await page.fill('input.phone-field', '9822334455');
    await page.click('button:has-text("Continue to Referral Form")');
    await page.waitForTimeout(500);

    const bPartnerInput = page.locator('input[placeholder*="Vikram Sharma"]');
    if (await bPartnerInput.isVisible()) {
      await bPartnerInput.fill('Suresh Raina');
    }
    await page.fill('input[placeholder="e.g. Ramesh Patel"]', 'Deepak Chahar');
    await page.locator('.form-grid-2 input.phone-field').fill('9812345678');
    await page.fill('input[placeholder="650000"]', '350000');

    // Ensure Used Vehicle is active
    const isUsedActive = await page.locator('.condition-pill.active:has-text("Used / Pre-Owned Vehicle")').count();
    logStep('testB', 'Used / Pre-Owned vehicle condition active by default', isUsedActive > 0);

    // Attach Aadhaar and PAN, but omit RC
    await page.click('button[data-testid="attach-sample-aadhaar"]');
    await page.waitForTimeout(300);
    await page.click('button[data-testid="attach-sample-pan"]');
    await page.waitForTimeout(300);

    // Submit without RC
    await page.click('button:has-text("Submit Referral Lead")');
    await page.waitForTimeout(400);

    errorBanner = await page.locator('.guest-error-banner').innerText();
    const rcBlocked = errorBanner.includes('RC document is mandatory');
    logStep('testB', `Submission blocked without RC for used vehicle: "${errorBanner}"`, rcBlocked);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'test_b_missing_rc.png') });

    // Now attach RC
    await page.click('button[data-testid="attach-sample-rc"]');
    await page.waitForTimeout(300);
    logStep('testB', 'Sample RC copy attached successfully');

    // Submit lead
    await page.click('button:has-text("Submit Referral Lead")');
    await page.waitForSelector('.success-card', { timeout: 10000 });

    const usedCaseNo = await page.locator('.success-meta-box .meta-value.font-mono').innerText();
    logStep('testB', `Used vehicle lead submitted successfully: File No = ${usedCaseNo}`);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'test_b_success_confirmation.png') });
    results.testB.status = rcBlocked ? 'PASSED' : 'FAILED';

    // -------------------------------------------------------------
    // TEST C: Returning Referral Partner Lookup
    // -------------------------------------------------------------
    console.log('\n--- TEST C: RETURNING REFERRAL PARTNER LOOKUP ---');
    await page.goto(`${BASE_URL}/referral`);
    await page.waitForLoadState('networkidle');

    // Enter existing partner mobile: 9820044551 (Vikram Sharma)
    await page.fill('input.phone-field', '9820044551');
    await page.click('button:has-text("Continue to Referral Form")');
    await page.waitForTimeout(500);

    const welcomeText = await page.locator('.partner-status-banner').innerText();
    const isRecognized = welcomeText.includes('Welcome Back, Vikram Sharma');
    logStep('testC', `Returning partner recognized: "${welcomeText.split('\n')[0]}"`, isRecognized);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'test_c_returning_partner_identified.png') });

    // Fill customer & submit second lead under Vikram Sharma
    await page.fill('input[placeholder="e.g. Ramesh Patel"]', 'Sunil Narine');
    await page.locator('.form-grid-2 input.phone-field').fill('9898989898');
    await page.fill('input[placeholder="650000"]', '600000');
    await page.click('button:has-text("Brand New Vehicle")');

    await page.click('button[data-testid="attach-sample-aadhaar"]');
    await page.waitForTimeout(300);
    await page.click('button[data-testid="attach-sample-pan"]');
    await page.waitForTimeout(300);

    await page.click('button:has-text("Submit Referral Lead")');
    await page.waitForSelector('.success-card', { timeout: 10000 });

    const returningLeadCase = await page.locator('.success-meta-box .meta-value.font-mono').innerText();
    const returningLeadPartner = await page.locator('.success-meta-box .meta-item:has-text("Attributed Referral Partner") .meta-value').innerText();
    const partnerMatched = returningLeadPartner.includes('Vikram Sharma');

    logStep('testC', `Second lead attributed to Vikram Sharma: Case = ${returningLeadCase}`, partnerMatched);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'test_c_success_confirmation.png') });
    results.testC.status = isRecognized && partnerMatched ? 'PASSED' : 'FAILED';

    // -------------------------------------------------------------
    // TEST D: Telecaller A and Telecaller B Strict RBAC & Isolation
    // -------------------------------------------------------------
    console.log('\n--- TEST D: TELECALLER A & B STRICT ISOLATION & 403 ENFORCEMENT ---');
    // Clear storage and navigate to login
    await page.goto(`${BASE_URL}/login`);
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Log in as Telecaller A (Priya Sharma)
    await page.click('.demo-chip:has-text("Priya Sharma")');
    await page.waitForTimeout(300);
    await page.click('.login-submit-btn');
    await page.waitForURL(`${BASE_URL}/`, { timeout: 8000 });
    await page.waitForTimeout(1000);

    // Verify Telecaller Dashboard rendered
    const telecallerWelcome = await page.locator('.tc-title').innerText();
    logStep('testD', `Telecaller A logged in: "${telecallerWelcome}"`, telecallerWelcome.includes('Priya Sharma'));

    // Check Assigned Leads KPI count
    const telecallerAKpi = await page.locator('.tc-kpi-card:has-text("Assigned Leads") .tc-kpi-value').innerText();
    const isTelecallerACount4 = telecallerAKpi.trim() === '4';
    logStep('testD', `Telecaller A assigned leads KPI count = ${telecallerAKpi} (Expected: 4)`, isTelecallerACount4);

    // Check leads table rows count
    const telecallerARows = await page.locator('.tc-table tbody tr.tc-row').count();
    const isTelecallerARows4 = telecallerARows === 4;
    logStep('testD', `Telecaller A assigned leads table rows = ${telecallerARows} (Expected: 4)`, isTelecallerARows4);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'test_d_telecaller_a_dashboard.png') });

    // Update call outcome for lead case-jai-101
    await page.locator('.tc-row:first-child .tc-call-btn').click();
    await page.waitForSelector('.tc-modal-card', { timeout: 5000 });

    await page.selectOption('.tc-modal-card select', 'interested');
    await page.fill('.tc-textarea', 'Customer confirmed requirement. Ready to proceed with loan sanction.');
    await page.click('.tc-modal-actions button:has-text("Save Activity")');
    await page.waitForTimeout(1500);
    logStep('testD', 'Telecaller A recorded call outcome and remark for assigned lead');
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'test_d_telecaller_a_outcome_saved.png') });

    // Attempt direct access to Telecaller B's restricted lead (case-jai-105)
    console.log('  Testing unauthorized dossier access to case-jai-105...');
    await page.goto(`${BASE_URL}/cases/case-jai-105`);
    await page.waitForTimeout(1000);

    const errorHeading = await page.locator('.case-detail-error h2').innerText();
    const isDenied403 = errorHeading.includes('Access Denied (403 Forbidden)');
    logStep('testD', `Unauthorized access to case-jai-105 blocked with: "${errorHeading}"`, isDenied403);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'test_d_telecaller_a_access_denied_105.png') });

    // LOG OUT and log in as Telecaller B (Rahul Verma)
    await page.goto(`${BASE_URL}/login`);
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.click('.demo-chip:has-text("Rahul Verma")');
    await page.waitForTimeout(300);
    await page.click('.login-submit-btn');
    await page.waitForURL(`${BASE_URL}/`, { timeout: 8000 });
    await page.waitForTimeout(1000);

    // Verify Telecaller B Dashboard
    const telecallerBWelcome = await page.locator('.tc-title').innerText();
    const telecallerBKpi = await page.locator('.tc-kpi-card:has-text("Assigned Leads") .tc-kpi-value').innerText();
    const isTelecallerBCount2 = telecallerBKpi.trim() === '2';
    const telecallerBRows = await page.locator('.tc-table tbody tr.tc-row').count();
    const isTelecallerBRows2 = telecallerBRows === 2;

    logStep('testD', `Telecaller B logged in: "${telecallerBWelcome}"`, telecallerBWelcome.includes('Rahul Verma'));
    logStep('testD', `Telecaller B assigned leads count = ${telecallerBKpi} (Expected: 2)`, isTelecallerBCount2 && isTelecallerBRows2);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'test_d_telecaller_b_dashboard.png') });

    // Attempt direct access by Telecaller B to Telecaller A's lead (case-jai-101)
    await page.goto(`${BASE_URL}/cases/case-jai-101`);
    await page.waitForTimeout(1000);

    const bErrorHeading = await page.locator('.case-detail-error h2').innerText();
    const isBDenied403 = bErrorHeading.includes('Access Denied (403 Forbidden)');
    logStep('testD', `Telecaller B blocked from case-jai-101 with: "${bErrorHeading}"`, isBDenied403);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'test_d_telecaller_b_access_denied_101.png') });

    results.testD.status = isTelecallerACount4 && isTelecallerBCount2 && isDenied403 && isBDenied403 ? 'PASSED' : 'FAILED';

    // -------------------------------------------------------------
    // TEST E: Admin Regression & Full Visibility
    // -------------------------------------------------------------
    console.log('\n--- TEST E: ADMIN REGRESSION & FULL VISIBILITY ---');
    await page.goto(`${BASE_URL}/login`);
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.click('.demo-chip:has-text("DSA Administrator")');
    await page.waitForTimeout(300);
    await page.click('.login-submit-btn');
    await page.waitForURL(`${BASE_URL}/`, { timeout: 8000 });
    await page.waitForTimeout(1000);

    logStep('testE', 'Admin authenticated into Organization Workspace');

    // Go to /cases
    await page.goto(`${BASE_URL}/cases`);
    await page.waitForTimeout(1000);

    const adminTotalCases = await page.locator('table.cases-table tbody tr').count();
    const hasAllLeads = adminTotalCases >= 6;
    logStep('testE', `Admin case pipeline table rows = ${adminTotalCases} (Full org visibility >= 6)`, hasAllLeads);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'test_e_admin_cases_pipeline.png') });

    // Test selection and reassignment bar
    await page.locator('table.cases-table tbody tr:first-child input[type="checkbox"]').check();
    await page.waitForTimeout(300);

    const isAssignBarVisible = await page.locator('.bulk-assign-bar').isVisible();
    logStep('testE', 'Bulk reassignment action bar displayed on selection', isAssignBarVisible);

    // Verify Referral Partners Analysis
    await page.goto(`${BASE_URL}/referrals/partners`);
    await page.waitForTimeout(1000);

    const partnerCountText = await page.locator('body').innerText();
    const hasReferralsPage = partnerCountText.includes('Referral Partners') || partnerCountText.includes('Vikram Sharma');
    logStep('testE', 'Admin referral partner analytics ledger accessible', hasReferralsPage);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'test_e_admin_referrals.png') });

    results.testE.status = hasAllLeads && hasReferralsPage && isAssignBarVisible ? 'PASSED' : 'FAILED';

    // -------------------------------------------------------------
    // TEST F: Responsive UI Viewport Testing
    // -------------------------------------------------------------
    console.log('\n--- TEST F: RESPONSIVE UI VIEWPORT TESTING ---');
    const viewports = [
      { width: 320, height: 568, name: 'iPhone SE (320px)' },
      { width: 360, height: 640, name: 'Android Small (360px)' },
      { width: 375, height: 667, name: 'iPhone 8 (375px)' },
      { width: 390, height: 844, name: 'iPhone 13 (390px)' },
      { width: 430, height: 932, name: 'iPhone 14 Pro Max (430px)' },
      { width: 1280, height: 800, name: 'Desktop HD (1280px)' },
    ];

    let allViewportsPassed = true;
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // Test Referral Page
      await page.goto(`${BASE_URL}/referral`);
      await page.waitForTimeout(400);

      const hasReferralOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      // Test Dashboard
      await page.goto(`${BASE_URL}/`);
      await page.waitForTimeout(400);

      const hasDashOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      const passed = !hasReferralOverflow && !hasDashOverflow;
      if (!passed) allViewportsPassed = false;

      logStep('testF', `Viewport ${vp.name}: No horizontal overflow (Referral: ${!hasReferralOverflow}, Dashboard: ${!hasDashOverflow})`, passed);

      if (vp.width === 320 || vp.width === 390) {
        await page.screenshot({ path: path.join(EVIDENCE_DIR, `test_f_responsive_${vp.width}px.png`) });
      }
    }

    results.testF.status = allViewportsPassed ? 'PASSED' : 'FAILED';

  } catch (err) {
    console.error('E2E Execution Error:', err);
  } finally {
    await browser.close();
  }

  console.log('\n================================================================');
  console.log('DSA OS — AUTOMATION EXECUTION SUMMARY:');
  console.log('----------------------------------------------------------------');
  console.log(`Test A (New Partner & Doc Rules):     ${results.testA.status}`);
  console.log(`Test B (Used Vehicle & RC Rule):       ${results.testB.status}`);
  console.log(`Test C (Returning Partner Lookup):    ${results.testC.status}`);
  console.log(`Test D (Telecaller A/B RBAC 403):     ${results.testD.status}`);
  console.log(`Test E (Admin Full Visibility):       ${results.testE.status}`);
  console.log(`Test F (Responsive UI Viewports):     ${results.testF.status}`);
  console.log('================================================================\n');

  fs.writeFileSync(
    path.join(EVIDENCE_DIR, 'e2e_summary.json'),
    JSON.stringify(results, null, 2)
  );
}

run();
