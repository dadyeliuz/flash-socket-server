const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const manualFallbackMessage =
  'Download the Self Hosted Web Package from Ruffle downloads and extract it to tools/runtime/ruffle';

const releaseApiEndpoints = {
  nightly: 'https://api.github.com/repos/ruffle-rs/ruffle/releases/tags/nightly',
  stable: 'https://api.github.com/repos/ruffle-rs/ruffle/releases/latest'
};

function parseArgs(argv) {
  const args = { channel: 'stable' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--channel') args.channel = argv[++i];
    else if (arg === '--url') args.url = argv[++i];
  }
  return args;
}

function getReleaseApiUrl(channel) {
  return channel === 'nightly' ? releaseApiEndpoints.nightly : releaseApiEndpoints.stable;
}

function getApiHeaders() {
  return {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'flash-socket-server-ruffle-setup'
  };
}

async function fetchJson(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: getApiHeaders(),
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function findSelfHostedAsset(release) {
  const assets = Array.isArray(release && release.assets) ? release.assets : [];
  return assets.find((asset) => typeof asset.name === 'string' && asset.name.endsWith('-web-selfhosted.zip')) || null;
}

async function resolveDownloadConfig(args, fetchImpl = fetch) {
  if (args.url) {
    return {
      channel: 'custom',
      sourceApiUrl: null,
      assetName: path.basename(args.url),
      url: args.url
    };
  }

  const sourceApiUrl = getReleaseApiUrl(args.channel);
  const release = await fetchJson(sourceApiUrl, fetchImpl);
  const asset = findSelfHostedAsset(release);

  if (!asset || !asset.browser_download_url) {
    throw new Error(`GitHub release did not contain a *-web-selfhosted.zip asset for channel "${args.channel}".`);
  }

  return {
    channel: args.channel,
    sourceApiUrl,
    releaseTag: release.tag_name,
    assetName: asset.name,
    url: asset.browser_download_url
  };
}

async function download(url, targetPath, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': 'flash-socket-server-ruffle-setup'
    },
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(targetPath, Buffer.from(arrayBuffer));
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function extractZip(zipPath, targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  if (process.platform === 'win32') {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${targetDir.replace(/'/g, "''")}' -Force`
      ],
      { stdio: 'inherit' }
    );
    return;
  }

  execFileSync('unzip', ['-o', zipPath, '-d', targetDir], { stdio: 'inherit' });
}

function findExtractedRoot(targetDir) {
  if (fs.existsSync(path.join(targetDir, 'ruffle.js'))) {
    return targetDir;
  }

  try {
    const entries = fs.readdirSync(targetDir);
    for (const name of entries) {
      const candidate = path.join(targetDir, name);
      if (fs.statSync(candidate).isDirectory()) {
        if (fs.existsSync(path.join(candidate, 'ruffle.js'))) {
          return candidate;
        }
      }
    }
  } catch (_) {}

  return null;
}

function validateDirectory(dir) {
  if (!fs.existsSync(dir)) {
    return { ok: false, error: `Directory does not exist: ${dir}` };
  }
  
  const files = [];
  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isFile()) {
        files.push(full);
      } else if (entry.isDirectory()) {
        walk(full);
      }
    }
  }
  
  try {
    walk(dir);
  } catch (err) {
    return { ok: false, error: `Failed to walk directory: ${err.message}` };
  }

  const hasJs = files.some(f => path.basename(f).toLowerCase() === 'ruffle.js');
  const hasWasm = files.some(f => path.extname(f).toLowerCase() === '.wasm');

  const missing = [];
  if (!hasJs) missing.push('ruffle.js');
  if (!hasWasm) missing.push('*.wasm');

  if (missing.length > 0) {
    return { ok: false, error: `Missing files: ${missing.join(', ')}` };
  }
  return { ok: true };
}

function assertRuntimeReady(dir) {
  const validation = validateDirectory(dir);
  if (!validation.ok) {
    throw new Error(`Extracted runtime is invalid: ${validation.error}`);
  }
}

function printManualFallback() {
  console.error(manualFallbackMessage);
}

async function setupRuffleRuntime(argv = process.argv.slice(2), options = {}) {
  const args = parseArgs(argv);
  const fetchImpl = options.fetchImpl || fetch;

  const runtimeDir = path.resolve(process.cwd(), 'tools', 'runtime', 'ruffle');
  const downloadsDir = path.join(runtimeDir, 'downloads');
  const packageDir = path.join(runtimeDir, 'package');
  const extractDir = path.join(runtimeDir, '_extract');
  const metadataPath = path.join(runtimeDir, 'metadata.json');

  fs.mkdirSync(downloadsDir, { recursive: true });

  // Stage commit function (copies from extract directory to final locations)
  function commitStagedRuntime(extractedRoot) {
    const filesToMirror = fs.readdirSync(extractedRoot);
    for (const fileName of filesToMirror) {
      if (['downloads', 'package', '_extract', '.gitkeep'].includes(fileName)) {
        continue;
      }
      const source = path.join(extractedRoot, fileName);
      const dest = path.join(runtimeDir, fileName);
      fs.rmSync(dest, { recursive: true, force: true });
      fs.cpSync(source, dest, { recursive: true });
    }

    // Populate/update package directory for offline repairs
    if (extractedRoot !== packageDir) {
      fs.rmSync(packageDir, { recursive: true, force: true });
      fs.mkdirSync(packageDir, { recursive: true });
      fs.cpSync(extractedRoot, packageDir, { recursive: true });
    }

    // Clean up staging
    fs.rmSync(extractDir, { recursive: true, force: true });
  }

  // 1. Self-Repair from packageDir
  if (fs.existsSync(packageDir)) {
    const extractedRoot = findExtractedRoot(packageDir);
    if (extractedRoot) {
      const validation = validateDirectory(extractedRoot);
      if (validation.ok) {
        console.log('[RUFFLE] ruffle.js missing but extracted package exists. Repairing from package...');
        commitStagedRuntime(extractedRoot);
        
        if (!fs.existsSync(metadataPath)) {
          const metadata = {
            channel: 'repaired-package',
            downloadedAt: new Date().toISOString()
          };
          fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        }
        return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      }
    }
  }

  // 2. Self-Repair from zip archive
  let zipPath = null;
  if (fs.existsSync(metadataPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      if (meta.archivePath && fs.existsSync(meta.archivePath)) {
        zipPath = meta.archivePath;
      }
    } catch (_) {}
  }
  if (!zipPath && fs.existsSync(downloadsDir)) {
    try {
      const files = fs.readdirSync(downloadsDir);
      const zipFile = files.find(f => f.endsWith('.zip'));
      if (zipFile) {
        zipPath = path.join(downloadsDir, zipFile);
      }
    } catch (_) {}
  }

  if (zipPath && fs.existsSync(zipPath)) {
    console.log(`[RUFFLE] ruffle.js missing but zip archive exists at ${zipPath}. Repairing from zip...`);
    fs.rmSync(extractDir, { recursive: true, force: true });
    try {
      extractZip(zipPath, extractDir);
      const extractedRoot = findExtractedRoot(extractDir);
      if (extractedRoot) {
        const validation = validateDirectory(extractedRoot);
        if (validation.ok) {
          commitStagedRuntime(extractedRoot);
          
          if (!fs.existsSync(metadataPath)) {
            const metadata = {
              channel: 'repaired-zip',
              archivePath: zipPath,
              downloadedAt: new Date().toISOString()
            };
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
          }
          return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        }
      }
    } catch (err) {
      console.warn(`[RUFFLE] Repair from zip failed: ${err.message}. Retrying download.`);
    } finally {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  }

  // 3. Full download
  try {
    const downloadConfig = await resolveDownloadConfig(args, fetchImpl);
    const zipName = downloadConfig.assetName || 'ruffle-web-selfhosted.zip';
    const activeZipPath = path.join(downloadsDir, zipName);

    await download(downloadConfig.url, activeZipPath, fetchImpl);

    fs.rmSync(extractDir, { recursive: true, force: true });
    extractZip(activeZipPath, extractDir);

    const extractedRoot = findExtractedRoot(extractDir);
    if (!extractedRoot) {
      throw new Error('Downloaded archive did not contain ruffle.js');
    }

    const validation = validateDirectory(extractedRoot);
    if (!validation.ok) {
      throw new Error(`Downloaded runtime is invalid: ${validation.error}`);
    }

    commitStagedRuntime(extractedRoot);

    const metadata = {
      sourceUrl: downloadConfig.url,
      sourceApiUrl: downloadConfig.sourceApiUrl,
      channel: downloadConfig.channel,
      releaseTag: downloadConfig.releaseTag || null,
      assetName: downloadConfig.assetName || path.basename(downloadConfig.url),
      downloadedAt: new Date().toISOString(),
      archivePath: activeZipPath,
      sha256: sha256(activeZipPath)
    };
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    return metadata;
  } catch (error) {
    fs.rmSync(extractDir, { recursive: true, force: true });
    printManualFallback();
    throw error;
  }
}

if (require.main === module) {
  setupRuffleRuntime()
    .then((metadata) => {
      console.log(`Ruffle runtime prepared successfully.`);
      console.log(JSON.stringify(metadata, null, 2));
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exit(1);
    });
}

module.exports = {
  setupRuffleRuntime,
  parseArgs,
  getReleaseApiUrl,
  fetchJson,
  findSelfHostedAsset,
  resolveDownloadConfig,
  download,
  validateDirectory,
  findExtractedRoot,
  runtimeDir: path.resolve(process.cwd(), 'tools', 'runtime', 'ruffle'),
  downloadsDir: path.resolve(process.cwd(), 'tools', 'runtime', 'ruffle', 'downloads'),
  packageDir: path.resolve(process.cwd(), 'tools', 'runtime', 'ruffle', 'package'),
  metadataPath: path.resolve(process.cwd(), 'tools', 'runtime', 'ruffle', 'metadata.json'),
  manualFallbackMessage
};
