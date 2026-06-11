import { RuntimeAdapter } from './types';
import { ServerConfig, logger } from '@flash-socket-server/core';

export class ProjectorAdapter implements RuntimeAdapter {
  public name = 'projector';
  public description = 'Runs the standalone Adobe Flash Player projector (fallback mode, ExternalInterface will be unavailable)';

  async initialize(config: ServerConfig): Promise<void> {
    logger.warn('adapter', `Initializing ${this.name} adapter. Standalone projector lacks ExternalInterface stubs, which may crash the client if requested!`);
  }

  async shutdown(): Promise<void> {
    logger.info('adapter', `Shutting down ${this.name} adapter.`);
  }
}
