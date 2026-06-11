import { logger } from '@flash-socket-server/core';

export const packetLogger = {
  logIn(address: string, packet: string) {
    const trimmed = packet.trim();
    if (!trimmed) return;
    
    // Check if it's policy request
    if (trimmed.includes('<policy-file-request/>')) {
      logger.info('tcp-in', `\x1b[36m<policy-file-request/>\x1b[0m from ${address}`);
      return;
    }
    
    logger.info('tcp-in', `\x1b[36m${trimmed}\x1b[0m from ${address}`);
  },
  
  logOut(address: string, packet: string) {
    const trimmed = packet.trim();
    if (!trimmed) return;
    
    logger.info('tcp-out', `\x1b[35m${trimmed}\x1b[0m to ${address}`);
  },

  logDetailed(address: string, packet: string, index: number) {
    const trimmed = packet.trim();
    if (!trimmed) return;

    logger.info('tcp-debug', `=== DETAILED PACKET LOG #${index} (Client: ${address}) ===`);
    logger.info('tcp-debug', `Raw Packet: ${trimmed}`);

    // Decode XML Action
    const actionMatch = trimmed.match(/action=['"](.*?)['"]/);
    const action = actionMatch ? actionMatch[1] : 'unknown';
    logger.info('tcp-debug', `Decoded XML Action: "${action}"`);

    // Body Attributes
    const bodyTagMatch = trimmed.match(/<body\s+(.*?)>/);
    const bodyAttrs: Record<string, string> = {};
    if (bodyTagMatch && bodyTagMatch[1]) {
      const attrRegex = /(\w+)=['"](.*?)['"]/g;
      let match;
      while ((match = attrRegex.exec(bodyTagMatch[1])) !== null) {
        bodyAttrs[match[1]] = match[2];
      }
    }
    logger.info('tcp-debug', `Body Attributes: ${JSON.stringify(bodyAttrs)}`);

    // Child Node Names
    const tagRegex = /<([a-zA-Z0-9_:]+)(\s|>)/g;
    const childNodes: string[] = [];
    let tagMatch;
    while ((tagMatch = tagRegex.exec(trimmed)) !== null) {
      const tagName = tagMatch[1];
      if (tagName !== 'msg' && tagName !== 'body') {
        childNodes.push(tagName);
      }
    }
    logger.info('tcp-debug', `Child Node Names: ${JSON.stringify(childNodes)}`);

    // Extracted Fields (Username/Password/Zone)
    const zoneMatch = trimmed.match(/z=['"](.*?)['"]/);
    const zone = zoneMatch ? zoneMatch[1] : null;

    const nickMatch = trimmed.match(/<nick>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/nick>/);
    const username = nickMatch ? nickMatch[1] : null;

    const passMatch = trimmed.match(/<pass>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/pass>/);
    const password = passMatch ? passMatch[1] : null;

    if (zone || username || password) {
      logger.info(
        'tcp-debug',
        `Extracted Fields - Zone: ${zone ? `"${zone}"` : 'null'}, Username: ${
          username ? `"${username}"` : 'null'
        }, Password Length: ${password ? password.length : 'null'}`
      );
    }
    logger.info('tcp-debug', `==========================================================`);
  }
};
export default packetLogger;

