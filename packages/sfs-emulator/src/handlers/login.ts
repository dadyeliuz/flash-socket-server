import { ServerConfig, logger } from '@flash-socket-server/core';

export interface UserSession {
  userId: number;
  username: string;
  isModerator: boolean;
  currentRoom: string | null;
  x?: number;
  y?: number;
  AD?: number;
  [key: string]: any;
}

/**
 * Extracts the display name from a raw SFS nick string.
 *
 * The Flash login SWF encodes the nick as:  ::GUESTTYPE:USERNAME:PLATFORM
 * Examples:
 *   "::0:aaaa:1"      -> "aaaa"          (plain Latin)
 *   "::0:שששaaaa:1"   -> "aaaa"          (Hebrew RTL BiDi prefix + Latin name)
 *   "::0:משתמש:1"     -> "משתמש"         (fully Hebrew username, kept as-is)
 *   "plainName"        -> "plainName"      (no encoding, returned as-is)
 *
 * Hebrew BiDi artifact: when a user types a Latin username in a Flash RTL TextField,
 * the RTL layout engine prepends Hebrew direction/placeholder characters (e.g. "ששש")
 * to control text flow. These are NOT part of the intended username. We strip them when
 * a non-Hebrew segment follows. If the entire middle segment is Hebrew, we keep it
 * because that IS the username.
 */
export function cleanUsername(username: string): string {
  if (!username) return username;

  let middle: string;
  if (username.startsWith('::')) {
    const parts = username.split(':');
    // Format: "" : "" : guestType : username : platform
    // split("::0:aaaa:1") → ["", "", "0", "aaaa", "1"]
    if (parts.length >= 4) {
      middle = parts[3];
    } else {
      return username;
    }
  } else {
    return username;
  }

  if (!middle) return middle;

  // Strip leading Hebrew-only prefix when a non-Hebrew portion follows.
  // Hebrew Unicode block: U+0590–U+05FF (and U+FB1D–U+FB4F for presentation forms).
  // The pattern matches one or more Hebrew chars at the START, followed by at least
  // one non-Hebrew character — indicating a BiDi artifact prepended to a Latin name.
  const bidiPrefixStripped = middle.replace(/^[\u0590-\u05FF\uFB1D-\uFB4F]+(?=[\S\s]*[^\u0590-\u05FF\uFB1D-\uFB4F])/, '');

  // Only use the stripped version if it is non-empty and shorter than the original.
  // If the entire string was Hebrew, bidiPrefixStripped will equal middle (no prefix stripped)
  // because the lookahead requires at least one non-Hebrew char to follow.
  return bidiPrefixStripped.length > 0 ? bidiPrefixStripped : middle;
}

let userIdCounter = 1;
export const activeSessions = new Map<number, UserSession>();

/**
 * Parses and processes the incoming SFS XML login packet.
 * Returns an array of XML string responses to be sent back (each to be null-terminated).
 */
export function handleLogin(packet: string, config: ServerConfig): string[] | null {
  const isLogin = packet.includes("action='login'") || packet.includes('action="login"');
  
  if (!isLogin) {
    return null;
  }

  logger.info('sfs', 'Processing incoming TCP Login packet...');

  // Extract zone name
  const zoneMatch = packet.match(/z=['"](.*?)['"]/);
  const zone = zoneMatch ? zoneMatch[1] : '';

  // Extract nickname (handles standard CDATA wrapper)
  let username = 'guest';
  const nickMatch = packet.match(/<nick>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/nick>/);
  if (nickMatch && nickMatch[1]) {
    username = nickMatch[1];
  }

  // Extract password
  let password = '';
  const passMatch = packet.match(/<pass>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/pass>/);
  if (passMatch && passMatch[1]) {
    password = passMatch[1];
  }

  logger.info('sfs', `Extracted SFS Login properties - Zone: "${zone}", Nick: "${username}", Pass Length: ${password.length}`);

  // Create an in-memory session user
  const userId = userIdCounter++;
  const isMod = config.defaultUserModerator;
  
  const session: UserSession = {
    userId,
    username,
    isModerator: isMod,
    currentRoom: null
  };

  activeSessions.set(userId, session);
  logger.success('sfs', `Created active TCP session - User ID: ${userId}, Name: "${username}", Moderator: ${isMod}`);

  const responses: string[] = [];

  // 1. Generate XML logOK response
  const logOkXml = `<msg t='sys'><body action='logOK' r='0'><login id='${userId}' mod='${isMod ? '1' : '0'}' n='${username}' /></body></msg>`;
  responses.push(logOkXml);

  // 1b. Conditionally send experimental login extension packet
  if (config.sendLoginExtensionAfterLogOk) {
    const langVal = config.defaultLanguage !== undefined ? config.defaultLanguage : 4;
    const experimentalPacket = `{"t":"xt","b":{"r":-1,"c":"login","o":{"_cmd":"login","uSFSId":${userId},"appUserId":${userId},"userName":"${username}","ageGroup":1,"chatMode":1,"worldAdvan":0,"lastLogin":"2026-06-03","lang":${langVal},"ld":[{"i":1,"t":2},{"i":2,"t":2}]}}}`;
    logger.info('sfs', `[SFS] Sending experimental login extension packet: ${experimentalPacket}`);
    responses.push(experimentalPacket);
  }

  // 2. Generate XML rmList response if configured/required
  if (config.sendRoomListAfterLogin) {
    const roomId = config.defaultRoomId;
    const roomName = config.defaultRoomName;
    
    logger.info('sfs', `Appending room list configuration: Room ID ${roomId} ("${roomName}")`);
    const rmListXml = `<msg t='sys'><body action='rmList' r='0'><rmList><rm id='${roomId}' maxu='100' maxs='0' temp='0' game='0' priv='0' lmb='0' ucnt='1' scnt='0'><n>${roomName}</n></rm></rmList></body></msg>`;
    responses.push(rmListXml);
  }

  return responses;
}

export function resetSessions() {
  userIdCounter = 1;
  activeSessions.clear();
}
