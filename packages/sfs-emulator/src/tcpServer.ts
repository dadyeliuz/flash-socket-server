import * as net from 'net';
import { ServerConfig, logger, timelineManager } from '@flash-socket-server/core';
import { PacketAccumulator, encodePacket } from './codec';
import { packetLogger } from './packetLogger';
import { handleHandshake } from './handlers/handshake';
import { handleLogin } from './handlers/login';
import { handleRoomJoin, handleGetRmList } from './handlers/room';

let tcpServerInstance: net.Server | null = null;
const activeSockets = new Set<net.Socket>();

export function startSocketServer(config: ServerConfig): net.Server {
  if (tcpServerInstance) {
    return tcpServerInstance;
  }

  const socketPort = config.socketPort;

  const server = net.createServer((socket) => {
    const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
    logger.info('tcp', `Client socket connected from ${remoteAddr}`);
    activeSockets.add(socket);
    timelineManager.recordMilestone(socket.remoteAddress || '', null, 'first TCP connection');

    const accumulator = new PacketAccumulator();
    let hasSentApiOk = false;
    let packetsAfterApiOkCount = 0;

    socket.on('data', (chunk) => {
      // 1. Native detection and inline response to Flash policy requests
      const chunkText = chunk.toString('utf8').trim();
      if (chunkText.includes('<policy-file-request/>')) {
        timelineManager.recordMilestone(socket.remoteAddress || '', null, 'policy-file-request');
        packetLogger.logIn(remoteAddr, '<policy-file-request/>');
        const policyXml = `<?xml version="1.0"?>
<cross-domain-policy>
  <allow-access-from domain="*" to-ports="${socketPort}" />
</cross-domain-policy>`;
        
        if (socket.writable) {
          socket.write(encodePacket(policyXml));
          packetLogger.logOut(remoteAddr, policyXml);
        }
        socket.end();
        return;
      }

      // 2. Standard null-terminated packet accumulation
      try {
        const packets = accumulator.append(chunk);
        
        for (const packet of packets) {
          packetLogger.logIn(remoteAddr, packet);
          
          if (hasSentApiOk && packetsAfterApiOkCount < 10) {
            packetsAfterApiOkCount++;
            packetLogger.logDetailed(remoteAddr, packet, packetsAfterApiOkCount);
          }
          
          // A. Experimental handshake router
          const handshakeRes = handleHandshake(packet);
          if (handshakeRes) {
            timelineManager.recordMilestone(socket.remoteAddress || '', null, 'verChk');
            if (handshakeRes.includes("action='apiOK'")) {
              timelineManager.recordMilestone(socket.remoteAddress || '', null, 'apiOK');
            }
            if (socket.writable) {
              socket.write(encodePacket(handshakeRes));
              packetLogger.logOut(remoteAddr, handshakeRes);
              hasSentApiOk = true;
            }
            continue;
          }

          // B. SFS XML login router
          const loginResponses = handleLogin(packet, config);
          if (loginResponses) {
            if (socket.writable) {
              for (const res of loginResponses) {
                socket.write(encodePacket(res));
                packetLogger.logOut(remoteAddr, res);
                
                // Extract userId from logOK XML response to associate with the socket
                if (res.includes("action='logOK'") || res.includes('action="logOK"')) {
                  timelineManager.recordMilestone(socket.remoteAddress || '', null, 'sysLogOK');
                  const idMatch = res.match(/id=['"](\d+)['"]/);
                  if (idMatch) {
                    (socket as any).userId = parseInt(idMatch[1], 10);
                  }
                }

                if (res.includes('"c":"login"') && res.includes('"_cmd":"login"')) {
                  timelineManager.recordMilestone(socket.remoteAddress || '', null, 'xtLoginDelivered');
                }
              }
            }
            continue;
          }

          // New: SFS XML room list router
          const roomListResponses = handleGetRmList(packet, config);
          if (roomListResponses) {
            timelineManager.recordMilestone(socket.remoteAddress || '', null, 'getRmList');
            if (socket.writable) {
              for (const res of roomListResponses) {
                socket.write(encodePacket(res));
                packetLogger.logOut(remoteAddr, res);
              }
            }
            continue;
          }

          // C. SFS XML room join router
          const joinResponses = handleRoomJoin(packet, (socket as any).userId, config);
          if (joinResponses) {
            if (packet.includes('user__joinFirstRoom') || packet.includes('rooms__joinFirstRoom')) {
              timelineManager.recordMilestone(socket.remoteAddress || '', null, 'userJoinFirstRoom');
            }
            if (socket.writable) {
              for (const res of joinResponses) {
                socket.write(encodePacket(res));
                packetLogger.logOut(remoteAddr, res);
              }
            }
            continue;
          }
        }
      } catch (err: any) {
        logger.error('tcp', `Error processing socket data from ${remoteAddr}: ${err.message}`);
        socket.destroy();
      }
    });

    socket.on('error', (err) => {
      logger.debug('tcp', `Socket error on client ${remoteAddr}: ${err.message}`);
      activeSockets.delete(socket);
    });

    socket.on('close', () => {
      logger.info('tcp', `Client socket disconnected: ${remoteAddr}`);
      activeSockets.delete(socket);
    });
  });

  server.on('error', (err: any) => {
    logger.error('tcp', `Failed to start TCP socket server on port ${socketPort}: ${err.message}`);
  });

  server.listen(socketPort, '0.0.0.0', () => {
    logger.success('tcp', `SFS Emulator TCP Server successfully running on port ${socketPort}`);
    tcpServerInstance = server;
  });

  return server;
}

export function stopSocketServer(): void {
  if (tcpServerInstance) {
    logger.info('tcp', 'Stopping TCP socket server...');
    
    // Destroy all active client sockets
    for (const socket of activeSockets) {
      if (!socket.destroyed) {
        socket.destroy();
      }
    }
    activeSockets.clear();

    tcpServerInstance.close();
    tcpServerInstance = null;
    logger.success('tcp', 'SFS Emulator TCP Server stopped.');
  }
}
