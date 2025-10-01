#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const versionFile = path.join(__dirname, '..', 'version.json');
const versionData = JSON.parse(fs.readFileSync(versionFile, 'utf8'));

// Parse current version
const [major, minor, patch] = versionData.version.split('.').map(Number);

// Increment patch version
const newVersion = `${major}.${minor}.${patch + 1}`;

// Update version file
versionData.version = newVersion;
fs.writeFileSync(versionFile, JSON.stringify(versionData, null, 2) + '\n');

console.log(`Version incremented: ${versionData.version} → ${newVersion}`);

// Git add and commit
try {
  execSync('git add version.json', { stdio: 'inherit' });
  execSync(`git commit -m "Bump version to ${newVersion}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"`, { stdio: 'inherit' });

  console.log(`\nCommitted version ${newVersion}`);
  console.log('\nTo push to GitHub, run: git push origin main');
} catch (error) {
  console.error('Error committing version:', error.message);
  process.exit(1);
}
