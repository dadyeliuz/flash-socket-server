const fs = require('fs');
const path = require('path');

function cleanRuffleRuntime() {
  const runtimeDir = path.resolve(process.cwd(), 'tools', 'runtime', 'ruffle');
  const removed = [];

  if (!fs.existsSync(runtimeDir)) {
    return removed;
  }

  const entries = fs.readdirSync(runtimeDir);
  for (const entry of entries) {
    // Preserve downloads and .gitkeep
    if (entry === 'downloads' || entry === '.gitkeep') {
      continue;
    }

    const target = path.join(runtimeDir, entry);
    let stat;
    try {
      stat = fs.statSync(target);
    } catch (_) {
      continue;
    }
    
    let shouldRemove = false;

    if (stat.isDirectory()) {
      if (['package', '_extract', '.backup', 'extensions'].includes(entry)) {
        shouldRemove = true;
      }
    } else {
      const lower = entry.toLowerCase();
      if (
        lower === 'ruffle.js' ||
        lower === 'ruffle.js.map' ||
        lower === 'metadata.json' ||
        lower.endsWith('.wasm') ||
        lower.endsWith('.wasm.map') ||
        (lower.startsWith('core.ruffle.') && (lower.endsWith('.js') || lower.endsWith('.js.map')))
      ) {
        shouldRemove = true;
      }
    }

    if (shouldRemove) {
      fs.rmSync(target, { recursive: true, force: true });
      removed.push(target);
    }
  }

  return removed;
}

if (require.main === module) {
  const removed = cleanRuffleRuntime();
  console.log(`[RUFFLE CLEAN] Removed ${removed.length} Ruffle runtime entries.`);
  for (const item of removed) {
    console.log(` - ${item}`);
  }
}

module.exports = {
  cleanRuffleRuntime,
  runtimeDir: path.resolve(process.cwd(), 'tools', 'runtime', 'ruffle')
};
