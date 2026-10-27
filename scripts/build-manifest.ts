import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const directory = join(process.cwd(), 'media', 'frames');
const manifest: Record<string, string> = {};
for (const file of readdirSync(directory).filter(file => /^\d+_.+\.png$/.test(file))) {
    const match = /^\d+_(.+)\.png$/.exec(file);
    if (match) manifest[match[1]] = file;
}
writeFileSync(join(process.cwd(), 'media', 'frames.json'), `${JSON.stringify(manifest, null, 2)}\n`);
