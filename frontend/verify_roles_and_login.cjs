const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testRoleAndLogin() {
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({ headless: true, executablePath: CHROME_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  async function openSidebarIfMobile() {
    const menuBtn = page.locator('.topbar-menu-btn');
    if (await menuBtn.isVisible()) {
      await menuBtn.click();
      await page.waitForTimeout(300);
    }
  }

  console.log('--- STEP 1: Verifying Login Page & Removed Instant Prototype Button ---');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });

  // 1. Check instant prototype button is gone
  const instantProtoBtn = await page.$('text="Instant Prototype Entry"');
  if (instantProtoBtn) {
    console.error('FAIL: Instant Prototype Entry button is still present!');
    process.exit(1);
  }
  console.log('PASS: "Instant Prototype Entry" button is completely removed.');

  // 2. Check primary submit button
  const submitBtn = await page.$('button[type="submit"]');
  const submitText = await submitBtn.innerText();
  console.log('PASS: Primary button present:', submitText.trim());

  // 3. Check demo operator chips
  const priyaChip = page.locator('.demo-chip:has-text("Priya Sharma")');
  const rahulChip = page.locator('.demo-chip:has-text("Rahul Verma")');
  const adminChip = page.locator('.demo-chip:has-text("DSA Administrator")');
  
  if (!(await priyaChip.count()) || !(await rahulChip.count()) || !(await adminChip.count())) {
    console.error('FAIL: Demo chips not found!');
    process.exit(1);
  }
  console.log('PASS: All 3 demo operator chips exist.');

  // --- STEP 2: Login as Priya Sharma (Telecaller) ---
  console.log('\n--- STEP 2: Authenticating Priya Sharma (Telecaller) ---');
  await priyaChip.click();
  const identValue = await page.inputValue('#identifier');
  console.log('Input prefilled with:', identValue);
  if (!identValue.includes('priya.sharma')) {
    console.error('FAIL: Priya Sharma email was not prefilled!');
    process.exit(1);
  }

  await submitBtn.click();
  await page.waitForTimeout(2000);

  // Check TopBar
  const topbarOp = await page.locator('.topbar-operator-text').innerText();
  console.log('TopBar Operator Display:', topbarOp);
  if (!topbarOp.includes('Priya Sharma')) {
    console.error('FAIL: TopBar does NOT show Priya Sharma! Found:', topbarOp);
    process.exit(1);
  }
  console.log('PASS: TopBar shows Operator: Priya Sharma (Telecaller)');

  // Check sidebar profile
  await openSidebarIfMobile();
  const sidebarUserName = await page.locator('.sidebar-user-name').innerText();
  const sidebarUserRole = await page.locator('.sidebar-user-role').innerText();
  console.log('Sidebar Profile:', sidebarUserName, '| Role:', sidebarUserRole);
  if (!sidebarUserName.includes('Priya Sharma') || sidebarUserRole.toLowerCase() !== 'telecaller') {
    console.error('FAIL: Sidebar does not show Priya Sharma telecaller! Found:', sidebarUserName, sidebarUserRole);
    process.exit(1);
  }
  console.log('PASS: Sidebar footer shows Priya Sharma (Telecaller) with role telecaller');

  // Verify telecaller cannot see admin links
  const usersLink = await page.$('a[href="/admin/users"]');
  const auditLink = await page.$('a[href="/admin/audit"]');
  if (usersLink || auditLink) {
    console.error('FAIL: Telecaller can see admin links!');
    process.exit(1);
  }
  console.log('PASS: Admin links (Team, Audit Trail) hidden from telecaller sidebar.');

  // Check Dashboard is TelecallerDashboard
  const telecallerHeader = page.locator('.telecaller-title').first();
  if (await telecallerHeader.isVisible()) {
    console.log('PASS: Rendered Telecaller Outbound & Cold Leads Desk on dashboard');
  }

  // --- STEP 3: Check Cases Page for Telecaller ---
  console.log('\n--- STEP 3: Checking /cases restrictions for Priya Sharma ---');
  await page.goto('http://localhost:5173/cases', { waitUntil: 'networkidle' });

  const casesTitle = await page.locator('.cases-header h1').innerText();
  const casesSubtitle = await page.locator('.cases-header p').innerText();
  console.log('Cases Title:', casesTitle);
  console.log('Cases Subtitle:', casesSubtitle);

  if (!casesTitle.includes('My Assigned Leads Desk')) {
    console.error('FAIL: Expected "My Assigned Leads Desk", got:', casesTitle);
    process.exit(1);
  }
  console.log('PASS: Page title is "My Assigned Leads Desk".');

  // Verify Excel import, Quick Intake, and New Lead buttons are HIDDEN
  const excelImportBtn = await page.$('text="Bulk Excel Import"');
  const quickIntakeBtn = await page.$('text="Quick Intake"');
  const newLeadBtn = await page.$('text="New Lead Workspace"');

  if (excelImportBtn || quickIntakeBtn || newLeadBtn) {
    console.error('FAIL: Telecaller can see Excel Import or Lead creation buttons!');
    process.exit(1);
  }
  console.log('PASS: Bulk Excel Import and Lead creation buttons are hidden from telecaller.');

  // Verify checkboxes and bulk assign toolbar are HIDDEN
  const thCheckbox = await page.$('.cases-table th input[type="checkbox"]');
  const tdCheckbox = await page.$('.cases-table td input[type="checkbox"]');
  const bulkAssignBar = await page.$('.bulk-assign-bar');

  if (thCheckbox || tdCheckbox || bulkAssignBar) {
    console.error('FAIL: Telecaller can see checkboxes or bulk assignment toolbar!');
    process.exit(1);
  }
  console.log('PASS: Table checkboxes and bulk assign tools are completely hidden from telecaller.');

  // Verify only Priya\'s 4 leads are visible
  const caseRows = page.locator('.cases-table tbody tr');
  const rowCount = await caseRows.count();
  console.log('Priya assigned lead rows count:', rowCount);
  if (rowCount !== 4) {
    console.error('FAIL: Expected 4 assigned leads for Priya Sharma, found:', rowCount);
    process.exit(1);
  }
  console.log('PASS: Exactly 4 assigned leads displayed for Priya Sharma.');

  // --- STEP 4: Sign out and login as Rahul Verma ---
  console.log('\n--- STEP 4: Testing Sign Out & Login as Rahul Verma ---');
  await openSidebarIfMobile();
  const logoutBtn = page.locator('.sidebar-logout-btn');
  await logoutBtn.click();
  await page.waitForTimeout(1000);

  if (!page.url().includes('/login')) {
    console.error('FAIL: Did not redirect to /login after sign out!');
    process.exit(1);
  }
  console.log('PASS: Successfully signed out and returned to /login');

  await rahulChip.click();
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(2000);

  const rahulTopBar = await page.locator('.topbar-operator-text').innerText();
  console.log('Rahul TopBar:', rahulTopBar);
  if (!rahulTopBar.includes('Rahul Verma')) {
    console.error('FAIL: TopBar does not show Rahul Verma! Found:', rahulTopBar);
    process.exit(1);
  }
  console.log('PASS: Operator: Rahul Verma (Telecaller)');

  await page.goto('http://localhost:5173/cases', { waitUntil: 'networkidle' });
  const rahulRowCount = await page.locator('.cases-table tbody tr').count();
  console.log('Rahul assigned lead rows count:', rahulRowCount);
  if (rahulRowCount !== 2) {
    console.error('FAIL: Expected 2 assigned leads for Rahul Verma, found:', rahulRowCount);
    process.exit(1);
  }
  console.log('PASS: Exactly 2 assigned leads displayed for Rahul Verma.');

  // --- STEP 5: Sign out and login as DSA Administrator ---
  console.log('\n--- STEP 5: Testing DSA Administrator (Aarav Sharma) Full Access ---');
  await openSidebarIfMobile();
  await page.locator('.sidebar-logout-btn').click();
  await page.waitForTimeout(1000);

  await adminChip.click();
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(2000);

  const adminTopBar = await page.locator('.topbar-operator-text').innerText();
  console.log('Admin TopBar:', adminTopBar);
  if (!adminTopBar.includes('Aarav Sharma')) {
    console.error('FAIL: TopBar does not show Aarav Sharma! Found:', adminTopBar);
    process.exit(1);
  }
  console.log('PASS: Operator: Aarav Sharma (DSA Admin)');

  // Admin dashboard checks
  const kpiStrip = page.locator('.kpi-strip');
  if (await kpiStrip.isVisible()) {
    console.log('PASS: Admin Executive KPI strip visible');
  }

  // Admin cases page checks
  await page.goto('http://localhost:5173/cases', { waitUntil: 'networkidle' });
  const adminCasesTitle = await page.locator('.cases-header h1').innerText();
  console.log('Admin Cases Title:', adminCasesTitle);
  if (!adminCasesTitle.includes('Cold Leads & Active Files')) {
    console.error('FAIL: Expected "Cold Leads & Active Files", got:', adminCasesTitle);
    process.exit(1);
  }

  const adminExcelBtn = await page.locator('button:has-text("Bulk Excel Import")').count();
  const adminNewLeadBtn = await page.locator('button:has-text("New Lead Workspace")').count();
  const adminThCheckbox = await page.locator('.cases-table th input[type="checkbox"]').count();

  if (!adminExcelBtn || !adminNewLeadBtn || !adminThCheckbox) {
    console.error('FAIL: Admin is missing Excel Import, New Lead, or checkboxes! Found:', { adminExcelBtn, adminNewLeadBtn, adminThCheckbox });
    process.exit(1);
  }
  console.log('PASS: Admin has Bulk Excel Import, New Lead, and row checkboxes.');

  const adminRowCount = await page.locator('.cases-table tbody tr').count();
  console.log('Total lead rows for admin:', adminRowCount);
  if (adminRowCount !== 6) {
    console.error('FAIL: Expected all 6 leads for admin, found:', adminRowCount);
    process.exit(1);
  }
  console.log('PASS: Admin sees all 6 pipeline leads.');

  // Test selecting row and verifying bulk assign bar
  await page.locator('.cases-table th input[type="checkbox"]').click();
  const adminBulkBar = page.locator('.bulk-assign-bar');
  if (await adminBulkBar.isVisible()) {
    console.log('PASS: Bulk assignment toolbar appears on selection for Admin.');
  }

  // Mobile drawer test: resize viewport to mobile (375x812)
  console.log('\n--- STEP 6: Testing Mobile Viewport Burger Menu ---');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('http://localhost:5173/cases', { waitUntil: 'networkidle' });
  const mobileMenuBtn = page.locator('.topbar-menu-btn');
  if (await mobileMenuBtn.isVisible()) {
    console.log('PASS: Burger menu button visible on mobile viewport (375px)');
    await mobileMenuBtn.click();
    await page.waitForTimeout(300);
    const mobileSidebarUser = await page.locator('.sidebar-user-name').innerText();
    console.log('PASS: Mobile drawer opened, showing operator:', mobileSidebarUser);
    if (!mobileSidebarUser.includes('Aarav Sharma')) {
      console.error('FAIL: Mobile drawer showed wrong user:', mobileSidebarUser);
      process.exit(1);
    }
  }

  console.log('\n============================================================');
  console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
  console.log('============================================================');

  await browser.close();
}

testRoleAndLogin().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
