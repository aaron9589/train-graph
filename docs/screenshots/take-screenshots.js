// LiveRun screenshot capture script
// Run via: node take-screenshots.js (from /tmp after npm install playwright@1.52.0)
const { chromium } = require('playwright');

const BASE = 'http://localhost:3002';
const OUT = '/shots';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Load app and wait for full hydration
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=TRAINS', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // ── Helper ─────────────────────────────────────────────────────────────────
  async function setZoom(level) {
    // level: 1=min … 8=max
    const zoomOut = page.getByTitle('Zoom out');
    for (let i = 0; i < 8; i++) {
      if (await zoomOut.isDisabled().catch(() => true)) break;
      await zoomOut.click(); await page.waitForTimeout(60);
    }
    const zoomIn = page.getByTitle('Zoom in');
    for (let i = 1; i < level; i++) {
      if (await zoomIn.isDisabled().catch(() => true)) break;
      await zoomIn.click(); await page.waitForTimeout(60);
    }
    await page.waitForTimeout(300);
  }

  // ── 1. Full-day overview (1× zoom) ────────────────────────────────────────
  await setZoom(1);
  await page.screenshot({ path: `${OUT}/01-train-graph-overview.png` });
  console.log('✓ 01-train-graph-overview.png');

  // ── 2. Zoomed-in graph (4×) with tooltip on hover ─────────────────────────
  await setZoom(4);
  // Hover centre of graph canvas to trigger a tooltip
  const graphEl = page.locator('main svg, main canvas').first();
  const graphBox = await graphEl.boundingBox();
  if (graphBox) {
    // Sweep horizontally until a tooltip appears
    for (let x = graphBox.x + 80; x < graphBox.x + graphBox.width - 80; x += 30) {
      await page.mouse.move(x, graphBox.y + graphBox.height * 0.35);
      await page.waitForTimeout(120);
      const tip = await page.locator('[role="tooltip"], .tooltip, [class*="tooltip"]').first().isVisible().catch(() => false);
      if (tip) break;
    }
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/02-train-graph-zoomed-tooltip.png` });
  console.log('✓ 02-train-graph-zoomed-tooltip.png');

  // Move mouse away
  await page.mouse.move(10, 10);

  // ── 3. Timetable sidebar — active flag + export buttons ───────────────────
  await setZoom(1);
  // Hover timetable row to reveal action buttons
  const timetableRow = page.locator('aside').locator('text=Base MTP').first();
  await timetableRow.hover();
  await page.waitForTimeout(400);
  // Capture just the sidebar area
  const sidebarEl = page.locator('aside').first();
  const sidebarBox = await sidebarEl.boundingBox();
  await page.screenshot({
    path: `${OUT}/03-timetable-sidebar.png`,
    clip: sidebarBox ? { x: sidebarBox.x, y: sidebarBox.y, width: sidebarBox.width, height: Math.min(sidebarBox.height, 520) } : undefined,
  });
  console.log('✓ 03-timetable-sidebar.png');

  // ── 4. Train editor (8L02) — stop times + metadata ────────────────────────
  const trainItem = page.locator('aside').locator('text=8L02').first();
  await trainItem.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/04-train-editor.png` });
  console.log('✓ 04-train-editor.png');

  // Scroll modal to show stop times / special instructions
  await page.evaluate(() => {
    const scrollable = Array.from(document.querySelectorAll('*')).find(
      el => el.scrollHeight > el.clientHeight + 20 && el.clientHeight > 200 && el !== document.body && el !== document.documentElement
    );
    if (scrollable) scrollable.scrollTop = 400;
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/04b-train-editor-stops.png` });
  console.log('✓ 04b-train-editor-stops.png');

  // Close modal/panel (try close button first, then Escape)
  const closeAnyPanel = async () => {
    // Try clicking the black backdrop overlay (PathEditor / modal dialogs)
    const backdrop = page.locator('div.fixed.inset-0 > div.absolute.inset-0').first();
    if (await backdrop.isVisible().catch(() => false)) {
      await backdrop.click({ force: true });
      await page.waitForTimeout(400);
    }
    // Try clicking ✕ close buttons on fixed aside panels (TrainEditor etc.)
    const fixedClose = page.locator('aside.fixed button').filter({ hasText: '✕' }).first();
    if (await fixedClose.isVisible().catch(() => false)) {
      await fixedClose.click();
      await page.waitForTimeout(400);
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  };
  await closeAnyPanel();

  // ── 5. Crew section ───────────────────────────────────────────────────────
  await page.evaluate(() => {
    const aside = document.querySelector('aside');
    if (aside) aside.scrollTop = 9999;
  });
  await page.waitForTimeout(400);

  // Find the CREW section header and scroll it into view
  const crewHeader = page.locator('aside').locator('text=CREW').first();
  await crewHeader.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  const crewBox = await crewHeader.boundingBox();

  // Capture sidebar from CREW section downward
  if (crewBox && sidebarBox) {
    await page.screenshot({
      path: `${OUT}/05-crew-section.png`,
      clip: { x: sidebarBox.x, y: crewBox.y - 10, width: sidebarBox.width, height: 350 },
    });
  } else {
    await page.screenshot({ path: `${OUT}/05-crew-section.png` });
  }
  console.log('✓ 05-crew-section.png');

  // ── 6. Stations section ───────────────────────────────────────────────────
  const stationsHeader = page.locator('aside').locator('text=STATIONS').first();
  await stationsHeader.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  const stBox = await stationsHeader.boundingBox();
  if (stBox && sidebarBox) {
    await page.screenshot({
      path: `${OUT}/06-stations-section.png`,
      clip: { x: sidebarBox.x, y: stBox.y - 10, width: sidebarBox.width, height: 350 },
    });
  } else {
    await page.screenshot({ path: `${OUT}/06-stations-section.png` });
  }
  console.log('✓ 06-stations-section.png');

  // ── 7. Paths section — expanded list + path editor ───────────────────────
  const pathsHeader = page.locator('aside:not(.fixed)').locator('text=PATHS').first();
  await pathsHeader.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);

  // Click the chevron/header button to expand the Paths section
  await pathsHeader.click();
  await page.waitForTimeout(400);

  // Scroll down a bit so all paths are visible
  await page.evaluate(() => {
    const aside = document.querySelector('aside:not(.fixed)');
    if (aside) aside.scrollTop = aside.scrollHeight;
  });
  await page.waitForTimeout(300);

  await page.screenshot({
    path: `${OUT}/07-paths-section.png`,
    clip: sidebarBox ? { x: sidebarBox.x, y: sidebarBox.y, width: sidebarBox.width, height: sidebarBox.height } : undefined,
  });
  console.log('✓ 07-paths-section.png');

  // Click the first path by its full name (to avoid matching station names)
  const firstPath = page.locator('aside:not(.fixed)').locator('text=Staging (Down) -> Nowra').first();
  const firstPathVisible = await firstPath.isVisible().catch(() => false);
  if (firstPathVisible) {
    await firstPath.click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/07b-path-editor.png` });
    console.log('✓ 07b-path-editor.png');
    await closeAnyPanel();
  }

  // ── 7c-7e. New train with path autofill workflow ───────────────────────────
  // Scroll sidebar back to Trains section and click "+ Add"
  await page.evaluate(() => {
    const aside = document.querySelector('aside:not(.fixed)');
    if (aside) aside.scrollTop = 0;
  });
  await page.waitForTimeout(300);

  const addTrainBtn = page.locator('aside:not(.fixed) button').filter({ hasText: '+ Add' }).first();
  await addTrainBtn.click();
  await page.waitForTimeout(700);

  // Screenshot: new train form with path dropdown visible (nothing selected yet)
  await page.screenshot({ path: `${OUT}/07c-new-train-path-dropdown.png` });
  console.log('✓ 07c-new-train-path-dropdown.png');

  // Select the "Staging (Down) -> Nowra" path
  await page.locator('select').filter({ hasText: 'No path' }).first().selectOption({ label: 'Staging (Down) -> Nowra' });
  await page.waitForTimeout(400);

  // Screenshot: path selected — shows filtered stops + hint about Auto-fill
  await page.screenshot({ path: `${OUT}/07d-new-train-path-selected.png` });
  console.log('✓ 07d-new-train-path-selected.png');

  // Fill in the first stop's departure time (nth(1) = dep of first stop, nth(0) = arrival)
  const firstDepInput = page.locator('input[type="time"]').nth(1);
  await firstDepInput.fill('09:00');
  await page.waitForTimeout(300);

  // Screenshot: departure entered, Auto-fill button prominent
  await page.screenshot({ path: `${OUT}/07e-new-train-autofill-ready.png` });
  console.log('✓ 07e-new-train-autofill-ready.png');

  // Click ⚡ Auto-fill
  await page.locator('button', { hasText: 'Auto-fill' }).click();
  await page.waitForTimeout(500);

  // Screenshot: all stops filled in
  await page.screenshot({ path: `${OUT}/07f-new-train-autofilled.png` });
  console.log('✓ 07f-new-train-autofilled.png');

  // Close without saving
  await closeAnyPanel();

  // ── 8. Settings panel (MQTT fast clock) ───────────────────────────────────
  // Ensure no panels are blocking the header Settings button
  await closeAnyPanel();
  await page.evaluate(() => {
    const aside = document.querySelector('aside:not(.fixed)');
    if (aside) aside.scrollTop = 0;
  });
  await page.waitForTimeout(300);
  await page.locator('[title="Settings"]:not([title="Edit timetable settings"])').last().click();
  await page.waitForTimeout(700);
  // Blank out the broker URL so it doesn't expose any real server address
  const brokerInput = page.locator('input[placeholder*="wss"], input[placeholder*="ws://"]').first();
  if (await brokerInput.isVisible().catch(() => false)) {
    await brokerInput.fill('wss://your-mqtt-broker:9001/mqtt');
    await page.waitForTimeout(200);
  }
  await page.screenshot({ path: `${OUT}/08-settings-panel.png` });
  console.log('✓ 08-settings-panel.png');

  // Close settings
  await closeAnyPanel();

  // ── 9. Station report (Nowra) ─────────────────────────────────────────────
  await page.getByTitle('Station report').click();
  await page.waitForTimeout(700);
  // Change location to Nowra
  await page.locator('select').nth(1).selectOption({ label: 'Nowra' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/09-station-report.png` });
  console.log('✓ 09-station-report.png');

  await browser.close();
  console.log('\nAll screenshots saved to', OUT);
})();
