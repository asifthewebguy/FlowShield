const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

const browser = process.argv[2];

if (!browser || !['chrome', 'firefox'].includes(browser)) {
  console.error('Usage: node build.js <chrome|firefox>');
  process.exit(1);
}

const srcDir = path.join(__dirname, browser);

if (!fs.existsSync(srcDir)) {
  console.error(`Source directory not found: ${srcDir}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(srcDir, 'manifest.json'), 'utf8'));
const version = manifest.version;

const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const outPath = path.join(distDir, `flowshield-${browser}-${version}.zip`);
const output = fs.createWriteStream(outPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const kb = (archive.pointer() / 1024).toFixed(1);
  console.log(`✓ ${outPath} (${kb} KB)`);
});

archive.on('error', (err) => {
  console.error('Build failed:', err.message);
  process.exit(1);
});

archive.pipe(output);
// false = files land at zip root, not inside a subdirectory (required by both stores)
archive.directory(srcDir, false);
archive.finalize();
