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
      await page.locator('#engine-depth').press('Home');
      await page.getByRole('button', { name: 'Start Stockfish analysis' }).click();
      await page.waitForFunction(() => {
        const node = document.querySelector('[data-testid="engine-score"]');
        return node && node.textContent && node.textContent.trim() !== '—';
      }, undefined, { timeout: 60000 });
      const engineScore = (await page.getByTestId('engine-score').innerText()).trim();
      if (!/^[+-]\d+\.\d{2}$|^(White|Black) mate in \d+$|^Mate$/.test(engineScore)) {
        throw new Error('Unexpected Stockfish score format: ' + engineScore);
      }
      console.log('STOCKFISH PASSED: engine returned real evaluation ' + engineScore);
      await page.getByRole('button', { name: 'Pause Stockfish analysis' }).click();
      if (!(await page.getByText('Analysis is paused.', { exact: false }).count())) {
        throw new Error('Analysis pause did not return to standby');
      }
      console.log('STOCKFISH PAUSE PASSED: engine stopped and UI reset.');
      await page.locator('#review-depth').press('Home');
      await page.getByRole('button', { name: 'Run full game review' }).click();
      await page.waitForFunction(() => document.querySelector('.review-estimate-note')?.textContent?.includes('Review complete.'), undefined, { timeout: 90000 });
      const values = await page.locator('.quality-stat strong').allTextContents();
      if (values.reduce((sum, value) => sum + Number(value), 0) !== 4) {
        throw new Error('Full review failed to classify four moves: ' + JSON.stringify(values));
      }
      if (await page.locator('.review-eval-line').count() !== 1) {
        throw new Error('No evaluation graph rendered.');
      }
      console.log('FULL GAME REVIEW PASSED: 5 evaluated positions, 4 classified moves, SVG graph rendered.');
      await page.getByRole('button', { name: 'Open Free Board' }).click();
      if (!await page.getByRole('heading', { name: 'Your analysis sandbox' }).isVisible()) {
        throw Error('Sandbox tab did not open.');
      }
      if (await page.getByRole('button', { name: 'Run full game review' }).count()) {
        throw Error('Engine controls should not be visible in Free Board.');
      }
      const target = await page.locator('.sandbox-panel').count();
      if (!target) throw Error('Sandbox panel missing.');

      const boardBox = await page.locator('cg-board').boundingBox();
      if (!boardBox) throw Error('Free Board drag target missing');
      const point = (file, rank) => ({
        x: boardBox.x + ((file.charCodeAt(0) - 97) + 0.5) * boardBox.width / 8,
        y: boardBox.y + (8 - rank + 0.5) * boardBox.height / 8,
      });
      const from = point('e', 2);
      const dest = point('e', 4);
      console.log('SANDBOX HITTEST BEFORE', JSON.stringify(await page.evaluate(({from,dest}) => ({
        from: document.elementFromPoint(from.x,from.y)?.outerHTML.slice(0,300),
        dest: document.elementFromPoint(dest.x,dest.y)?.outerHTML.slice(0,300),
        box: document.querySelector('cg-board')?.getBoundingClientRect().toJSON(),
      }), {from,dest})));
      await page.mouse.click(from.x,from.y);
      console.log('SANDBOX SELECTED AFTER CLICK', JSON.stringify(await page.evaluate(() => ({
        selected: document.querySelector('cg-board square.selected')?.outerHTML,
        destinations: document.querySelectorAll('cg-board square.move-dest').length,
        dragged: document.querySelector('cg-board piece.dragging')?.outerHTML,
      }))));
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(dest.x, dest.y, { steps: 20 });
      await page.mouse.up();
      const debugBoard = await page.evaluate(() => ({
        selected: document.querySelector('cg-board square.selected')?.getAttribute('class'),
        pieces: document.querySelectorAll('cg-board piece').length,
        moves: document.querySelectorAll('.sandbox-move-chip').length,
        turn: document.querySelector('.sandbox-turn strong')?.textContent,
      }));
      console.log('SANDBOX DRAG DEBUG', JSON.stringify(debugBoard));
      await page.waitForFunction(() => document.querySelector('.sandbox-move-chip')?.textContent?.includes('e4'), undefined, {timeout: 10000});
      await page.getByRole('button', { name: 'Undo sandbox move' }).click();
      if ((await page.locator('.sandbox-turn strong').innerText()) !== 'White to move') throw Error('Sandbox undo failed.');
      await page.getByRole('button', { name: 'Redo sandbox move' }).click();
      if ((await page.locator('.sandbox-turn strong').innerText()) !== 'Black to move') throw Error('Sandbox redo failed.');
      await page.getByRole('button', { name: 'Reset sandbox board' }).click();
      if (await page.locator('.sandbox-move-chip').count()) throw Error('Sandbox reset failed.');
      await page.getByRole('button', { name: 'Open Game Review' }).click();
      if (!(await page.getByText('Smoke Game').count())) throw Error('Imported PGN was lost when switching modes.');
      console.log('FREE BOARD PASSED: legal drag moves, undo/redo/reset and imported game preserved.');
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
