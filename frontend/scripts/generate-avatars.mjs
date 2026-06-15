import multiavatar from '@multiavatar/multiavatar/esm';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'avatars');

for (let i = 1; i <= 100; i++) {
  const svg = multiavatar(String(i));
  writeFileSync(join(outDir, `${i}.svg`), svg);
}
console.log('Generated 100 avatars');
