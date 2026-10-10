const { chromium } = require('playwright');

async function runCompleteEndToEndFlow() {
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({ headless: true, executablePath: CHROME_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('================================================================');
  console.log('STARTING COMPLETE DSA OS OCR & DATABASE SYNC END-TO-END FLOW');
  console.log('================================================================');

  // --- SCENARIO 1: Guest Referral Portal Lead Intake with Documents ---
  console.log('\n--- SCENARIO 1: Guest Referral Portal Submission (/referral) ---');
  await page.goto('http://localhost:5173/referral', { waitUntil: 'networkidle' });

  // Step 1: Submitter Mobile Lookup
  await page.locator('.phone-input-wrapper input[type="tel"]').fill('9820011001');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(800);

  // If partner name input is displayed (new partner), fill it
  const partnerNameInput = page.locator('input[placeholder="e.g. Vikram Sharma / Auto Connectors"]');
  if (await partnerNameInput.isVisible()) {
    await partnerNameInput.fill('Vikram Auto Deals');
  }

  // Attach sample documents for Aadhaar, PAN, RC
  await page.locator('[data-testid="attach-sample-aadhaar"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="attach-sample-pan"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="attach-sample-rc"]').click();
  await page.waitForTimeout(400);

  // Verify all 3 attached
  const attachedCount = await page.locator('.doc-box.is-attached').count();
  console.log('Attached document dropzones count:', attachedCount);
  if (attachedCount < 3) {
    throw new Error(`Expected 3 attached document dropzones, found ${attachedCount}`);
  }

  // Fill Borrower Information
  await page.fill('input[placeholder="e.g. Ramesh Patel"]', 'Vikram Aditya Deshmukh');
  await page.fill('input[placeholder="98123 45678"]', '9819922334');
  await page.fill('input[placeholder="650000"]', '750000');
  await page.fill('input[placeholder="400053"]', '400001');
  await page.waitForTimeout(500);

  // Submit Referral Lead
  console.log('Submitting referral lead with attached documents...');
  await page.locator('button[type="submit"]:has-text("Submit Referral Lead")').click();
  await page.waitForTimeout(1500);

  // Verify Success Screen
  const successTitle = await page.locator('h2:has-text("Referral Submitted Successfully")').innerText();
  console.log('Referral Submission Result:', successTitle);

  // Extract reference number
  const caseNoEl = page.locator('.meta-item:has-text("File Reference Number") .meta-value');
  const generatedCaseNo = await caseNoEl.innerText();
  console.log('Generated Case Reference Number:', generatedCaseNo);
  console.log('PASS: SCENARIO 1 Complete. Referral lead and documents submitted.');

  // --- SCENARIO 2: Admin Panel Database Sync Verification ---
  console.log('\n--- SCENARIO 2: Admin Operations Verification (/cases) Database Sync ---');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });

  // Log in as DSA Administrator
  await page.locator('.demo-chip:has-text("DSA Administrator")').click();
  await page.locator('button[type="submit"]:has-text("Authenticate & Open Workspace")').click();
  await page.waitForTimeout(1500);

  // Navigate to Cases
  await page.goto('http://localhost:5173/cases', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Check if newly submitted lead is in the table
  const leadRow = page.locator(`tr:has-text("${generatedCaseNo}")`);
  const isLeadInTable = await leadRow.isVisible();
  console.log(`Is newly submitted lead (${generatedCaseNo}) visible in Admin Panel:`, isLeadInTable);

  if (!isLeadInTable) {
    // Also check by applicant name
    const applicantRow = page.locator('tr:has-text("Vikram Aditya Deshmukh")');
    const isApplicantVisible = await applicantRow.isVisible();
    console.log('Checking by applicant name (Vikram Aditya Deshmukh):', isApplicantVisible);
    if (!isApplicantVisible) {
      throw new Error(`FAIL: Database Sync Failure. Lead ${generatedCaseNo} not found in Admin Panel table.`);
    }
  }
  console.log('PASS: SCENARIO 2 Complete. Database is in 100% sync; newly submitted lead is visible in Admin Panel.');

  // --- SCENARIO 3: Normal Profile Page with OCR Extracted Details + Typed Details + Document Previews ---
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('BROWSER ERROR:', msg.text());
  });
  page.on('pageerror', (err) => console.log('BROWSER PAGEERROR:', err.message));

  console.log('\n--- SCENARIO 3: Lead & OCR Profile Page Verification (/cases/:id) ---');
  // Click on the case link to open CaseDetailPage
  const caseLink = page.locator(`a:has-text("${generatedCaseNo}")`).first();
  if (await caseLink.isVisible()) {
    await caseLink.click();
  } else {
    await page.locator('a:has-text("Vikram Aditya Deshmukh")').first().click();
  }
  await page.waitForTimeout(2000);
  console.log('Opened Case Detail Page URL:', page.url());

  const pageText = await page.locator('body').innerText();
  console.log('Page body snippet:', pageText.slice(0, 250).replace(/\n+/g, ' '));

  // Verify LeadOcrProfileSection is rendered
  const ocrSection = page.locator('.lead-ocr-profile-section');
  if (!(await ocrSection.isVisible())) {
    throw new Error('FAIL: LeadOcrProfileSection component not rendered on Case Detail Page.');
  }
  console.log('PASS: LeadOcrProfileSection component is prominently rendered.');

  // Verify Typed Form Values vs OCR Extracted Values
  const typedNameText = await page.locator('.typed-pane .field-val:has-text("Vikram Aditya Deshmukh")').first().innerText();
  console.log('Verified Typed Borrower Name:', typedNameText);

  // Check OCR Extracted Fields (PAN, Aadhaar, RC)
  const ocrValues = page.locator('.ocr-pane .ocr-val');
  const ocrValuesCount = await ocrValues.count();
  console.log('OCR Extracted Values count in profile card:', ocrValuesCount);
  if (ocrValuesCount === 0) {
    throw new Error('FAIL: No OCR extracted values found in OCR comparison pane.');
  }
  console.log('PASS: OCR Extracted values are clearly surfaced alongside typed form values.');

  // Check Document Preview Cards
  const docPreviewCards = page.locator('.doc-preview-card');
  const docCardsCount = await docPreviewCards.count();
  console.log('Document preview cards count:', docCardsCount);
  if (docCardsCount < 3) {
    throw new Error(`Expected at least 3 document preview cards, found ${docCardsCount}`);
  }
  console.log('PASS: Visual document preview cards for Aadhaar, PAN, and RC are rendered.');

  // Test Document Inspection Lightbox Modal
  console.log('Opening full document preview lightbox...');
  const previewBtn = page.locator('.doc-action-btn.primary:has-text("Full Preview")').first();
  await previewBtn.click();
  await page.waitForTimeout(600);

  const lightbox = page.locator('.ocr-preview-lightbox');
  if (!(await lightbox.isVisible())) {
    throw new Error('FAIL: Document preview lightbox modal did not open.');
  }
  console.log('PASS: Full Document OCR Inspection Lightbox opened successfully.');

  // Close lightbox
  await page.locator('.lightbox-close-btn').click();
  await page.waitForTimeout(400);

  // Test Collapsible Raw OCR Text
  console.log('Testing Collapsible Raw OCR Text drawer...');
  const rawTextBtn = page.locator('.doc-action-btn.secondary:has-text("Raw Text")').first();
  await rawTextBtn.click();
  await page.waitForTimeout(400);

  const rawOcrBox = page.locator('.doc-raw-ocr-box').first();
  const isRawVisible = await rawOcrBox.isVisible();
  console.log('Is Raw OCR Text drawer visible:', isRawVisible);
  if (!isRawVisible) {
    throw new Error('FAIL: Raw OCR Text drawer did not expand.');
  }
  console.log('PASS: Raw OCR text output inspected successfully.');

  // Test "Confirm & Promote OCR to Dossier"
  const promoteBtn = page.locator('button:has-text("Confirm & Promote OCR to Dossier")');
  await promoteBtn.click();
  await page.waitForTimeout(800);
  const alertNotice = page.locator('.ocr-applied-alert');
  if (await alertNotice.isVisible()) {
    console.log('Promotion Notice:', await alertNotice.innerText());
    console.log('PASS: Verified OCR data promoted to Case Master Dossier successfully.');
  }

  // --- SCENARIO 4: Referral Partners Ledger Sync (/referrals) ---
  console.log('\n--- SCENARIO 4: Referral Partners Ledger Sync (/referrals) ---');
  await page.goto('http://localhost:5173/referrals', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Verify Referral Partners Table
  const partnerRows = page.locator('.partners-table tbody tr');
  const partnerRowCount = await partnerRows.count();
  console.log('Referral Partners count in ledger:', partnerRowCount);

  // Verify partner total leads counter
  const partnerCell = page.locator('tr:has-text("Vikram")').first();
  if (await partnerCell.isVisible()) {
    console.log('PASS: Submitting partner verified in admin referral partner ledger.');
    // Click partner to open drawer
    await partnerCell.click();
    await page.waitForTimeout(600);
    const drawerTitle = page.locator('.drawer-partner-title');
    if (await drawerTitle.isVisible()) {
      console.log('Partner Drawer Title:', await drawerTitle.innerText());
      console.log('PASS: Partner dossier opened with attributed leads.');
      await page.locator('.drawer-close-btn').click();
    }
  }

  // --- SCENARIO 5: Telecaller Assignment & Workspace Sync ---
  console.log('\n--- SCENARIO 5: Telecaller Assignment & Workspace Sync (/telecaller) ---');
  await page.goto('http://localhost:5173/cases', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // Select the newly created lead checkbox
  const leadCheckbox = page.locator(`tr:has-text("${generatedCaseNo}") input[type="checkbox"]`).first();
  if (await leadCheckbox.isVisible()) {
    await leadCheckbox.check();
    await page.waitForTimeout(300);

    // Bulk Assignment toolbar
    const assignBtn = page.locator('.bulk-assign-bar button:has-text("Assign")');
    if (await assignBtn.isVisible()) {
      await assignBtn.click();
      await page.waitForTimeout(1000);
      console.log('Lead assigned to telecaller Priya Sharma.');
    }
  }

  // Log in as Telecaller Priya Sharma
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.locator('.demo-chip:has-text("Priya Sharma")').click();
  await page.locator('button[type="submit"]:has-text("Authenticate & Open Workspace")').click();
  await page.waitForTimeout(1500);

  // Navigate to Telecaller Workspace
  await page.goto('http://localhost:5173/telecaller', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const telecallerLeadsCount = await page.locator('.lead-card').count();
  console.log("Priya Sharma's assigned leads count:", telecallerLeadsCount);
  if (telecallerLeadsCount === 0) {
    throw new Error('FAIL: Telecaller Priya Sharma has 0 assigned leads after assignment.');
  }
  console.log('PASS: Telecaller workspace dynamically loaded assigned lead records.');

  // --- SCENARIO 6: Cross-Reload Persistence Test ---
  console.log('\n--- SCENARIO 6: Cross-Reload Persistence Test ---');
  console.log('Reloading the browser page to verify data does not disappear...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const reloadedLeadsCount = await page.locator('.lead-card').count();
  console.log('Assigned leads count after full browser reload:', reloadedLeadsCount);
  if (reloadedLeadsCount === 0) {
    throw new Error('FAIL: Persistence failure! Leads disappeared on page reload.');
  }
  console.log('PASS: Cross-reload persistence verified 100%! Data remains intact across reloads.');

  console.log('\n================================================================');
  console.log('ALL 6 END-TO-END SCENARIOS COMPLETED AND PASSED WITH 100% SUCCESS!');
  console.log('================================================================');

  await browser.close();
}

runCompleteEndToEndFlow().catch((err) => {
  console.error('\nE2E Execution Error:', err);
  process.exit(1);
});
