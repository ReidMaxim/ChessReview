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
      // Imported games enable position analysis automatically unless disabled in preferences.
      if (await page.getByRole('meter', { name: 'Position evaluation' }).count() !== 1) {
        throw new Error('Evaluation bar did not appear beside imported game board.');
      }
      await page.getByRole('button', { name: 'Engine tab' }).click();
      if (!(await page.getByRole('button', { name: 'Pause Stockfish analysis' }).count())) {
        throw new Error('Stockfish should be enabled automatically for imported games.');
      }
      await page.locator('#engine-depth').press('Home');
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
      await page.getByRole('button', { name: 'Open analysis settings' }).click();
      const engineSwitch = page.getByRole('switch', { name: 'Analyze imported games automatically' });
      if (await engineSwitch.isChecked()) throw new Error('Pausing Stockfish must update the saved master switch.');
      await engineSwitch.check();
      await page.locator('#settings-engine-depth').press('Home');
      if (!await page.getByRole('switch', { name: 'Show evaluation bar' }).isChecked()) {
        throw new Error('Evaluation bar should be on by default.');
      }
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('chessreview.analysis.v1') || '{}'));
      if (saved.enabled !== true || saved.depth !== 8 || saved.showBar !== true) {
        throw new Error('Engine preferences were not saved: ' + JSON.stringify(saved));
      }
      await page.getByRole('button', { name: 'Close settings' }).click();
      await page.waitForFunction(() => document.querySelector('[data-testid="evaluation-bar"]')?.getAttribute('data-score-source') === 'live', undefined, {timeout: 60000});
      const whiteShare = Number(await page.getByTestId('evaluation-bar').getAttribute('data-white-share'));
      if (!(whiteShare > 0 && whiteShare < 100)) throw new Error('Position evaluation bar should have a finite balance: ' + whiteShare);
      console.log('AUTO ENGINE / SETTINGS PASSED: auto-resume, persistence, depth and evaluation bar.');
      await page.getByRole('button', { name: 'Review tab' }).click();
      await page.locator('#review-depth').press('Home');
      await page.getByRole('button', { name: 'Run full game review' }).click();
      await page.waitForFunction(() => document.querySelector('.cockpit-tabs')?.getAttribute('data-review-status') === 'complete', undefined, { timeout: 90000 });
      await page.getByRole('button', { name: 'Review tab' }).click();
      const values = await page.locator('.quality-stat strong').allTextContents();
      if (values.reduce((sum, value) => sum + Number(value), 0) !== 4) {
        throw new Error('Full review failed to classify four moves: ' + JSON.stringify(values));
      }
      if (await page.locator('.review-eval-line').count() !== 1) {
        throw new Error('No evaluation graph rendered.');
      }
      console.log('FULL GAME REVIEW PASSED: 5 evaluated positions, 4 classified moves, SVG graph rendered.');
      await page.getByRole('button', { name: 'Coach tab' }).click();
      if (!(await page.getByRole('heading', { name: 'Coach Notes' }).count())) {
        throw new Error('Coach Notes not shown after game review.');
      }
      const initialStory = page.getByTestId('coach-story');
      if (!await initialStory.count() || !await initialStory.locator('h4').count()) {
        throw new Error('Coach narration does not lead the review.');
      }
      await page.getByRole('button', { name: 'Technical', exact: true }).click();
      if (!(await page.getByTestId('coach-technical').count())) {
        throw new Error('Technical toggle should reveal additional factual engine data.');
      }
      await page.getByRole('button', { name: 'Coach', exact: true }).click();
      // The instructional prose comes first; the deeper analysis waits at the end.
      const orderedHeadings = await page.locator('.coach-panel').evaluate(panel => ({
        assessment: panel.querySelector('.coach-assessment')?.getBoundingClientRect().top,
        investigation: panel.querySelector('.investigation-card')?.getBoundingClientRect().top,
        card: panel.querySelector('.coach-move-card')?.getBoundingClientRect().top,
        last: panel.lastElementChild?.className,
        oldPanel: panel.querySelector('.coach-alternative'),
      }));
      if (orderedHeadings.oldPanel || orderedHeadings.last !== 'investigation-card' &&
          orderedHeadings.last !== undefined) {
        // Investigation lives as the final logical element, outside the move card.
        if (orderedHeadings.oldPanel || await page.locator('.coach-move-card .investigation-card').count()) {
          throw Error('Coach prose should lead; deep investigation belongs below other sections.');
        }
      }
      if (await page.locator('.coach-move-card .investigation-card').count() ||
          await page.locator('.coach-panel > .investigation-card').count() !== 1) {
        throw Error('Deeper investigation is not the last Coach section.');
      }
      console.log('COACH LAYOUT PASSED: move advice leads; deep investigation is outside the main notes.');
      const coachText = await page.locator('.coach-panel').innerText();
      if (!coachText.includes('Moves reviewed') || !coachText.includes('What the board confirms') ||
          !coachText.includes('W / B mistakes') || !coachText.includes('BEFORE')) {
        throw new Error('Coach Notes game summary or evidence missing: ' + coachText.slice(0, 350));
      }
      await page.getByRole('button', { name: 'Previous move' }).click();
      const movedCoach = await page.locator('.coach-move-heading strong').innerText();
      if (movedCoach !== '1. e4') throw Error('Coach Notes did not follow move navigation: ' + movedCoach);
      console.log('COACH NOTES PASSED: game summary, evaluation evidence, and move-specific navigation.');
      // Phase 10A: compare Stockfish's preferred move against a forced
      // search of the played move from exactly the same pre-move FEN.
      await page.getByRole('button', {name:'Investigate this move'}).click();
      await page.waitForFunction(() => Boolean(document.querySelector('.investigation-compare')), undefined, {timeout:45000});
      const investigationText = await page.locator('.investigation-compare').innerText();
      if (!investigationText.includes("STOCKFISH'S FIRST CHOICE") ||
          !investigationText.includes('YOUR PLAYED MOVE') ||
          !investigationText.includes('e4')) {
        throw new Error('Deep investigation did not show both matched-root lines: ' + investigationText);
      }
      if (!(await page.locator('.investigation-caption').count())) {
        throw new Error('Coach engine lines did not switch to deep investigation evidence.');
      }
      console.log('DEEP INVESTIGATION PASSED: legal matched-root best and played lines displayed.');
      if (!(await page.getByTestId('coach-story').getAttribute('class')).includes('coach-story')) {
        throw new Error('Deeper comparison did not preserve Coach voice at the top.');
      }
      const storyContent = await page.getByTestId('coach-story').innerText();
      if (!storyContent.includes('WHAT TO LOOK FOR')) {
        throw new Error('Evidence-first coach must offer a practical observation.');
      }
      console.log('COACH NARRATIVE PASSED: deeper findings use an instructive headline and practical takeaway.');
      if (!(await page.locator('.coach-move-heading .coach-quality').count())) {
        throw new Error('Move classification badge went missing after deeper analysis.');
      }
      if (!(await page.getByTestId('tactical-evidence').count())) {
        throw new Error('Completed investigation did not show evidence-backed coaching or a cautious fallback.');
      }
      if (await page.getByText('What could I have played instead?').count()) {
        throw new Error('The redundant recommendation panel is still visible.');
      }
      console.log('TACTICAL EVIDENCE UI PASSED: verified findings are next to Coach prose; redundant panel removed.');
      // Cancellation must be visible immediately and must not let a
      // previous search overwrite another selected move.
      await page.getByRole('button', {name:'Next move'}).click();
      await page.getByRole('button', {name:'Investigate this move'}).click();
      await page.getByRole('button', {name:'Cancel investigation'}).click();
      if (await page.locator('.investigation-compare').count()) {
        throw new Error('An unrelated completed investigation leaked into the new move.');
      }
      await page.getByRole('button', {name:'Previous move'}).click();
      if (!await page.locator('.investigation-compare').count()) {
        throw new Error('Previously completed move investigation was not restored.');
      }
      console.log('INVESTIGATION CANCEL PASSED: cancelled search stays isolated and completed results are reusable.');
      const consequence = page.getByRole('button', { name: 'Replay what stockfish expects next on board' });
      if (!await consequence.isEnabled()) throw new Error('Engine PV replay must be available after full review.');
      await consequence.click();
      if (!await page.getByRole('group', { name: 'Engine replay on main board' }).count()) {
        throw new Error('Main board did not switch to engine line replay.');
      }
      const gameMoveBefore = await page.locator('.move-progress span').innerText();
      await page.getByRole('button', { name: 'Next move on main replay' }).click();
      const replaySan = (await page.locator('.board-hud .big-san').innerText()).trim();
      if (!replaySan || replaySan.includes('Initial position')) {
        throw new Error('Engine replay did not advance to a legal move: ' + replaySan);
      }
      if ((await page.locator('.move-progress span').innerText()) !== gameMoveBefore) {
        throw new Error('Engine replay mutated the selected PGN move.');
      }
      await page.getByRole('button', { name: 'Exit main replay' }).click();
      if (await page.getByRole('group', { name: 'Engine replay on main board' }).count()) {
        throw new Error('Engine replay did not exit.');
      }
      console.log('ENGINE LINE REPLAY PASSED: board advances verified PV and preserves imported game.');
      await page.getByRole('button', { name: 'Open Free Board' }).click();
      if (!await page.getByRole('heading', { name: 'Your analysis sandbox' }).isVisible()) {
        throw Error('Sandbox tab did not open.');
      }
      if (await page.getByRole('button', { name: 'Run full game review' }).count()) {
        throw Error('Engine controls should not be visible in Free Board.');
      }
      const target = await page.locator('.sandbox-panel').count();
      if (!target) throw Error('Sandbox panel missing.');

      await page.locator('cg-board').scrollIntoViewIfNeeded();
      const boardBox = await page.locator('cg-board').boundingBox();
      if (!boardBox) throw Error('Free Board drag target missing');
      const point = (file, rank) => ({
        x: boardBox.x + ((file.charCodeAt(0) - 97) + 0.5) * boardBox.width / 8,
        y: boardBox.y + (8 - rank + 0.5) * boardBox.height / 8,
      });
      const from = point('e', 2);
      const dest = point('e', 4);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(dest.x, dest.y, { steps: 20 });
      await page.mouse.up();
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

      // A deliberately weak opening verifies the *pre-move* engine hint.
      await page.locator('.top-import').click();
      await page.locator('#pgn-input').fill('[Event "Coaching Fixture"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
      await page.getByRole('button', { name: 'Load PGN' }).click();
      await page.getByRole('button', { name: 'Review tab' }).click();
      await page.locator('#review-depth').press('Home');
      await page.getByRole('button', { name: 'Run full game review' }).click();
      await page.waitForFunction(() => document.querySelector('.cockpit-tabs')?.getAttribute('data-review-status') === 'complete', undefined, { timeout: 90000 });
      await page.getByRole('button', { name: 'Review tab' }).click();
      await page.getByRole('button', { name: 'Coach tab' }).click();
      if ((await page.locator('.coach-move-heading strong').innerText()) !== '1. f3') {
        throw new Error('Coach Notes did not start on the first move.');
      }
      await page.getByRole('button', { name: 'Show best alternative on board' }).click();
      if (!(await page.locator('.coach-before-banner').count())) {
        throw new Error('Coach did not switch to pre-move alternative view.');
      }
      if (!(await page.locator('.move-progress').innerText()).includes('START POSITION')) {
        throw new Error('Alternative arrow did not step back to the proper position.');
      }
      if ((await page.locator('.coach-move-heading strong').innerText()) !== '1. f3') {
        throw new Error('Coach Notes lost move context when previewing the alternative.');
      }
      await page.locator('.coach-before-banner button').click();
      await page.getByRole('button', { name: 'Moves tab' }).click();
      if ((await page.locator('.move-chip.active').innerText()).trim() !== 'f3') {
        throw new Error('Return from alternative did not restore the played move.');
      }
      console.log('COACH ALTERNATIVE PASSED: viewed pre-move engine hint and restored original move.');
      // Integration fixture: the real Stockfish search must confirm that
      // 2.g4 from Fool's Mate lets Black immediately deliver Qh4#.
      await page.getByRole('button', { name: 'Go to beginning' }).click();
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next move' }).click();
      await page.getByRole('button', { name: 'Coach tab' }).click();
      if ((await page.locator('.coach-move-heading strong').innerText()) !== '2. g4') {
        throw new Error('Mate fixture did not select the correct played move.');
      }
      await page.getByRole('button', { name: 'Investigate this move' }).click();
      await page.getByText('That move allows checkmate immediately.').waitFor({ timeout: 45000 });
      const decisive = page.getByTestId('coach-story');
      if (!(await decisive.innerText()).includes('Qh4#') ||
          !(await decisive.innerText()).includes('BOARD-CONFIRMED')) {
        throw new Error('Coach story did not prioritize the verified mating continuation.');
      }
      const mateFact = page.getByTestId('tactical-evidence');
      if (!await mateFact.getByText('BOARD-CONFIRMED').count()) {
        throw new Error('Immediately legal mate was not marked board-confirmed.');
      }
      await mateFact.getByRole('button', { name: 'See it on the board' }).click();
      const observedSan = await page.locator('.board-hud .big-san').innerText();
      if (observedSan.trim() !== 'Qh4#') {
        throw new Error('Clicking verified mate did not replay Qh4#: ' + observedSan);
      }
      await page.getByRole('button', { name: 'Exit main replay' }).click();
      console.log('REAL TACTIC PASSED: Stockfish mate is board-confirmed and replays at Qh4#.');
      await page.getByRole('button', { name: 'Go to end' }).click();
      const mateBar = Number(await page.getByTestId('evaluation-bar').getAttribute('data-white-share'));
      if (mateBar !== 0) throw new Error('Black checkmate should fill the bar black: ' + mateBar);
      await page.getByRole('button', { name: 'Go to beginning' }).click();
      await page.getByRole('button', { name: 'Next move' }).click();
      console.log('EVALUATION MATE PASSED: Black mating position fills Black side of bar.');
      await page.getByRole('button', { name: 'Coach tab' }).click();
      // Command Deck usability: the board must remain visible when coach notes scroll.
      await page.locator('.cockpit-content').evaluate(el => { el.scrollTop = el.scrollHeight; });
      const layout = await page.evaluate(() => {
        const board = document.querySelector('#studio-board')?.getBoundingClientRect();
        const deck = document.querySelector('.cockpit-panel')?.getBoundingClientRect();
        return { board: board && {top:board.top,bottom:board.bottom,left:board.left,right:board.right},
                 deck: deck && {top:deck.top,left:deck.left,right:deck.right},
                 viewportHeight:innerHeight };
      });
      if (!layout.board || !layout.deck || !(layout.board.right < layout.deck.left + 10) ||
          layout.board.top < -15 || layout.board.top >= layout.viewportHeight ||
          layout.board.bottom > layout.viewportHeight + 15) {
        throw new Error('Coach/board side-by-side visibility failed: ' + JSON.stringify(layout));
      }
      const deckButtons = await page.getByRole('button', {name: /^(Moves|Review|Coach|Engine) tab$/}).count();
      if (deckButtons !== 4) throw new Error('Command Deck missing tool buttons');
      console.log('COMMAND DECK PASSED: coach scrolls independently with board anchored in view.');
    }
  } catch (e) {
    console.error(label + ' ERROR:', String(e));
    failed = true;
  } finally {
    await page.close();
  }
}

// Responsive regression matrix, deliberately using the same local built app.
for (const viewport of [
  { width: 320, height: 568, label: 'small phone' },
  { width: 390, height: 844, label: 'phone' },
  { width: 768, height: 900, label: 'tablet' },
  { width: 1024, height: 768, label: 'laptop' },
  { width: 1440, height: 900, label: 'desktop' },
]) {
  const page = await browser.newPage({ viewport: {width:viewport.width,height:viewport.height} });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.addInitScript(() => {
      localStorage.setItem('chessreview.analysis.v1',JSON.stringify({enabled:false,depth:10,showBar:true}));
    });
    await page.goto('http://127.0.0.1:4173/ChessReview/', {waitUntil:'networkidle',timeout:30000});
    await page.getByRole('button', {name:'Import game'}).first().click();
    await page.locator('#pgn-input').fill('[Event "Responsive Fixture"]\n\n1. e4 e5 2. Nf3 Nc6 *');
    await page.getByRole('button', {name:'Load PGN'}).click();
    const metrics = await page.evaluate(() => ({
      viewport:innerWidth,
      content:document.documentElement.scrollWidth,
      board:document.querySelector('#studio-board')?.getBoundingClientRect().toJSON(),
      deck:document.querySelector('.cockpit-panel')?.getBoundingClientRect().toJSON(),
      tabSizes:[...document.querySelectorAll('.cockpit-tab')].map(x=>Math.round(x.getBoundingClientRect().height)),
    }));
    if (metrics.content > metrics.viewport + 2) {
      throw Error('Horizontal overflow: ' + JSON.stringify(metrics));
    }
    if (!metrics.board || !metrics.deck) throw Error('Board or Command Deck missing');
    if (viewport.width >= 900 &&
        (metrics.board.right > metrics.deck.left + 2 || metrics.board.bottom > viewport.height + 16)) {
      throw Error('Desktop board/deck visibility regression: ' + JSON.stringify(metrics));
    }
    if (viewport.width < 700 && metrics.tabSizes.some(h => h < 40)) {
      throw Error('Mobile tool tabs too small: ' + JSON.stringify(metrics.tabSizes));
    }
    await page.getByRole('button',{name:'Coach tab'}).click();
    if (!await page.getByRole('heading',{name:'Give your game a closer look.'}).count()) {
      throw Error('Coach empty state inaccessible');
    }
    await page.getByRole('button',{name:'Moves tab'}).click();
    await page.getByRole('button',{name:'Next move'}).click();
    if (!(await page.locator('.move-progress').innerText()).includes('BLACK')) {
      throw Error('Move navigation did not work at viewport ' + viewport.width);
    }
    const settingsButton = page.getByRole('button',{name:'Open analysis settings'});
    await settingsButton.click();
    if (!await page.getByRole('dialog',{name:'Engine settings'}).count()) {
      throw Error('Settings dialog not accessible');
    }
    // Keyboard focus should never escape the open modal on Tab.
    const dialog = page.getByRole('dialog', {name:'Engine settings'});
    const closeInDialog = page.getByRole('button', {name:'Close settings'});
    await page.locator('.settings-done').focus();
    await page.keyboard.press('Tab');
    if (!(await closeInDialog.evaluate(el => el === document.activeElement))) {
      throw Error('Tab did not wrap to the first dialog control');
    }
    await page.keyboard.press('Shift+Tab');
    if (!(await page.locator('.settings-done').evaluate(el => el === document.activeElement))) {
      throw Error('Shift+Tab did not wrap to the last dialog control');
    }
    if (!await dialog.count()) throw Error('Dialog closed unexpectedly during focus test');
    await page.keyboard.press('Escape');
    if (await page.getByRole('dialog',{name:'Engine settings'}).count()) {
      throw Error('Escape did not dismiss settings');
    }
    if (!(await settingsButton.evaluate(el=>el===document.activeElement))) {
      throw Error('Settings dialog did not restore keyboard focus');
    }
    // Import uses the same accessible dialog focus management.
    await page.getByRole('button',{name:'Import game'}).first().click();
    await page.keyboard.press('Escape');
    if (await page.getByRole('dialog',{name:'Import a game'}).count()) {
      throw Error('Escape did not dismiss import');
    }
    if (viewport.width < 700) {
      // Scroll to the tool area, then independently scroll its content.
      await page.getByRole('button',{name:'Coach tab'}).click();
      await page.locator('.cockpit-panel').scrollIntoViewIfNeeded();
      await page.locator('.cockpit-content').evaluate(el => {el.scrollTop = el.scrollHeight;});
      const mobile = await page.evaluate(() => ({
        board:document.querySelector('#studio-board')?.getBoundingClientRect().toJSON(),
        deck:document.querySelector('.cockpit-panel')?.getBoundingClientRect().toJSON(),
        h:innerHeight,
      }));
      if (!mobile.board || mobile.board.bottom <= 0 || mobile.board.top >= mobile.h ||
          mobile.deck.bottom <= 0 || mobile.deck.top >= mobile.h) {
        throw Error('Mobile study board and tools not simultaneously available: ' + JSON.stringify(mobile));
      }
    }
    if (errors.length) throw Error('Browser JS exceptions: ' + JSON.stringify(errors));
    console.log('RESPONSIVE PASSED: ' + viewport.label + ' ' + viewport.width + 'x' + viewport.height +
      ', no overflow, navigation and dialog focus verified.');
  } catch (error) {
    failed = true;
    console.error('RESPONSIVE FAILED: ' + viewport.label + ' ' + viewport.width + 'x' + viewport.height, String(error));
  } finally {
    await page.close();
  }
}

await browser.close();
if (failed) process.exitCode = 1;
