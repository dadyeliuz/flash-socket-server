import * as fs from 'fs';
import * as path from 'path';
import { runDiagnostics, formatConsoleReport } from '@flash-socket-server/compat-doctor';

async function main() {
  const args = process.argv.slice(2);
  let assetsPath = '';
  let flashlogPath: string | undefined;
  let httpLogPath: string | undefined;
  let ffdecPath: string | undefined;
  let jsonMode = false;
  let outPath: string | undefined;

  let compatLoginGraphicsAlias: string | undefined;
  let fullScan = false;
  let runtimeTimeline: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--assets' || arg === '-a') {
      assetsPath = args[++i];
    } else if (arg === '--flashlog') {
      flashlogPath = args[++i];
    } else if (arg === '--http-log') {
      httpLogPath = args[++i];
    } else if (arg === '--ffdec') {
      ffdecPath = args[++i];
    } else if (arg === '--compat-login-graphics-alias') {
      compatLoginGraphicsAlias = args[++i];
    } else if (arg === '--json') {
      jsonMode = true;
    } else if (arg === '--out') {
      outPath = args[++i];
    } else if (arg === '--full-scan') {
      fullScan = true;
    } else if (arg === '--runtime-timeline') {
      runtimeTimeline = args[++i];
    }
  }

  if (!assetsPath) {
    console.error('\x1b[31m[ERROR] Missing required parameter: --assets <path>\x1b[0m');
    console.log('\nUsage: npm run doctor -- --assets <assets_dir> [--flashlog <path>] [--http-log <path>] [--ffdec <path>] [--compat-login-graphics-alias <alias>] [--json] [--out <report_path>] [--full-scan]');
    process.exit(1);
  }

  try {
    const report = await runDiagnostics({
      assetsPath,
      flashlogPath,
      httpLogPath,
      ffdecPath,
      json: jsonMode,
      compatLoginGraphicsAlias,
      fullScan,
      runtimeTimeline
    });

    let output = '';
    if (jsonMode) {
      output = JSON.stringify(report, null, 2);
      console.log(output);
    } else {
      output = formatConsoleReport(report);
      console.log(output);
    }

    if (outPath) {
      const resolvedOut = path.resolve(outPath);
      // Make sure we never write to assetsPath
      const resolvedAssets = path.resolve(assetsPath);
      if (resolvedOut.startsWith(resolvedAssets)) {
        console.error(`\x1b[31m[ERROR] Output file must not be written inside the assets path: "${resolvedAssets}"\x1b[0m`);
        process.exit(1);
      }
      fs.writeFileSync(resolvedOut, output, 'utf8');
      console.log(`\x1b[32m[SUCCESS] Report written to: "${resolvedOut}"\x1b[0m\n`);
    }

  } catch (err: any) {
    console.error(`\x1b[31m[ERROR] Diagnostics run failed: ${err.message}\x1b[0m`);
    process.exit(1);
  }
}

main();
