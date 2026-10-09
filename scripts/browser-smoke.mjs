import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
let failed = false;

for (const [label, url] of [
  ['LOCAL BUILT PREVIEW', 'http://127.0.0.1:4173/ChessReview/'],
  ['LIVE GITHUB PAGES', 'https://reidmaxim.github.io/ChessReview/'],
]) {
  console.log('\n========== ' + label + ' ==========');
  const page = await browser.newPage();
  const errors = [];
  const missing = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push('console: ' + message.text());
  });
  page.on('requestfailed', request => {
    missing.push('FAILED ' + request.url() + ' ' + request.failure()?.errorText);
  });
  page.on('response', response => {
    if (response.status() >= 400) missing.push('HTTP ' + response.status() + ' ' + response.url());
  });

  try {
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const html = await page.content();
    console.log('Main document status:', response?.status());
    console.log('Title:', await page.title());
    console.log('HTML script tags:', JSON.stringify(await page.locator('script[src]').evaluateAll(nodes => nodes.map(n => n.getAttribute('src')))));
    console.log('HTML stylesheet tags:', JSON.stringify(await page.locator('link[rel=stylesheet]').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')))));
    console.log('Raw source indicator:', html.includes('src="/src/main.tsx"'));
    const rootText = await page.locator('#root').innerText().catch(() => '<missing root>');
    console.log('Root text length:', rootText.length);
    console.log('Root text start:', rootText.slice(0, 400));
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    console.log('Computed body background:', bg);
    console.log('JS errors:', JSON.stringify(errors));
    console.log('Failed assets:', JSON.stringify(missing));
    if (!rootText.includes('Every move tells')) {
      console.error(label + ' FAILED: app did not mount');
      failed = true;
    } else {
      console.log(label + ' PASSED: ChessReview mounted.');
    }

    if (label === 'LOCAL BUILT PREVIEW') {
      // Check the new empty-home experience and first-move import regression.
      if (!rootText.includes('Ready for a new game') || rootText.includes('Opera Game')) {
        throw new Error('Initial page must be blank with no sample game.');
      }
      await page.locator('.top-import').click();
      await page.locator('#pgn-input').fill('[Event "Smoke Game"]\n\n1. e4 e5 2. Nf3 Nc6 *');
      await page.getByRole('button', { name: 'Load PGN' }).click();
      const selected = (await page.locator('.move-chip.active').textContent())?.trim();
      if (selected !== 'e4') throw new Error('Expected imported game to start on 1. e4; got ' + selected);
      await page.getByRole('button', { name: 'Next move' }).click();
      const next = (await page.locator('.move-chip.active').textContent())?.trim();
      if (next !== 'e5') throw new Error('Expected navigation to 1... e5; got ' + next);
      console.log('REGRESSION PASSED: no sample at startup; PGN import begins at first move; next move works.');
    }
  } catch (e) {
    console.error(label + ' ERROR:', String(e));
    failed = true;
  } finally {
    await page.close();
  }
}

await browser.close();
if (failed) process.exitCode = 1;
