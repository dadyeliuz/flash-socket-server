import { RuntimeAdapter } from './types';
import { ServerConfig, logger } from '@flash-socket-server/core';

export class WebContainerAdapter implements RuntimeAdapter {
  public name = 'web-container';
  public description = 'Serves the game wrapper play.html for browser container execution (required for ExternalInterface support)';

  async initialize(config: ServerConfig): Promise<void> {
    logger.info('adapter', `Initializing ${this.name} adapter. Entry point: http://localhost:${config.httpPort}/play.html`);
  }

  async shutdown(): Promise<void> {
    logger.info('adapter', `Shutting down ${this.name} adapter.`);
  }
}
