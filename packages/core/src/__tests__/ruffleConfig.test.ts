import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as path from 'path';
import { loadConfig } from '../config';

describe('Ruffle Local Config Parsing', () => {
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

  it('recognizes --adapter ruffle-local', () => {
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--adapter',
      'ruffle-local',
      '--public-host',
      'localhost'
    ];

    const config = loadConfig();
    expect(config.runtimeMode).toBe('ruffle-local');
    expect(config.assetsPath).toBe(path.resolve('C:\\PROJ\\sfs-emu\\CLINET-CLEAN'));
  });

  it('recognizes --ruffle-runtime-dir override', () => {
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--adapter',
      'ruffle-local',
      '--ruffle-runtime-dir',
      'C:\\PROJ\\sfs-emu\\flash-socket-server\\tools\\runtime\\ruffle-custom'
    ];

    const config = loadConfig();
    expect(config.ruffleRuntimeDir).toBe(path.resolve('C:\\PROJ\\sfs-emu\\flash-socket-server\\tools\\runtime\\ruffle-custom'));
  });

  it('recognizes canvas text diagnostics flags from CLI and env', () => {
    process.env.FSS_CANVAS_RTL_RENDER_WORKAROUND = 'true';
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--adapter',
      'ruffle-local',
      '--canvas-text-diagnostics'
    ];

    const config = loadConfig();
    expect(config.canvasTextDiagnostics).toBe(true);
    expect(config.canvasRtlRenderWorkaround).toBe(true);
  });

  it('recognizes Hebrew RTL workaround from CLI and env', () => {
    process.env.FSS_RUFFLE_HEBREW_RTL_WORKAROUND = 'true';
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--adapter',
      'ruffle-local'
    ];

    expect(loadConfig().ruffleHebrewRtlWorkaround).toBe(true);

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--adapter',
      'ruffle-local',
      '--no-ruffle-hebrew-rtl-workaround'
    ];

    expect(loadConfig().ruffleHebrewRtlWorkaround).toBe(false);
  });

  it('normalizes diagnostic BlueBox login delivery aliases', () => {
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--bluebox-login-mode',
      'rmList-only-then-xt-login-on-poll'
    ];

    expect(loadConfig().blueboxLoginMode).toBe('rmList-login-split-poll');

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--bluebox-login-mode',
      'split-rmList-xtLogin'
    ];

    expect(loadConfig().blueboxLoginMode).toBe('rmList-login-split-command');

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--bluebox-login-mode',
      'xt-login-only'
    ];

    expect(loadConfig().blueboxLoginMode).toBe('xt-login-only');
  });

  it('recognizes Ruffle socket fast-fail flag from CLI and env', () => {
    process.env.FSS_RUFFLE_FAST_FAIL_SOCKET_WITHOUT_PROXY = 'true';
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--adapter',
      'ruffle-local'
    ];

    expect(loadConfig().ruffleFastFailSocketWithoutProxy).toBe(true);

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--adapter',
      'ruffle-local',
      '--no-ruffle-fast-fail-socket-without-proxy'
    ];

    expect(loadConfig().ruffleFastFailSocketWithoutProxy).toBe(false);
  });

  it('recognizes UserExperience constructor shim flag from CLI and env', () => {
    process.env.FSS_RUFFLE_USEREXPERIENCE_CTOR_SHIM = 'true';
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--adapter',
      'ruffle-local'
    ];

    expect(loadConfig().ruffleUserExperienceCtorShim).toBe(true);

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--adapter',
      'ruffle-local',
      '--no-ruffle-userexperience-ctor-shim'
    ];

    expect(loadConfig().ruffleUserExperienceCtorShim).toBe(false);
  });

  it('recognizes TextFlowEditor constructor shim flag from CLI and env', () => {
    process.env.FSS_RUFFLE_TEXTFLOWEDITOR_CTOR_SHIM = 'true';
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--adapter',
      'ruffle-local'
    ];

    expect(loadConfig().ruffleTextFlowEditorCtorShim).toBe(true);

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--adapter',
      'ruffle-local',
      '--no-ruffle-textfloweditor-ctor-shim'
    ];

    expect(loadConfig().ruffleTextFlowEditorCtorShim).toBe(false);
  });

  it('recognizes ButtonDataGrid clear shim flag from CLI and env', () => {
    process.env.FSS_RUFFLE_BUTTONGRID_CLEAR_SHIM = 'true';
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--adapter',
      'ruffle-local'
    ];

    expect(loadConfig().ruffleButtonGridClearShim).toBe(true);

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--adapter',
      'ruffle-local',
      '--no-ruffle-buttongrid-clear-shim'
    ];

    expect(loadConfig().ruffleButtonGridClearShim).toBe(false);
  });

  it('recognizes Magic ControlPanel shim flag from CLI and env', () => {
    process.env.FSS_RUFFLE_MAGIC_CONTROLPANEL_SHIM = 'true';
    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--adapter',
      'ruffle-local'
    ];

    expect(loadConfig().ruffleMagicControlPanelShim).toBe(true);

    process.argv = [
      'node',
      'main.js',
      '--assets',
      'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      '--adapter',
      'ruffle-local',
      '--no-ruffle-magic-controlpanel-shim'
    ];

    expect(loadConfig().ruffleMagicControlPanelShim).toBe(false);
  });
});
