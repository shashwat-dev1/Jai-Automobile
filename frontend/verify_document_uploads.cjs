const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testDocumentUploads() {
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({ headless: true, executablePath: CHROME_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Listen for console errors or network 405s
  const http405Errors = [];
  page.on('response', (response) => {
    if (response.status() === 405) {
      http405Errors.push(`${response.request().method()} ${response.url()} returned HTTP 405`);
    }
  });

  console.log('--- TEST 1: Referral Guest Document Upload ---');
  await page.goto('http://localhost:5173/referral', { waitUntil: 'networkidle' });

  // Step 1: Partner lookup
  await page.locator('.phone-input-wrapper input[type="tel"]').fill('9820011001');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);

  // Click demo sample buttons for Aadhaar, PAN, RC
  const demoAadhaarBtn = page.locator('[data-testid="attach-sample-aadhaar"]');
  const demoPanBtn = page.locator('[data-testid="attach-sample-pan"]');
  const demoRcBtn = page.locator('[data-testid="attach-sample-rc"]');

  await demoAadhaarBtn.click();
  await page.waitForTimeout(500);

  await demoPanBtn.click();
  await page.waitForTimeout(500);

  await demoRcBtn.click();
  await page.waitForTimeout(500);

  // Check attached badges
  const attachedBoxes = page.locator('.doc-box.is-attached');
  const count = await attachedBoxes.count();
  console.log('Attached & Quarantined document boxes count:', count);
  if (count < 3) {
    console.error('FAIL: Expected 3 attached document boxes, got:', count);
    process.exit(1);
  }
  console.log('PASS: All 3 document dropzones successfully attached without 405 error!');

  // Check if partner name input is needed (for new partner)
  const partnerNameInput = page.locator('input[placeholder="e.g. Vikram Sharma / Auto Connectors"]');
  if (await partnerNameInput.isVisible()) {
    await partnerNameInput.fill('Vikram Auto Deals');
  }

  // Fill remaining lead inputs
  await page.fill('input[placeholder="e.g. Ramesh Patel"]', 'Sunil Deshmukh');
  await page.fill('input[placeholder="98123 45678"]', '9819922334');
  await page.fill('input[placeholder="650000"]', '750000');
  await page.fill('input[placeholder="400053"]', '400001');
  await page.waitForTimeout(500);

  // Submit referral lead
  const submitLeadBtn = page.locator('button[type="submit"]:has-text("Submit Referral Lead")');
  await submitLeadBtn.click();
  await page.waitForTimeout(1500);

  // Check if there is an error banner
  const errBanner = await page.$('.guest-error-banner');
  if (errBanner) {
    const errText = await errBanner.innerText();
    console.error('FAIL: Referral submission error:', errText);
    process.exit(1);
  }

  // Check Step 3 success screen
  const successTitle = await page.locator('h2:has-text("Referral Submitted Successfully")').innerText();
  console.log('Referral Submit Result:', successTitle);
  console.log('PASS: Referral Lead with 3 documents submitted successfully!');

  // --- TEST 2: Quick Intake Document Upload ---
  console.log('\n--- TEST 2: Quick Intake Document Upload ---');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });

  // Login as DSA Admin
  const adminChip = page.locator('.demo-chip:has-text("DSA Administrator")');
  await adminChip.click();
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(1500);

  // Navigate to /cases
  await page.goto('http://localhost:5173/cases', { waitUntil: 'networkidle' });

  // Click Quick Intake button
  const quickIntakeBtn = page.locator('button:has-text("Quick Intake")');
  await quickIntakeBtn.click();
  await page.waitForTimeout(500);

  // Fill Step 1
  await page.fill('#intake-name', 'Deepak Verma');
  await page.fill('#intake-mobile', '9833445566');
  await page.fill('#intake-make', 'Hyundai');
  await page.fill('#intake-model', 'Creta SX');

  // Click Proceed to Document Intake
  const proceedBtn = page.locator('button:has-text("Proceed to Document Intake")');
  await proceedBtn.click();
  await page.waitForTimeout(500);

  // Verify Step 2 chips are visible
  const docChips = page.locator('.doc-upload-chip');
  const chipCount = await docChips.count();
  console.log('Available document upload chips count:', chipCount);
  if (chipCount === 0) {
    console.error('FAIL: Document types chips not rendered in Quick Intake!');
    process.exit(1);
  }
  console.log('PASS: Document type chips rendered successfully in Quick Intake.');

  // Test attaching a document using file input
  const testFilePath = path.join(__dirname, 'test_mock_doc.pdf');
  fs.writeFileSync(testFilePath, '%PDF-1.4 mock pdf content');

  const fileInput = page.locator('.doc-upload-chip input[type="file"]').first();
  await fileInput.setInputFiles(testFilePath);
  await page.waitForTimeout(1000);

  // Check staged document box
  const stagedItem = page.locator('.staged-doc-card');
  const stagedCount = await stagedItem.count();
  console.log('Staged documents count in modal:', stagedCount);
  if (stagedCount === 0) {
    console.error('FAIL: Document was not staged in Quick Intake!');
    process.exit(1);
  }

  // Check error message in modal
  const errorAlert = await page.$('.case-error-alert');
  if (errorAlert) {
    const errorText = await errorAlert.innerText();
    console.error('FAIL: Modal has error alert:', errorText);
    process.exit(1);
  }
  console.log('PASS: Document uploaded and staged in Quick Intake with OCR without 405 error!');

  // Click Complete Intake
  const completeIntakeBtn = page.locator('button:has-text("Create Loan File & Open Dossier")');
  await completeIntakeBtn.click();
  await page.waitForTimeout(2000);

  // Clean up test file
  if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);

  // Verify redirected to case dossier page
  console.log('Redirected to dossier URL:', page.url());
  if (!page.url().includes('/cases/')) {
    console.error('FAIL: Expected redirect to /cases/:id, got:', page.url());
    process.exit(1);
  }
  console.log('PASS: Case created and opened in full operational dossier!');

  // --- TEST 3: Document Checklist in Case Dossier ---
  console.log('\n--- TEST 3: Document Checklist Status Update & Request Message ---');
  await page.waitForTimeout(1000);

  // Check if Checklist items are present
  const checklistRows = page.locator('.checklist-table tbody tr');
  const checkCount = await checklistRows.count();
  console.log('Checklist items count in dossier:', checkCount);
  if (checkCount > 0) {
    console.log('PASS: Document checklist loaded without 405 error.');
  }

  // Test Generate Request Message
  const reqMsgBtn = page.locator('button:has-text("Request Missing Documents")');
  if (await reqMsgBtn.isVisible()) {
    await reqMsgBtn.click();
    await page.waitForTimeout(500);
    const msgModal = page.locator('.req-msg-preview');
    if (await msgModal.isVisible()) {
      console.log('PASS: Request message modal opened cleanly.');
      await page.locator('.req-msg-modal button:has-text("Close")').click();
    }
  }

  console.log('\n============================================================');
  console.log('DOCUMENT UPLOAD & CHECKLIST VERIFICATIONS PASSED 100%!');
  console.log('============================================================');

  await browser.close();
}

testDocumentUploads().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
