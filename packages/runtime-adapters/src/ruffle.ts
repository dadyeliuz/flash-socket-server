import { RuntimeAdapter } from './types';
import {
  ServerConfig,
  getRuffleRuntimeTree,
  logger,
  resolveRuffleRuntimeDir,
  validateRuffleRuntimeDir
} from '@flash-socket-server/core';

function assertLocalhostOnly(config: ServerConfig): void {
  const host = config.publicHost.toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`ruffle-local requires --public-host localhost/127.0.0.1/::1. Received "${config.publicHost}".`);
  }
}

export class RuffleAdapter implements RuntimeAdapter {
  public name = 'ruffle';
  public description = 'EXPERIMENTAL alias for ruffle-local. Serves the game inside a locally hosted Ruffle WebAssembly wrapper.';

  async initialize(config: ServerConfig): Promise<void> {
    const localAdapter = new RuffleLocalAdapter();
    await localAdapter.initialize(config);
  }

  async shutdown(): Promise<void> {
    logger.info('adapter', `Shutting down ${this.name} adapter.`);
  }
}

export class RuffleLocalAdapter implements RuntimeAdapter {
  public name = 'ruffle-local';
  public description = 'EXPERIMENTAL localhost-only Ruffle web adapter. No Flash Player dependency, no projector fallback.';

  async initialize(config: ServerConfig): Promise<void> {
    assertLocalhostOnly(config);

    const runtimeDir = resolveRuffleRuntimeDir(config);
    logger.info('ruffle', `Adapter validating runtime dir: ${runtimeDir}`);
    const validation = validateRuffleRuntimeDir(runtimeDir);
    if (validation.ruffleJsPath) {
      logger.info('ruffle', `Adapter found ruffle.js: ${validation.ruffleJsPath}`);
    }
    if (validation.wasmFiles[0]) {
      logger.info('ruffle', `Adapter found wasm: ${validation.wasmFiles[0]}`);
    }

    if (validation.missing.length > 0) {
      logger.error('ruffle', `Runtime invalid: missing ${validation.missing.join(', ')}`);
      logger.error('ruffle', 'Suggested repair: npm run setup:ruffle');
      throw new Error(
        `Missing local Ruffle runtime at "${runtimeDir}". Missing: ${validation.missing.join(', ')}. ` +
        `Run "npm run setup:ruffle" or place the official self-hosted package there.\n` +
        `Directory tree:\n${getRuffleRuntimeTree(runtimeDir)}`
      );
    }

    logger.warn('adapter', `Initializing ${this.name} adapter in EXPERIMENTAL mode.`);
    logger.info('adapter', `Ruffle runtime directory: ${runtimeDir}`);
    logger.info('adapter', `Entry point: http://localhost:${config.httpPort}/play-ruffle.html`);
    logger.warn('adapter', 'Ruffle viability depends on AS3 support, ExternalInterface compatibility, and SmartFox TCP socket behavior.');
    logger.warn('adapter', 'This adapter does not fall back to projector automatically.');
  }

  async shutdown(): Promise<void> {
    logger.info('adapter', `Shutting down ${this.name} adapter.`);
  }
}
