const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '..', '..', 'public');
const destDir = path.resolve(__dirname, '..', '..', 'dist', 'public');

const copyDir = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

if (fs.existsSync(srcDir)) {
    if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true, force: true });
    }
    copyDir(srcDir, destDir);
    console.log('Public directory copied successfully.');
} else {
    console.log('Public directory not found, skipping copy.');
}
