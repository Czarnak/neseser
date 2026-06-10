import { mkdir, copyFile } from 'node:fs/promises';

const dest = new URL('../test-vault/.obsidian/plugins/neseser/', import.meta.url);
await mkdir(dest, { recursive: true });

for (const file of ['main.js', 'manifest.json', 'styles.css']) {
	await copyFile(new URL(`../${file}`, import.meta.url), new URL(file, dest));
}

console.log('Deployed plugin to test-vault/.obsidian/plugins/neseser/');
