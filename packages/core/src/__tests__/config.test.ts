import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../config';
import * as path from 'path';

describe('Configuration Loader', () => {
  const originalArgv = process.argv;
  const originalEnv = process.env;

  beforeEach(() => {
    process.argv = [...originalArgv];
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
  });

  it('should parse --verbose-http and --debug-assets correctly', () => {
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--verbose-http',
      '--debug-assets',
      'C:\\PROJ\\sfs-emu\\debug-assets'
    ];

    const config = loadConfig();
    expect(config.verboseHttp).toBe(true);
    expect(config.debugAssetsPath).toBe(path.resolve('C:\\PROJ\\sfs-emu\\debug-assets'));
    expect(config.assetsPath).toBe(path.resolve('C:\\PROJ\\sfs-emu\\CLINET-CLEAN'));
  });

  it('should parse room back-sound map from CLI and env with default empty', () => {
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN'
    ];
    let config = loadConfig();
    expect(config.roomBackSoundMap).toEqual({});

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--room-back-sound',
      'room_60=http://localhost:8080/Sound/mcCabin.mp3'
    ];
    config = loadConfig();
    expect(config.roomBackSoundMap).toEqual({
      room_60: 'http://localhost:8080/Sound/mcCabin.mp3'
    });

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN'
    ];
    process.env.FSS_ROOM_BACK_SOUND_MAP = '{"room_60":"http://localhost:8080/Sound/mcCabin.mp3"}';
    config = loadConfig();
    expect(config.roomBackSoundMap).toEqual({
      room_60: 'http://localhost:8080/Sound/mcCabin.mp3'
    });
  });

  it('should parse verbose BlueBox poll logging from CLI and env with default false', () => {
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN'
    ];
    let config = loadConfig();
    expect(config.verboseBlueboxPolls).toBe(false);

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--verbose-bluebox-polls'
    ];
    config = loadConfig();
    expect(config.verboseBlueboxPolls).toBe(true);

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN'
    ];
    process.env.FSS_VERBOSE_BLUEBOX_POLLS = '1';
    config = loadConfig();
    expect(config.verboseBlueboxPolls).toBe(true);
  });

  it('should parse verbose Ruffle event logging from CLI and env with default false', () => {
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN'
    ];
    let config = loadConfig();
    expect(config.verboseRuffleEvents).toBe(false);

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--verbose-ruffle-events'
    ];
    config = loadConfig();
    expect(config.verboseRuffleEvents).toBe(true);

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN'
    ];
    process.env.FSS_VERBOSE_RUFFLE_EVENTS = '1';
    config = loadConfig();
    expect(config.verboseRuffleEvents).toBe(true);
  });

  it('should parse Ruffle RTL layout diagnostics from CLI and env with default false', () => {
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN'
    ];
    let config = loadConfig();
    expect(config.ruffleRtlLayoutDiagnostics).toBe(false);

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--ruffle-rtl-layout-diagnostics'
    ];
    config = loadConfig();
    expect(config.ruffleRtlLayoutDiagnostics).toBe(true);

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN'
    ];
    process.env.FSS_RUFFLE_RTL_LAYOUT_DIAGNOSTICS = '1';
    config = loadConfig();
    expect(config.ruffleRtlLayoutDiagnostics).toBe(true);
  });

  it('should parse loading screen text compatibility mode from CLI and env with default off', () => {
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN'
    ];
    let config = loadConfig();
    expect(config.compatLoadingScreenTextMode).toBe('off');

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--compat-loading-screen-text-mode',
      'plain'
    ];
    config = loadConfig();
    expect(config.compatLoadingScreenTextMode).toBe('plain');

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--compat-loading-screen-text-mode',
      'minimal-tlf'
    ];
    config = loadConfig();
    expect(config.compatLoadingScreenTextMode).toBe('minimal-tlf');

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN'
    ];
    process.env.FSS_COMPAT_LOADING_SCREEN_TEXT_MODE = 'empty';
    config = loadConfig();
    expect(config.compatLoadingScreenTextMode).toBe('empty');
  });

  it('should fallback to default values if options are not supplied', () => {
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN'
    ];

    const config = loadConfig();
    expect(config.verboseHttp).toBe(false);
    expect(config.debugAssetsPath).toBe(path.resolve('./debug-assets'));
    expect(config.flashDebug).toBe(true); // default true
  });

  it('should parse --flash-debug and --suppress-flash-alerts correctly', () => {
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--flash-debug',
      'false'
    ];
    let config = loadConfig();
    expect(config.flashDebug).toBe(false);

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--suppress-flash-alerts'
    ];
    config = loadConfig();
    expect(config.flashDebug).toBe(false);
  });

  it('should support env variables for flash debug controls', () => {
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN'
    ];
    process.env.FSS_SUPPRESS_FLASH_ALERTS = '1';
    let config = loadConfig();
    expect(config.flashDebug).toBe(false);

    delete process.env.FSS_SUPPRESS_FLASH_ALERTS;
    process.env.FSS_FLASH_DEBUG = 'false';
    config = loadConfig();
    expect(config.flashDebug).toBe(false);
  });

  it('should parse --server-list CLI options and FSS_SERVER_LIST env variable correctly', () => {
    // Default should be true
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN'
    ];
    let config = loadConfig();
    expect(config.serverList).toBe(true);

    // CLI option false
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--server-list',
      'false'
    ];
    config = loadConfig();
    expect(config.serverList).toBe(false);

    // Env option false
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN'
    ];
    process.env.FSS_SERVER_LIST = 'false';
    config = loadConfig();
    expect(config.serverList).toBe(false);
  });

  it('should parse BlueBox apiOK delay from CLI and env with default 0', () => {
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN'
    ];
    let config = loadConfig();
    expect(config.blueboxApiOkDelayMs).toBe(0);

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--bluebox-apiok-delay-ms',
      '100'
    ];
    config = loadConfig();
    expect(config.blueboxApiOkDelayMs).toBe(100);

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN'
    ];
    process.env.FSS_BLUEBOX_APIOK_DELAY_MS = '75';
    config = loadConfig();
    expect(config.blueboxApiOkDelayMs).toBe(75);
  });

  it('should parse Ruffle prelogin call trace from CLI and env with default false', () => {
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN'
    ];
    let config = loadConfig();
    expect(config.rufflePreloginCallTrace).toBe(false);

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--ruffle-prelogin-call-trace'
    ];
    config = loadConfig();
    expect(config.rufflePreloginCallTrace).toBe(true);

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN'
    ];
    process.env.FSS_RUFFLE_PRELOGIN_CALL_TRACE = '1';
    config = loadConfig();
    expect(config.rufflePreloginCallTrace).toBe(true);
  });
});
