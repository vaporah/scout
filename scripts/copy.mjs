import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

await mkdir('dist', { recursive: true });

// package.json is the single source of truth for the version. Stamp it into the
// shipped manifest so the number shown in chrome://extensions never drifts.
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
manifest.version = pkg.version;
await writeFile('dist/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);

for (const file of ['dashboard.html', 'popup.html', 'styles.css', 'live.css', 'axiom-pulse.css', 'riskAlerts.css', 'icon.svg', 'scout-raccoon-logo.png', 'icon-16.png', 'icon-32.png', 'icon-48.png', 'icon-128.png']) {
  await cp(file, `dist/${file}`);
}
for (const file of ['dist/src/overlay.js', 'dist/overlay.css']) await rm(file, { force: true });
