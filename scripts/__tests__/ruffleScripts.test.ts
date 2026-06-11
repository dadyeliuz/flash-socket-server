import { describe, it, expect, afterEach, beforeEach, afterAll, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const originalCwd = process.cwd();
const repoRoot = path.resolve(__dirname, '..', '..');
const testCwd = path.resolve(repoRoot, 'scripts', '__tests__', 'temp_test_cwd');
const testRuntimeDir = path.join(testCwd, 'tools', 'runtime', 'ruffle');

// Setup the test sandboxed environment before requiring the modules
// so their top-level paths are resolved relative to the testCwd.
fs.mkdirSync(testRuntimeDir, { recursive: true });
process.chdir(testCwd);

const cleanScript = require('../clean-ruffle-runtime');
const setupScript = require('../setup-ruffle-runtime');

describe('Ruffle runtime scripts (Sandboxed)', () => {
  beforeAll(() => {
    // Assert process.cwd() is indeed inside the sandboxed testCwd
    expect(process.cwd()).toBe(testCwd);
  });

  beforeEach(() => {
    expect(process.cwd()).toBe(testCwd);
    fs.mkdirSync(testRuntimeDir, { recursive: true });
  });

  afterEach(() => {
    expect(process.cwd()).toBe(testCwd);
    
    // Explicit safety assertion: ensure we never touch the real repo runtime path
    const realRepoRuntime = path.resolve(repoRoot, 'tools', 'runtime', 'ruffle');
    expect(testRuntimeDir).not.toBe(realRepoRuntime);

    fs.rmSync(testRuntimeDir, { recursive: true, force: true });
  });

  afterAll(() => {
    process.chdir(originalCwd);
    fs.rmSync(testCwd, { recursive: true, force: true });
  });

  it('keeps the runtime path gitignored in the main repo', () => {
    const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
    expect(gitignore).toContain('tools/runtime/ruffle/*');
  });

  it('clean:ruffle removes only target files and preserves downloads and .gitkeep', () => {
    fs.mkdirSync(path.join(testRuntimeDir, 'downloads'), { recursive: true });
    fs.mkdirSync(path.join(testRuntimeDir, 'package'), { recursive: true });
    fs.mkdirSync(path.join(testRuntimeDir, '_extract'), { recursive: true });
    fs.mkdirSync(path.join(testRuntimeDir, '.backup'), { recursive: true });
    fs.writeFileSync(path.join(testRuntimeDir, 'metadata.json'), '{}');
    fs.writeFileSync(path.join(testRuntimeDir, 'ruffle.js'), 'runtime');
    fs.writeFileSync(path.join(testRuntimeDir, 'core.ruffle.wasm'), 'wasm');
    fs.writeFileSync(path.join(testRuntimeDir, 'core.ruffle.1a2b3c.js'), 'hashed-core');
    fs.writeFileSync(path.join(testRuntimeDir, '.gitkeep'), '');

    const removed = cleanScript.cleanRuffleRuntime();

    expect(removed.length).toBeGreaterThan(0);
    // Preserved entries
    expect(fs.existsSync(path.join(testRuntimeDir, 'downloads'))).toBe(true);
    expect(fs.existsSync(path.join(testRuntimeDir, '.gitkeep'))).toBe(true);
    // Deleted entries
    expect(fs.existsSync(path.join(testRuntimeDir, 'package'))).toBe(false);
    expect(fs.existsSync(path.join(testRuntimeDir, '_extract'))).toBe(false);
    expect(fs.existsSync(path.join(testRuntimeDir, '.backup'))).toBe(false);
    expect(fs.existsSync(path.join(testRuntimeDir, 'metadata.json'))).toBe(false);
    expect(fs.existsSync(path.join(testRuntimeDir, 'ruffle.js'))).toBe(false);
    expect(fs.existsSync(path.join(testRuntimeDir, 'core.ruffle.wasm'))).toBe(false);
    expect(fs.existsSync(path.join(testRuntimeDir, 'core.ruffle.1a2b3c.js'))).toBe(false);
  });

  it('resolves self-hosted asset names from GitHub release metadata without hardcoding the zip filename', async () => {
    const fetchMock = async () => ({
      ok: true,
      json: async () => ({
        tag_name: 'nightly',
        assets: [
          { name: 'ruffle-desktop-x86_64.zip', browser_download_url: 'https://example.invalid/desktop.zip' },
          { name: 'ruffle-web-2026-06-05-web-selfhosted.zip', browser_download_url: 'https://example.invalid/web.zip' }
        ]
      })
    });

    const result = await setupScript.resolveDownloadConfig({ channel: 'nightly' }, fetchMock);

    expect(result.channel).toBe('nightly');
    expect(result.assetName).toBe('ruffle-web-2026-06-05-web-selfhosted.zip');
    expect(result.url).toBe('https://example.invalid/web.zip');
    expect(result.sourceApiUrl).toBe('https://api.github.com/repos/ruffle-rs/ruffle/releases/tags/nightly');
  });

  it('prints a clear manual fallback when the GitHub API fails', async () => {
    const fetchMock = async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    });

    const originalError = console.error;
    const messages: string[] = [];
    console.error = (...args: unknown[]) => {
      messages.push(args.map(String).join(' '));
    };

    try {
      await expect(setupScript.setupRuffleRuntime(['--channel', 'nightly'], { fetchImpl: fetchMock })).rejects.toThrow(
        'GitHub API request failed: 404 Not Found'
      );
    } finally {
      console.error = originalError;
    }

    expect(messages.some((message) => message.includes(setupScript.manualFallbackMessage))).toBe(true);
  });

  it('setup:ruffle is idempotent and repairs a partial runtime using local package files', async () => {
    // 1. Create a partial runtime missing ruffle.js but containing wasm
    fs.writeFileSync(path.join(testRuntimeDir, 'core.ruffle.wasm'), 'wasm');

    // 2. Put a valid package staging inside "package" directory
    const testPackageDir = path.join(testRuntimeDir, 'package');
    fs.mkdirSync(testPackageDir, { recursive: true });
    fs.writeFileSync(path.join(testPackageDir, 'ruffle.js'), 'mock-js-code');
    fs.writeFileSync(path.join(testPackageDir, 'core.ruffle.wasm'), 'mock-wasm-code');

    // 3. Run the setup script. It should detect the missing ruffle.js, locate it in package/,
    // repair it, and validate successfully.
    const metadata = await setupScript.setupRuffleRuntime([], {});

    expect(metadata.channel).toBe('repaired-package');
    
    // Assert ruffle.js was repaired/copied to runtime root
    expect(fs.existsSync(path.join(testRuntimeDir, 'ruffle.js'))).toBe(true);
    expect(fs.readFileSync(path.join(testRuntimeDir, 'ruffle.js'), 'utf8')).toBe('mock-js-code');

    // Assert validation helper approves it
    const validation = setupScript.validateDirectory(testRuntimeDir);
    expect(validation.ok).toBe(true);
  });
});
