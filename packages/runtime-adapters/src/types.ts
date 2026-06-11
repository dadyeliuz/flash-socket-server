import { ServerConfig } from '@flash-socket-server/core';

export interface RuntimeAdapter {
  name: string;
  description: string;
  initialize(config: ServerConfig): Promise<void>;
  shutdown(): Promise<void>;
}
