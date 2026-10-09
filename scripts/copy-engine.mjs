import { stat, copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const source = 'node_modules/stockfish/bin';
const destination = 'public/engine';
await mkdir(destination, { recursive: true });
for (const name of ['stockfish-19-lite-single.js','stockfish-19-lite-single.wasm']) {
  const file = join(source,name);
  const info = await stat(file);
  if (info.size < 1000) throw Error('Missing engine asset: ' + file);
  await copyFile(file,join(destination,name));
  console.log('Bundled',name,info.size,'bytes');
}
