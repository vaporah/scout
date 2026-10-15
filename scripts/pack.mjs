import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

/**
 * Package the built extension as a zip for the Chrome Web Store.
 *
 * The store takes a zip of the extension, with `manifest.json` at the *root* of the
 * archive rather than inside a `dist/` folder, so the contents of `dist` are zipped
 * rather than the folder itself. Everything the manifest references is already copied
 * into `dist` by the build, and `dist` is what "Load unpacked" points at too, so the
 * published artefact is byte-for-byte the thing that was tested.
 *
 *   npm run pack
 */

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const output = `scout-${pkg.version}.zip`;

if (!existsSync('dist/manifest.json')) {
  console.error('dist/manifest.json is missing. Run "npm run build" first.');
  process.exit(1);
}

// A zip built from a stale dist is the easiest way to ship the wrong code without
// noticing, so the built manifest is checked against the source before packing.
const built = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
const source = JSON.parse(readFileSync('manifest.json', 'utf8'));
if (built.version !== source.version) {
  console.error(`dist is stale: built ${built.version}, source ${source.version}. Run "npm run build" first.`);
  process.exit(1);
}

/**
 * Write the archive, preferring tools that produce a spec-compliant zip.
 *
 * This matters more than it looks. PowerShell's `Compress-Archive` on Windows writes
 * every entry with a **backslash** separator, where the zip format requires a forward
 * slash, and it also writes a directory entry per folder. Files still open locally,
 * which is why the problem hides, but a store uploader reading those names can reject
 * the archive or unpack it into one flat directory.
 *
 * `zip` is correct everywhere it exists. On Windows the bundled bsdtar is correct too,
 * but only when the members are named explicitly: given `.` it prefixes every entry with
 * `./`, which the store's validator may not resolve.
 */
function pack(output) {
  if (process.platform !== 'win32') {
    try {
      execFileSync('zip', ['-r', '-q', `../${output}`, '.'], { cwd: 'dist', stdio: 'inherit' });
      return 'zip';
    } catch { /* fall through to the next archiver */ }
  }
  try {
    execFileSync('tar', ['-a', '-c', '-f', output, '-C', 'dist', ...readdirSync('dist')], { stdio: 'inherit' });
    return 'tar';
  } catch { /* fall through to the next archiver */ }
  execFileSync('powershell', ['-NoProfile', '-Command',
    `Compress-Archive -Path 'dist/*' -DestinationPath '${output}' -Force`], { stdio: 'inherit' });
  return 'compress-archive';
}

const archiver = pack(output);

const { size } = statSync(output);
console.log(`\n${output}  (${(size / 1024).toFixed(0)} KB, via ${archiver})`);
console.log('manifest.json is at the root of the archive, which is what the store expects.');
if (archiver === 'compress-archive') {
  console.warn('\nWARNING: fell back to Compress-Archive, which writes backslash separators.');
  console.warn('A store upload may reject that archive. Upload from a machine with "zip" or bsdtar');
  console.warn('if the extension fails to upload or unpacks flat.');
}
console.log('Upload it at https://chrome.google.com/webstore/devconsole, or drag it onto');
console.log('chrome://extensions to test that exact build.');
