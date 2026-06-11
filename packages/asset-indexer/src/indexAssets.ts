import * as fs from 'fs';
import * as path from 'path';
import { ServerConfig, logger, resolveSafePath, safeFileExists } from '@flash-socket-server/core';

export interface AssetReport {
  file: string;
  expectedPath: string;
  found: boolean;
  status: string;
}

/**
 * Scans the user-supplied assets directory and outputs a detailed cleanliness-safe diagnostics report.
 */
export function indexAssets(config: ServerConfig): AssetReport[] {
  logger.info('indexer', `Scanning user-supplied assets directory: "${config.assetsPath}"`);

  if (!fs.existsSync(config.assetsPath)) {
    logger.error('indexer', `Assets directory does not exist! Please ensure it is created at: "${config.assetsPath}"`);
    return [];
  }

  // Define files we expect to find for a complete game run
  const criticalFiles = [
    { name: config.entrySwf, desc: 'Entry point SWF' },
    { name: 'Login.aspx', desc: 'Login XML payload handler (optional)' },
    { name: 'Servers.aspx', desc: 'Server list XML gateway (optional)' },
    { name: 'chat_1.xml', desc: 'Chat pre-defined phrases (optional)' },
    { name: 'lang.aspx%3flang%3d1', desc: 'Hebrew translation list (optional - check Services/Servises)' },
    { name: 'room_20.swf', desc: 'Tel Aviv room SWF asset' }
  ];

  const reports: AssetReport[] = [];

  console.log('\n\x1b[35m==============================================================');
  console.log('            USER-SUPPLIED ASSETS DIAGNOSTICS REPORT           ');
  console.log('==============================================================\x1b[0m');

  for (const item of criticalFiles) {
    let found = false;
    let resolvedPath = '';

    // Check direct match
    const directPath = resolveSafePath(config.assetsPath, item.name);
    if (directPath && safeFileExists(directPath)) {
      found = true;
      resolvedPath = directPath;
    } else {
      // Check common subfolders (Swf, Xmls, Servises, services) as fallback
      const searchDirs = [
        'Swf', 'Xmls', 'Servises', 'services', 
        path.join('Swf', 'AssetsClean', 'Rooms'),
        path.join('Xmls', 'lang'),
        'CLIENT_ASSETS'
      ];
      
      for (const sub of searchDirs) {
        const potentialRel = path.join(sub, item.name);
        const potPath = resolveSafePath(config.assetsPath, potentialRel);
        if (potPath && safeFileExists(potPath)) {
          found = true;
          resolvedPath = potPath;
          break;
        }
      }
    }

    const relDisplay = resolvedPath 
      ? path.relative(config.assetsPath, resolvedPath) 
      : `[NOT FOUND: expected in "${config.assetsPath}"]`;
      
    const statusText = found 
      ? '\x1b[32m[FOUND]\x1b[0m' 
      : '\x1b[33m[MISSING (will fallback or fail)]\x1b[0m';

    console.log(`- \x1b[36m${item.name}\x1b[0m (${item.desc}):`);
    console.log(`  Status: ${statusText}`);
    console.log(`  Resolved: ${relDisplay}`);
    console.log('--------------------------------------------------------------');

    reports.push({
      file: item.name,
      expectedPath: relDisplay,
      found,
      status: found ? 'FOUND' : 'MISSING'
    });
  }

  const foundCount = reports.filter(r => r.found).length;
  console.log(`\x1b[35mSummary: Checked ${reports.length} files. ${foundCount} found, ${reports.length - foundCount} missing.\x1b[0m`);
  console.log('==============================================================\n');

  return reports;
}
