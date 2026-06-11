import * as fs from 'fs';
import * as path from 'path';
import { runCompatMatrix, formatConsoleMatrix, formatMogoInspectionReport } from '@flash-socket-server/compat-matrix';

async function main() {
  const args = process.argv.slice(2);
  let loginDir = '';
  let mainDir = '';
  let assetsPath = '';
  let ffdecPath: string | undefined;
  let jsonMode = false;
  let outPath: string | undefined;
  let topLimit: number | undefined;
  let loginGrDir: string | undefined;
  let mogoDir: string | undefined;
  let showCopyForIncompatible = false;
  let strictMode = false;
  let deepMode = false;
  let requireProvenStartup = false;
  let inspectMogoMode = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--login-dir' || arg === '-l') {
      loginDir = args[++i];
    } else if (arg === '--main-dir' || arg === '-m') {
      mainDir = args[++i];
    } else if (arg === '--assets' || arg === '-a') {
      assetsPath = args[++i];
    } else if (arg === '--ffdec') {
      ffdecPath = args[++i];
    } else if (arg === '--json') {
      jsonMode = true;
    } else if (arg === '--out') {
      outPath = args[++i];
    } else if (arg === '--top') {
      topLimit = parseInt(args[++i], 10);
    } else if (arg === '--strict') {
      strictMode = true;
    } else if (arg === '--login-gr-dir') {
      loginGrDir = args[++i];
    } else if (arg === '--mogo-dir') {
      mogoDir = args[++i];
    } else if (arg === '--show-copy-for-incompatible') {
      showCopyForIncompatible = true;
    } else if (arg === '--deep') {
      deepMode = true;
    } else if (arg === '--require-proven-startup') {
      requireProvenStartup = true;
    } else if (arg === '--inspect-mogo') {
      inspectMogoMode = true;
    }
  }

  if (inspectMogoMode) {
    if (!mogoDir && !assetsPath) {
      console.error('\x1b[31m[ERROR] --inspect-mogo requires either --mogo-dir or --assets.\x1b[0m');
      process.exit(1);
    }
  } else {
    if (!loginDir || !mainDir || !assetsPath) {
      console.error('\x1b[31m[ERROR] Missing required parameters: --login-dir, --main-dir, and --assets are all required.\x1b[0m');
      console.log('\nUsage: npm run compat-matrix -- --login-dir <path> --main-dir <path> --assets <path> [--json] [--out <path>] [--ffdec <path>] [--top <N>] [--strict] [--login-gr-dir <path>] [--mogo-dir <path>] [--show-copy-for-incompatible] [--deep] [--require-proven-startup] [--inspect-mogo]');
      process.exit(1);
    }
  }

  try {
    const report = await runCompatMatrix({
      loginDir,
      mainDir,
      assetsPath,
      ffdecPath,
      json: jsonMode,
      outPath,
      top: topLimit,
      strict: strictMode,
      loginGrDir,
      mogoDir,
      showCopyForIncompatible,
      deep: deepMode,
      requireProvenStartup,
      inspectMogo: inspectMogoMode
    });

    let output = '';
    if (jsonMode) {
      output = JSON.stringify(report, null, 2);
      console.log(output);
    } else {
      if (report.mode === 'inspect-mogo') {
        output = formatMogoInspectionReport(report);
      } else {
        output = formatConsoleMatrix(report);
      }
      console.log(output);
    }

    if (outPath) {
      const resolvedOut = path.resolve(outPath);
      const resolvedAssets = assetsPath ? path.resolve(assetsPath) : '';
      if (resolvedAssets && resolvedOut.startsWith(resolvedAssets)) {
        console.error(`\x1b[31m[ERROR] Output file must not be written inside the assets path: "${resolvedAssets}"\x1b[0m`);
        process.exit(1);
      }
      fs.writeFileSync(resolvedOut, output, 'utf8');
      console.log(`\x1b[32m[SUCCESS] Compatibility Matrix Report written to: "${resolvedOut}"\x1b[0m\n`);
    }

  } catch (err: any) {
    console.error(`\x1b[31m[ERROR] Compatibility matrix run failed: ${err.message}\x1b[0m`);
    process.exit(1);
  }
}

main();
