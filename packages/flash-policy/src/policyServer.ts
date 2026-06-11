import * as net from 'net';
import { ServerConfig, logger } from '@flash-socket-server/core';

let policyServerInstance: net.Server | null = null;

export function startPolicyServer(config: ServerConfig): net.Server | null {
  if (policyServerInstance) {
    return policyServerInstance;
  }

  const policyPort = config.policyPort;
  const socketPort = config.socketPort;

  const server = net.createServer((socket) => {
    // Graceful error catch on individual socket
    socket.on('error', () => {});

    let buffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const reqText = buffer.toString('utf8').replace(/\0/g, '').trim();

      if (reqText.includes('<policy-file-request/>')) {
        const policyXml = `<?xml version="1.0"?>
<cross-domain-policy>
  <allow-access-from domain="*" to-ports="${socketPort}" />
</cross-domain-policy>\0`;

        if (socket.writable) {
          socket.write(policyXml);
          logger.info('policy', `Served socket policy to ${socket.remoteAddress}:${socket.remotePort} via Port ${policyPort}`);
        }
        socket.end();
      }
    });
  });

  server.on('error', (err: any) => {
    if (err.code === 'EACCES') {
      logger.warn('policy', `Port ${policyPort} requires higher execution privileges (Admin/Root). Optional policy server skipping.`);
    } else if (err.code === 'EADDRINUSE') {
      logger.warn('policy', `Port ${policyPort} is already in use by another service. Optional policy server skipping.`);
    } else {
      logger.error('policy', `Failed to start policy server on port ${policyPort}: ${err.message}`);
    }
    // Set to null to indicate it did not bind successfully
    policyServerInstance = null;
  });

  try {
    server.listen(policyPort, '0.0.0.0', () => {
      logger.success('policy', `Flash Socket Policy Server successfully running on port ${policyPort}`);
      policyServerInstance = server;
    });
  } catch (err: any) {
    logger.warn('policy', `Gracefully caught startup error on port ${policyPort}: ${err.message}`);
  }

  return server;
}

export function stopPolicyServer(): void {
  if (policyServerInstance) {
    logger.info('policy', 'Stopping Flash Socket Policy server...');
    policyServerInstance.close();
    policyServerInstance = null;
    logger.success('policy', 'Flash Socket Policy Server stopped.');
  }
}
