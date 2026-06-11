import { logger } from '@flash-socket-server/core';

/**
 * Handles incoming handshake requests.
 * Returns the verChk response if matched, otherwise null.
 */
export function handleHandshake(packet: string): string | null {
  const isVerChk = packet.includes("action='verChk'") || packet.includes('action="verChk"');
  
  if (isVerChk) {
    logger.info('sfs', 'experimental handshake response: Received verChk, responding with apiOK');
    return `<msg t='sys'><body action='apiOK' r='0'></body></msg>`;
  }
  
  return null;
}
