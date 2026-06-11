const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FORBIDDEN_EXTENSIONS = [
  '.swf', '.exe', '.dll', '.so', '.dylib', '.bin',
  '.mp3', '.wav', '.ogg', '.flv', '.as', '.xml',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico',
  '.zip', '.rar', '.7z', '.tar.gz', '.tgz'
];

// List of allowed files that might match extensions but are strictly required
const ALLOWED_FILES = [
  'tsconfig.base.json',
  'tsconfig.json',
  'package.json',
  'pnpm-workspace.yaml'
];

function isForbidden(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath);
  
  if (ALLOWED_FILES.includes(base)) {
    return false;
  }
  
  return FORBIDDEN_EXTENSIONS.includes(ext);
}

function getGitFiles() {
  try {
    // Check if git is installed and inside a repository
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    
    // Get tracked files
    const tracked = execSync('git ls-files', { encoding: 'utf8' })
      .split('\n')
      .map(f => f.trim())
      .filter(Boolean);
      
    // Get staged files
    const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' })
      .split('\n')
      .map(f => f.trim())
      .filter(Boolean);
      
    // Combine unique paths
    return Array.from(new Set([...tracked, ...staged]));
  } catch (err) {
    // Git not available or not inside a repo
    return null;
  }
}

function getFilesRecursively(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      const base = path.basename(filePath);
      if (base !== 'node_modules' && base !== 'dist' && base !== '.git' && base !== '.pnpm-store') {
        getFilesRecursively(filePath, fileList);
      }
    } else {
      fileList.push(path.relative(process.cwd(), filePath));
    }
  }
  return fileList;
}

function validate() {
  console.log('=== [CLEAN-ROOM GUARD] Scanning repository for staged/tracked assets ===');
  
  let filesToScan = getGitFiles();
  let mode = 'Git Index';
  
  if (!filesToScan) {
    console.log('[CLEAN-ROOM GUARD] Git not detected. Scanning workspace directories recursively...');
    filesToScan = getFilesRecursively(process.cwd());
    mode = 'Filesystem Fallback';
  }
  
  const violations = [];
  
  for (const file of filesToScan) {
    if (isForbidden(file)) {
      violations.push(file);
    }
  }
  
  if (violations.length > 0) {
    console.error('\n\x1b[31m===============================================================');
    console.error(' [CRITICAL ERROR] CLEAN-ROOM BOUNDARY VIOLATION DETECTED!    ');
    console.error('===============================================================\x1b[0m');
    console.error(`Mode: ${mode}`);
    console.error('The following forbidden binary/asset files were detected in the workspace:');
    for (const v of violations) {
      console.error(`  - \x1b[33m${v}\x1b[0m`);
    }
    console.error('\n\x1b[36mInstructions:\x1b[0m');
    console.error('  1. DO NOT commit, stage, or keep proprietary binaries or assets inside this repository.');
    console.error('  2. Delete or move these files outside the "flash-socket-server" folder.');
    console.error('  3. If these are user-supplied game assets, place them in the external "CLINET-CLEAN" or custom assets folder.');
    console.error('===============================================================\n');
    process.exit(1);
  }
  
  console.log(`\x1b[32m[CLEAN-ROOM GUARD SUCCESS] Clean-room validated successfully (${filesToScan.length} files scanned via ${mode}).\x1b[0m\n`);
}

if (require.main === module) {
  validate();
}

module.exports = {
  validate,
  isForbidden,
  getGitFiles,
  getFilesRecursively,
  FORBIDDEN_EXTENSIONS,
  ALLOWED_FILES
};
