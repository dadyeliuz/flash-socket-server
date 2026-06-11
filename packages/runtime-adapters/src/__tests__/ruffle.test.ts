import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { resolveRuffleRuntimeDir, ServerConfig } from '@flash-socket-server/core';
import { RuffleLocalAdapter } from '../ruffle';

describe('RuffleLocalAdapter runtime path resolution', () => {
  const originalCwd = process.cwd();
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const cliWorkdir = path.join(repoRoot, 'apps', 'cli');
  const defaultRuntimeDir = path.join(repoRoot, 'tools', 'runtime', 'ruffle');
  const overrideRuntimeDir = path.join(repoRoot, 'tools', 'runtime', 'ruffle-override-test');
  const bogusCliRuntimeDir = path.join(cliWorkdir, 'tools', 'runtime', 'ruffle');
  const repoRootTestWasm = path.join(defaultRuntimeDir, 'adapter-regression-hashed.wasm');
  const repoRootRuffleJs = path.join(defaultRuntimeDir, 'ruffle.js');
  let originalRepoRootRuffleJs: Buffer | null = null;
  let repoRootRuntimeSeeded = false;

  const baseConfig: ServerConfig = {
    httpPort: 8080,
    socketPort: 9339,
    policyPort: 843,
    assetsPath: repoRoot,
    runtimeMode: 'ruffle-local',
    entrySwf: 'Mogo.swf',
    publicHost: 'localhost',
    acceptAnyLogin: true,
    defaultUserModerator: true,
    sendRoomListAfterLogin: false,
    defaultRoomName: 'room_20',
    defaultRoomId: 1,
    verboseHttp: false,
    debugAssetsPath: path.join(repoRoot, 'debug-assets'),
    ruffleRuntimeDir: null,
    compatFixLanguageXml: true,
    compatLoginGraphicsAlias: null,
    sendLoginExtensionAfterLogOk: false,
    compatLoginFirstLoadingScreensMode: 'clean-single',
    defaultLanguage: 4,
    blueboxLoginExtensionOnly: false,
    blueboxLoginMode: 'deferred',
    flashDebug: true,
    serverList: true,
    staticRoomFirstRoomDelay: 0
  };

  function seedRuntime(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'ruffle.js'), 'runtime');
    fs.writeFileSync(path.join(dir, 'stub.wasm'), 'wasm');
  }

  function cleanupRuntime(dir: string) {
    fs.rmSync(path.join(dir, 'ruffle.js'), { force: true });
    fs.rmSync(path.join(dir, 'stub.wasm'), { force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }

  function seedRepoRootRuntime() {
    fs.mkdirSync(defaultRuntimeDir, { recursive: true });
    originalRepoRootRuffleJs = fs.existsSync(repoRootRuffleJs) ? fs.readFileSync(repoRootRuffleJs) : null;
    repoRootRuntimeSeeded = true;
    fs.writeFileSync(repoRootRuffleJs, 'runtime');
    fs.writeFileSync(repoRootTestWasm, 'wasm');
  }

  function restoreRepoRootRuntime() {
    if (!repoRootRuntimeSeeded) {
      return;
    }

    if (originalRepoRootRuffleJs) {
      fs.writeFileSync(repoRootRuffleJs, originalRepoRootRuffleJs);
    } else {
      fs.rmSync(repoRootRuffleJs, { force: true });
    }

    fs.rmSync(repoRootTestWasm, { force: true });
    originalRepoRootRuffleJs = null;
    repoRootRuntimeSeeded = false;
  }

  beforeEach(() => {
    process.chdir(cliWorkdir);
    cleanupRuntime(bogusCliRuntimeDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    restoreRepoRootRuntime();
    cleanupRuntime(overrideRuntimeDir);
    cleanupRuntime(bogusCliRuntimeDir);
  });

  it('resolves the default runtime directory from repo root even when invoked from apps/cli', () => {
    const runtimeDir = resolveRuffleRuntimeDir(baseConfig, path.join(repoRoot, 'packages', 'runtime-adapters', 'dist'));
    expect(runtimeDir).toBe(defaultRuntimeDir);
    expect(runtimeDir).not.toBe(bogusCliRuntimeDir);
  });

  it('resolves the same repo-root runtime from nested http-gateway dist route paths', () => {
    const adapterRuntimeDir = resolveRuffleRuntimeDir(baseConfig, path.join(repoRoot, 'packages', 'runtime-adapters', 'dist'));
    const gatewayRuntimeDir = resolveRuffleRuntimeDir(baseConfig, path.join(repoRoot, 'packages', 'http-gateway', 'dist', 'routes'));
    expect(adapterRuntimeDir).toBe(defaultRuntimeDir);
    expect(gatewayRuntimeDir).toBe(adapterRuntimeDir);
    expect(gatewayRuntimeDir).not.toBe(bogusCliRuntimeDir);
  });

  it('initializes with ruffle.js and a hashed wasm in the repo-root runtime from apps/cli', async () => {
    seedRepoRootRuntime();

    const adapter = new RuffleLocalAdapter();
    await expect(adapter.initialize(baseConfig)).resolves.toBeUndefined();
  });

  it('accepts the ruffleRuntimeDir override', async () => {
    seedRuntime(overrideRuntimeDir);

    const adapter = new RuffleLocalAdapter();
    await expect(
      adapter.initialize({
        ...baseConfig,
        ruffleRuntimeDir: overrideRuntimeDir
      })
    ).resolves.toBeUndefined();
  });

  it('accepts recursively discovered ruffle.js and wasm assets in the override runtime', async () => {
    const nestedDir = path.join(overrideRuntimeDir, 'nested', 'runtime');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(nestedDir, 'ruffle.js'), 'runtime');
    fs.writeFileSync(path.join(nestedDir, 'hashed-runtime.wasm'), 'wasm');

    const adapter = new RuffleLocalAdapter();
    await expect(
      adapter.initialize({
        ...baseConfig,
        ruffleRuntimeDir: overrideRuntimeDir
      })
    ).resolves.toBeUndefined();
  });
});
