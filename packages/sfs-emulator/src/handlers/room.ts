import { ServerConfig, logger, timelineManager, resolveSafePath, safeFileExists, ruffleDiagnosticsManager } from '@flash-socket-server/core';
import * as fs from 'fs';
import * as path from 'path';
import { activeSessions, cleanUsername } from './login';

// Commands handled by this file (for unhandled-command filtering)
export const HANDLED_ROOM_COMMANDS = new Set([
  'rooms__getStaticRoomList',
  'rooms__joinFirstRoom',
  'user__joinFirstRoom',
  'wall__getUserMessages',
  'wall__getNumUnReadMessages',
  'worldAdven__getAdventureDetails',
  'user__getUserTO',
  'user__getUserData',
  'user__getUserCardInfo',
  'user__getUserDetail',
  'user__getUserCard',
  'rewardSystem__getDetails',
  'rewardSystem__giveHeartTofriend',
  'rewardSystem__giveHeartTofriends',
  'rewardSystem__getStatus',
  'user__move',
  'rooms__jumpToRoom',
  'user__jumpToRoom',
  'rooms__changeRoom',
  'buddyList__getUserBuddies',
  'worldAdven__getRoomElements',
  'worldAdven__getUserItems',
  'user__getInventoryItems',
  'wall__getMessageTemplates',
  'wall__sendCustomMessage',
  'wall__deleteUserMessage',
  'wall__setMessageRead'
]);

export interface StaticRoomCatalogEntry {
  id: number;
  name: string;
  hasSwf: boolean;
  hasTxt: boolean;
}

export interface RoomTransitionTarget {
  roomId: number;
  roomName: string;
  x?: number;
  y?: number;
  direction?: number | string;
  doorId?: number | string;
  decodedPd?: any;
  sourceField?: string;
}

export function buildSmartFoxRoomListXml(config: ServerConfig, responseRoomId = -1): string {
  const rooms = getStaticRoomCatalog(config)
    .map(room => {
      const userCount = room.id === (config.defaultRoomId === 1 ? 20 : config.defaultRoomId) ? 1 : 0;
      return `<rm id='${room.id}' maxu='100' maxs='0' temp='0' game='0' priv='0' lmb='0' ucnt='${userCount}' scnt='0'><n>${room.name}</n></rm>`;
    })
    .join('');

  return `<msg t='sys'><body action='rmList' r='${responseRoomId}'><rmList>${rooms}</rmList></body></msg>`;
}

function cdataSafe(value: string): string {
  return value.replace(/\]\]>/g, ']]]]><![CDATA[>');
}

function getConfiguredRoomBackSound(roomId: number, config: ServerConfig): { value: string; expectedUrl: string } | null {
  const map = config.roomBackSoundMap || {};
  const roomName = `room_${roomId}`;
  const value = map[roomName] || map[String(roomId)];
  if (!value) return null;

  const expectedUrl = /^https?:\/\//i.test(value)
    ? value
    : `/Sound/Rooms/${value}`;

  return { value, expectedUrl };
}

function getExpectedRoomBackSoundRequestUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).pathname;
    } catch (_) {
      return value;
    }
  }
  return `/Sound/Rooms/${value}`;
}

function buildRoomVarsXml(roomId: number, config: ServerConfig): string {
  const backSound = getConfiguredRoomBackSound(roomId, config);
  if (!backSound) return '';

  const roomName = `room_${roomId}`;
  ruffleDiagnosticsManager.recordRoomBackSoundVarSent(
    roomName,
    backSound.value,
    backSound.expectedUrl,
    getExpectedRoomBackSoundRequestUrl(backSound.value)
  );
  return `<vars><var n='rbs' t='s'><![CDATA[${cdataSafe(backSound.value)}]]></var></vars>`;
}

export function getStaticRoomCatalog(config: ServerConfig): StaticRoomCatalogEntry[] {
  const roomsDir = resolveSafePath(config.assetsPath, path.join('Swf', 'AssetsClean', 'Rooms'));
  const entries = new Map<number, StaticRoomCatalogEntry>();

  if (roomsDir && fs.existsSync(roomsDir) && fs.statSync(roomsDir).isDirectory()) {
    for (const file of fs.readdirSync(roomsDir)) {
      const match = file.match(/^room_(\d+)\.(swf|txt)$/i);
      if (!match) continue;

      const id = Number(match[1]);
      if (!Number.isFinite(id)) continue;

      const existing = entries.get(id) || {
        id,
        name: `room_${id}`,
        hasSwf: false,
        hasTxt: false
      };
      if (match[2].toLowerCase() === 'swf') {
        existing.hasSwf = true;
      } else {
        existing.hasTxt = true;
      }
      entries.set(id, existing);
    }
  }

  const defaultRoomId = config.defaultRoomId === 1 ? 20 : config.defaultRoomId;
  if (!entries.has(defaultRoomId)) {
    entries.set(defaultRoomId, {
      id: defaultRoomId,
      name: config.defaultRoomName || `room_${defaultRoomId}`,
      hasSwf: false,
      hasTxt: false
    });
  }

  return [...entries.values()].sort((a, b) => a.id - b.id);
}

export function parseRoomTransitionTarget(packet: string, config: ServerConfig): RoomTransitionTarget | null {
  const parsed = parseExtensionJson(packet);
  if (!parsed?.b?.c || !['rooms__jumpToRoom', 'user__jumpToRoom', 'rooms__changeRoom'].includes(parsed.b.c)) {
    return null;
  }

  let data = parsed?.b?.o || {};
  if (parsed?.b?.p?.d) {
    try {
      data = JSON.parse(Buffer.from(parsed.b.p.d, 'base64').toString('utf8'));
    } catch (err: any) {
      logger.error('sfs', `Failed to decode room transition p.d: ${err.message}`);
    }
  }

  const candidates: Array<{ field: string; value: any }> = [
    { field: 'id', value: data?.id },
    { field: 'roomId', value: data?.roomId },
    { field: 'rId', value: data?.rId },
    { field: 'targetRoomId', value: data?.targetRoomId },
    { field: 'destinationRoomId', value: data?.destinationRoomId },
    { field: 'gCId', value: data?.gCId },
    { field: 'grfCompunentId', value: data?.grfCompunentId },
    { field: 'gId', value: data?.gId },
    { field: 'nameId', value: data?.nameId },
    { field: 'roomName', value: data?.roomName },
    { field: 'rN', value: data?.rN }
  ];

  let roomId: number | null = null;
  let roomName: string | null = null;
  let sourceField: string | undefined;

  for (const candidate of candidates) {
    if (candidate.value === undefined || candidate.value === null || candidate.value === '') continue;
    if (typeof candidate.value === 'number' || /^\d+$/.test(String(candidate.value))) {
      roomId = Number(candidate.value);
      roomName = `room_${roomId}`;
      sourceField = candidate.field;
      break;
    }

    const text = String(candidate.value);
    const match = text.match(/^room_(\d+)$/i);
    if (match) {
      roomId = Number(match[1]);
      roomName = `room_${roomId}`;
      sourceField = candidate.field;
      break;
    }
  }

  if (roomId === null || !roomName) {
    return null;
  }

  const catalog = getStaticRoomCatalog(config);
  const catalogEntry = catalog.find(room => room.id === roomId);
  const swfPath = resolveSafePath(config.assetsPath, path.join('Swf', 'AssetsClean', 'Rooms', `${roomName}.swf`));
  const swfExists = catalogEntry?.hasSwf === true || (swfPath !== null && safeFileExists(swfPath));
  if (catalog.length > 1 && !swfExists) {
    return null;
  }

  return {
    roomId,
    roomName,
    x: data?.x !== undefined ? Number(data.x) : undefined,
    y: data?.y !== undefined ? Number(data.y) : undefined,
    direction: data?.AD ?? data?.direction ?? data?.dir,
    doorId: data?.doorId ?? data?.door ?? data?.exitId ?? data?.gCId ?? data?.grfCompunentId,
    decodedPd: data,
    sourceField
  };
}

/**
 * Handles incoming room join requests.
 * Parses the packet, updates session state, and returns the joinOK XML response.
 */
export function handleRoomJoin(
  packet: string,
  userId: number | undefined,
  config: ServerConfig,
  isSimulated = false
): string[] | null {
  // SFS standard XML joinRoom or JSON xtReq action containing 'rooms__joinFirstRoom' or 'user__joinFirstRoom'
  const isJoinRoom = packet.includes("action='joinRoom'") || packet.includes('action="joinRoom"');
  const isXtJoin = packet.includes('"c":"rooms__joinFirstRoom"') || packet.includes('"c":"user__joinFirstRoom"');
  
  if (!isJoinRoom && !isXtJoin) {
    return null;
  }

  logger.info('sfs', 'Processing incoming TCP joinRoom/rooms__joinFirstRoom packet...');

  let roomId = config.defaultRoomId;
  let oldRoomId: number | null = null;
  let isSpectator = false;
  let password = '';
  let requestedId: number | undefined = undefined;

  if (isXtJoin) {
    try {
      // Find CDATA content or parse directly
      let jsonStr = packet;
      const cdataMatch = packet.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
      if (cdataMatch) {
        jsonStr = cdataMatch[1];
      } else {
        const bodyMatch = packet.match(/<body[^>]*>([\s\S]*?)<\/body>/);
        if (bodyMatch) {
          jsonStr = bodyMatch[1];
        }
      }
      const parsed = JSON.parse(jsonStr.trim());
      let payload = parsed?.b?.o;
      if (parsed?.b?.p?.d) {
        try {
          const decodedStr = Buffer.from(parsed.b.p.d, 'base64').toString('utf8');
          payload = JSON.parse(decodedStr);
        } catch (err: any) {
          logger.error('sfs', `Failed to decode join first room p.d: ${err.message}`);
        }
      }
      if (payload) {
        logger.info('sfs', `[SFS] Handling extension command rooms__joinFirstRoom/user__joinFirstRoom`);
        if (payload.id !== undefined) {
          requestedId = payload.id;
          logger.info('sfs', `[SFS] Requested first room id: ${payload.id}`);
        }
      }
      // Force room ID to 20 or defaultRoomId
      roomId = 20;
    } catch (err: any) {
      logger.error('sfs', `Failed to parse xtReq JSON join: ${err.message}`);
    }
  } else {
    // Extract requested room ID (body r attribute or room id attribute)
    const bodyRMatch = packet.match(/r=['"](\d+)['"]/);
    if (bodyRMatch) {
      roomId = parseInt(bodyRMatch[1], 10);
    } else {
      const roomIdMatch = packet.match(/id=['"](\d+)['"]/);
      if (roomIdMatch) {
        roomId = parseInt(roomIdMatch[1], 10);
      }
    }

    // Extract old room ID (if present)
    const oldRoomMatch = packet.match(/o=['"](-?\d+)['"]/);
    if (oldRoomMatch) {
      oldRoomId = parseInt(oldRoomMatch[1], 10);
    }

    // Extract spectator flag (if present)
    const specMatch = packet.match(/spec=['"]([01])['"]/);
    if (specMatch) {
      isSpectator = specMatch[1] === '1';
    }

    // Extract password (if present)
    const passMatch = packet.match(/p=['"](.*?)['"]/);
    if (passMatch) {
      password = passMatch[1];
    }
  }

  logger.info(
    'sfs',
    `Extracted SFS Join Room properties - Requested Room ID: ${roomId}, Old Room ID: ${oldRoomId}, Spectator: ${isSpectator}, Pass Length: ${password.length}`
  );

  // Retrieve active session and update currentRoom
  let username = 'myUser';
  if (userId) {
    const session = activeSessions.get(userId);
    if (session) {
      username = session.username;
      session.currentRoom = roomId.toString();
      logger.success(
        'sfs',
        `Associated user "${session.username}" (ID: ${userId}) with room ID: ${roomId} ("${config.defaultRoomName}")`
      );
    } else {
      logger.warn('sfs', `No active user session found for User ID: ${userId} during room join.`);
    }
  } else {
    logger.warn('sfs', `Anonymous socket connection attempted room join (no associated User ID).`);
  }

  // Runtime logging markers to distinguish simulated and real client packets
  if (isSimulated) {
    logger.info('sfs', `[ROOM] Simulated test joinRoom received - User: "${username}"`);
  } else {
    logger.info('sfs', `[ROOM] Runtime client joinRoom received - User: "${username}"`);
  }

  const responses: string[] = [];
  const joinMode = config.blueboxJoinMode || 'joinOK-uLs-embedded';
  const isMod = config.defaultUserModerator ? '1' : '0';
  const roomVarsXml = buildRoomVarsXml(roomId, config);

  if (
    joinMode === 'legacy-separate-uList' ||
    joinMode === 'joinOK-uList-combined' ||
    joinMode.includes('split') ||
    joinMode.includes('delayed') ||
    joinMode.includes('after-room-asset')
  ) {
    // Generate legacy XML joinOK response and separate uList response
    const joinOkXml = `<msg t='sys'><body action='joinOK' r='${roomId}'><pid id='${userId || 1}' />${roomVarsXml}</body></msg>`;
    responses.push(joinOkXml);
    timelineManager.recordMilestone('127.0.0.1', null, 'joinOkSent');

    const displayName = cleanUsername(username);
    const uListXml = `<msg t='sys'><body action='uList' r='${roomId}'><uList><u id='${userId || 1}' name='${displayName}' mod='${isMod}' spec='0'><vars><var n='x' t='n'>400</var><var n='y' t='n'>300</var><var n='AD' t='n'>1</var><var n='color' t='n'>1</var><var n='items' t='s'>[]</var><var n='age' t='n'>10</var><var n='friends' t='n'>0</var><var n='score' t='n'>0</var></vars></u></uList></body></msg>`;
    responses.push(uListXml);
    timelineManager.recordMilestone('127.0.0.1', null, 'userListSent');
  } else {
    // Generate default XML joinOK response with embedded uLs (user list)
    const displayName = cleanUsername(username);
    const uListXml = `<uLs><u i='${userId || 1}' m='${isMod}' s='0' p='${userId || 1}'><n><![CDATA[${displayName}]]></n><vars><var n='x' t='n'>400</var><var n='y' t='n'>300</var><var n='AD' t='n'>1</var><var n='color' t='n'>1</var><var n='items' t='s'><![CDATA[[]]]></var><var n='age' t='n'>10</var><var n='friends' t='n'>0</var><var n='score' t='n'>0</var><var n='mo_1' t='n'>0</var><var n='adventure' t='s'><![CDATA[]]></var></vars></u></uLs>`;
    const joinOkXml = `<msg t='sys'><body action='joinOK' r='${roomId}'><pid id='${userId || 1}' />${roomVarsXml}${uListXml}</body></msg>`;
    responses.push(joinOkXml);
    timelineManager.recordMilestone('127.0.0.1', null, 'joinOkSent');
    timelineManager.recordMilestone('127.0.0.1', null, 'userListSent');
  }

  if (roomId === 20 || roomId.toString() === '20') {
    timelineManager.recordMilestone('127.0.0.1', null, 'room20Reached');
  }

  // Send login extension if rooms__joinFirstRoom was used
  if (isXtJoin && packet.includes('"c":"rooms__joinFirstRoom"')) {
    const joinXt = `{"t":"xt","b":{"r":${roomId},"c":"rooms__joinFirstRoom","o":{"_cmd":"rooms__joinFirstRoom","status":1,"roomId":${roomId},"id":${roomId}}}}`;
    responses.push(joinXt);
  }

  return responses;
}

/**
 * Handles incoming room list requests.
 * Returns the rmList XML response containing zones and room definitions.
 */
export function handleGetRmList(packet: string, config: ServerConfig): string[] | null {
  const isGetRmList = packet.includes("action='getRmList'") || packet.includes('action="getRmList"');
  
  if (!isGetRmList) {
    return null;
  }

  logger.info('sfs', '[SFS] Handling getRmList');

  // Change defaultRoomId to 20 if configured as 1 (for room_20 compatibility)
  // Format the rmList XML packet according to SFS 1.x SysHandler handleRoomList format.
  // The SmartFox room cache must know transition targets before joinOK can load them.
  const rmListXml = buildSmartFoxRoomListXml(config);

  logger.info('sfs', `[TCP-OUT] room list response: ${rmListXml}`);

  return [rmListXml];
}

export interface StaticRoomResponse {
  packet: string;
  decodedPd?: any;
}

export function handleGetStaticRoomList(
  packet: string,
  config: ServerConfig
): StaticRoomResponse | null {
  const parsed = parseExtensionJson(packet);
  const cmd = parsed?.b?.c;

  if (cmd !== 'rooms__getStaticRoomList') {
    return null;
  }

  logger.info('sfs', '[SFS] Handling getStaticRoomList');

  // Decode p.d if present
  let decodedPd: any = undefined;
  if (parsed?.b?.p?.d) {
    try {
      const decodedStr = Buffer.from(parsed.b.p.d, 'base64').toString('utf8');
      decodedPd = JSON.parse(decodedStr);
      logger.info('sfs', `[SFS] Decoded p.d: ${JSON.stringify(decodedPd)}`);
    } catch (err: any) {
      logger.error('sfs', `Failed to decode p.d: ${err.message}`);
    }
  }

  const rooms = getStaticRoomCatalog(config).map(room => {
    let roomName = room.name;
    if (config.compatStaticRoomNameStripPrefix && roomName.startsWith('room_')) {
      roomName = roomName.substring(5);
    }
    return {
      rId: room.id,
      rN: roomName,
      rT: 'WR',
      gId: room.id,
      fR: config.staticRoomFirstRoomDelay,
      sTc: 10,
      sX: 1,
      sY: 1,
      x: 0,
      y: 0
    };
  });

  const responseObj = {
    t: 'xt',
    b: {
      r: -1,
      c: 'rooms__getStaticRoomList',
      o: {
        _cmd: 'rooms__getStaticRoomList',
        StaticRooms: rooms
      }
    }
  };

  return {
    packet: JSON.stringify(responseObj),
    decodedPd
  };
}

export function handleGetUserMessages(
  packet: string,
  config: ServerConfig
): string | null {
  const parsed = parseExtensionJson(packet);
  const cmd = parsed?.b?.c;

  if (cmd !== 'wall__getUserMessages') {
    return null;
  }

  logger.info('sfs', '[SFS] Handling wall__getUserMessages');

  // Preserve request room ID (r) if present, defaulting to -1
  const roomId = parsed?.b?.r !== undefined ? parsed.b.r : -1;

  const responseObj = {
    t: 'xt',
    b: {
      r: roomId,
      c: 'wall__getUserMessages',
      o: {
        _cmd: 'wall__getUserMessages',
        wmsg: []
      }
    }
  };

  return JSON.stringify(responseObj);
}

export function handleGetNumUnReadMessages(
  packet: string,
  config: ServerConfig
): string | null {
  const parsed = parseExtensionJson(packet);
  const cmd = parsed?.b?.c;

  if (cmd !== 'wall__getNumUnReadMessages') {
    return null;
  }

  logger.info('sfs', '[SFS] Handling wall__getNumUnReadMessages');

  // Preserve request room ID (r) if present, defaulting to -1
  const roomId = parsed?.b?.r !== undefined ? parsed.b.r : -1;

  const responseObj = {
    t: 'xt',
    b: {
      r: roomId,
      c: 'wall__getNumUnReadMessages',
      o: {
        _cmd: 'wall__getNumUnReadMessages',
        showSms: true,
        wearSwimsuit: true,
        // This ControlPanel build calls initPetControl(param1:Array) and reads
        // param1.length. A boolean petMagics crashes onServerControlState.
        petMagics: [],
        adminChat: true,
        isVehicle: false,
        newMsgs: false
      }
    }
  };

  return JSON.stringify(responseObj);
}

export function handleGetAdventureDetails(
  packet: string,
  config: ServerConfig
): string | null {
  const parsed = parseExtensionJson(packet);
  const cmd = parsed?.b?.c;

  if (cmd !== 'worldAdven__getAdventureDetails') {
    return null;
  }

  logger.info('sfs', '[SFS] Handling worldAdven__getAdventureDetails');

  // Preserve request room ID (r) if present, defaulting to -1
  const roomId = parsed?.b?.r !== undefined ? parsed.b.r : -1;

  const responseObj = {
    t: 'xt',
    b: {
      r: roomId,
      c: 'worldAdven__getAdventureDetails',
      o: {
        _cmd: 'worldAdven__getAdventureDetails',
        id: 0,
        name: '',
        showProgress: false,
        showBag: false,
        showScroll: false,
        items: [],
        isItemDraggable: false
      }
    }
  };

  return JSON.stringify(responseObj);
}

/**
 * Handles user__getUserTO, user__getUserData, user__getUserCardInfo, user__getUserDetail, user__getUserCard.
 * Returns a minimal stub user data packet so avatar initialization does not stall
 * waiting for an answer from the (absent) game server.
 */
export function handleGetUserData(
  packet: string,
  config: ServerConfig
): string | null {
  const parsed = parseExtensionJson(packet);
  const cmd = parsed?.b?.c;

  const USER_DATA_COMMANDS = [
    'user__getUserTO',
    'user__getUserData',
    'user__getUserCardInfo',
    'user__getUserDetail',
    'user__getUserCard',
  ];

  if (!USER_DATA_COMMANDS.includes(cmd)) {
    return null;
  }

  logger.info('sfs', `[SFS] Handling ${cmd} with stub user data`);

  const roomId = parsed?.b?.r !== undefined ? parsed.b.r : -1;

  // Extract payload from either b.o (direct JSON) or b.p.d (base64 JSON)
  let payload = parsed?.b?.o;
  if (parsed?.b?.p?.d) {
    try {
      const decodedStr = Buffer.from(parsed.b.p.d, 'base64').toString('utf8');
      payload = JSON.parse(decodedStr);
    } catch (err: any) {
      logger.error('sfs', `Failed to decode user data p.d: ${err.message}`);
    }
  }

  const requestedUserId = payload?.userId || payload?.id;
  const requestedUserName = payload?.userName;

  // Robust session resolution
  let sessionToUse: any = null;

  if (requestedUserId !== undefined) {
    sessionToUse = activeSessions.get(Number(requestedUserId));
  }

  if (!sessionToUse && requestedUserName) {
    const cleanRequested = cleanUsername(requestedUserName);
    for (const [, session] of activeSessions) {
      if (session.username === requestedUserName || cleanUsername(session.username) === cleanRequested) {
        sessionToUse = session;
        break;
      }
    }
  }

  // Fallback to first session if none resolved but sessions exist
  if (!sessionToUse && activeSessions.size > 0) {
    sessionToUse = Array.from(activeSessions.values())[0];
  }

  let username = requestedUserName || 'player';
  let cleanName = cleanUsername(username);
  let resolvedUserId = requestedUserId !== undefined ? Number(requestedUserId) : 1;
  let age = 10;
  let score = 100;
  let friends = 5;
  let color = 1;
  let x = 400;
  let y = 300;
  let AD = 1;
  let mo_1 = 5000;
  let mo_2 = 0, mo_3 = 0, mo_4 = 0, mo_5 = 0, mo_6 = 0, mo_7 = 0, mo_8 = 0, mo_9 = 0, mo_10 = 0;

  if (sessionToUse) {
    username = sessionToUse.username;
    cleanName = cleanUsername(username);
    resolvedUserId = sessionToUse.userId;
    if (sessionToUse.x !== undefined) x = sessionToUse.x;
    if (sessionToUse.y !== undefined) y = sessionToUse.y;
    if (sessionToUse.AD !== undefined) AD = sessionToUse.AD;
    if (sessionToUse.mo_1 !== undefined) mo_1 = sessionToUse.mo_1;
    if (sessionToUse.mo_2 !== undefined) mo_2 = sessionToUse.mo_2;
    if (sessionToUse.mo_3 !== undefined) mo_3 = sessionToUse.mo_3;
    if (sessionToUse.mo_4 !== undefined) mo_4 = sessionToUse.mo_4;
    if (sessionToUse.mo_5 !== undefined) mo_5 = sessionToUse.mo_5;
    if (sessionToUse.mo_6 !== undefined) mo_6 = sessionToUse.mo_6;
    if (sessionToUse.mo_7 !== undefined) mo_7 = sessionToUse.mo_7;
    if (sessionToUse.mo_8 !== undefined) mo_8 = sessionToUse.mo_8;
    if (sessionToUse.mo_9 !== undefined) mo_9 = sessionToUse.mo_9;
    if (sessionToUse.mo_10 !== undefined) mo_10 = sessionToUse.mo_10;
    if (sessionToUse.age !== undefined) age = sessionToUse.age;
    if (sessionToUse.score !== undefined) score = sessionToUse.score;
    if (sessionToUse.friends !== undefined) friends = sessionToUse.friends;
    if (sessionToUse.color !== undefined) color = sessionToUse.color;
  }

  let responseObj: any;

  if (cmd === 'user__getUserCardInfo') {
    // Constraint 1: Echo exactly the requested userName when present (do not clean it).
    // Fallback to clean displayName if requestedUserName is not in the request.
    const validationUserName = requestedUserName || cleanName;
    responseObj = {
      t: 'xt',
      b: {
        r: roomId,
        c: cmd,
        o: {
          _cmd: cmd,
          userName: validationUserName,
          groups: [],
          isRoomOpen: true,
          member: true,
          isAvliablChat: true,
          isAvliablTrade: true,
          isAvliablPresent: true,
          isAllowToAdd: true,
          isBlock: false,
          newMsgs: 0,
          hearts: {
            h: 5,
            ch: 5,
            dh: 0
          }
        }
      }
    };
  } else {
    // Constraint 2: Use clean displayName only where the client renders text visually:
    // - user__getUserCard
    // - user__getUserDetail
    // - user__getUserData
    // - user__getUserTO
    const responseCmd = cmd === 'user__getUserTO' ? 'user__getBuddy' : cmd;
    responseObj = {
      t: 'xt',
      b: {
        r: roomId,
        c: responseCmd,
        o: {
          _cmd: responseCmd,
          userId: resolvedUserId,
          userName: cleanName,
          online: true,
          isOnline: true,
          isOneline: true,
          age,
          score,
          friends,
          color,
          items: [],
          wall: [],
          numWallMessages: 0,
          numFriends: friends,
          isFriend: false,
          isBuddy: false,
          mo_1,
          mo_2,
          mo_3,
          mo_4,
          mo_5,
          mo_6,
          mo_7,
          mo_8,
          mo_9,
          mo_10,
          x,
          y,
          AD
        }
      }
    };
  }

  return JSON.stringify(responseObj);
}

export interface BuddyListResponse {
  packet: string;
  decodedPd?: any;
}

export function handleGetUserBuddies(
  packet: string,
  config: ServerConfig
): BuddyListResponse | null {
  const parsed = parseExtensionJson(packet);
  const cmd = parsed?.b?.c;

  if (cmd !== 'buddyList__getUserBuddies') {
    return null;
  }

  logger.info('sfs', '[SFS] Handling buddyList__getUserBuddies');

  const roomId = parsed?.b?.r !== undefined ? parsed.b.r : -1;

  // Extract payload from either b.o or b.p.d base64 JSON
  let payload = parsed?.b?.o;
  if (parsed?.b?.p?.d) {
    try {
      const decodedStr = Buffer.from(parsed.b.p.d, 'base64').toString('utf8');
      payload = JSON.parse(decodedStr);
    } catch (err: any) {
      logger.error('sfs', `Failed to decode buddy list p.d: ${err.message}`);
    }
  }

  const showPage = payload?.showPage !== undefined ? Number(payload.showPage) : 1;

  const responseObj = {
    t: 'xt',
    b: {
      r: roomId,
      c: 'buddyList__getUserBuddies',
      o: {
        _cmd: 'buddyList__getUserBuddies',
        showPage: showPage,
        buddies: []
      }
    }
  };

  return {
    packet: JSON.stringify(responseObj),
    decodedPd: payload || {}
  };
}

export interface RewardSystemResponse {
  packet: string;
  decodedPd?: any;
}

export function handleRewardSystemDetails(
  packet: string,
  config: ServerConfig
): RewardSystemResponse | null {
  const parsed = parseExtensionJson(packet);
  const cmd = parsed?.b?.c;

  const REWARD_SYSTEM_COMMANDS = [
    'rewardSystem__getDetails',
    'rewardSystem__giveHeartTofriend',
    'rewardSystem__giveHeartTofriends',
    'rewardSystem__getStatus',
  ];

  if (!REWARD_SYSTEM_COMMANDS.includes(cmd)) {
    return null;
  }

  logger.info('sfs', `[SFS] Handling ${cmd}`);

  const roomId = parsed?.b?.r !== undefined ? parsed.b.r : -1;
  const showPage = parsed?.b?.o?.showPage !== undefined ? parsed.b.o.showPage : 6;

  const responseObj: any = {
    t: 'xt',
    b: {
      r: roomId,
      c: cmd,
      o: {
        _cmd: cmd
      }
    }
  };

  if (cmd === 'rewardSystem__getStatus') {
    responseObj.b.o.status = [];
  } else {
    responseObj.b.o.status = true;
    responseObj.b.o.showPage = showPage;
    responseObj.b.o.hearts = {
      h: 5,
      ch: 5,
      dh: 0
    };
  }

  return {
    packet: JSON.stringify(responseObj),
    decodedPd: parsed?.b?.o || {}
  };
}

export function handleGetRoomElements(
  packet: string,
  config: ServerConfig
): string | null {
  const parsed = parseExtensionJson(packet);
  const cmd = parsed?.b?.c;
  if (cmd !== 'worldAdven__getRoomElements') {
    return null;
  }
  logger.info('sfs', '[SFS] Handling worldAdven__getRoomElements');
  const roomId = parsed?.b?.r !== undefined ? parsed.b.r : -1;
  const responseObj = {
    t: 'xt',
    b: {
      r: roomId,
      c: 'worldAdven__getRoomElements',
      o: {
        _cmd: 'worldAdven__getRoomElements',
        elements: []
      }
    }
  };
  return JSON.stringify(responseObj);
}

export function handleGetWorldUserItems(
  packet: string,
  config: ServerConfig
): string | null {
  const parsed = parseExtensionJson(packet);
  const cmd = parsed?.b?.c;
  if (cmd !== 'worldAdven__getUserItems') {
    return null;
  }
  logger.info('sfs', '[SFS] Handling worldAdven__getUserItems');
  const roomId = parsed?.b?.r !== undefined ? parsed.b.r : -1;
  const responseObj = {
    t: 'xt',
    b: {
      r: roomId,
      c: 'worldAdven__getUserItems',
      o: {
        _cmd: 'worldAdven__getUserItems',
        items: []
      }
    }
  };
  return JSON.stringify(responseObj);
}

export function handleGetInventoryItems(
  packet: string,
  config: ServerConfig
): string | null {
  const parsed = parseExtensionJson(packet);
  const cmd = parsed?.b?.c;
  if (cmd !== 'user__getInventoryItems') {
    return null;
  }
  logger.info('sfs', '[SFS] Handling user__getInventoryItems');
  const roomId = parsed?.b?.r !== undefined ? parsed.b.r : -1;
  
  let payload = parsed?.b?.o;
  if (parsed?.b?.p?.d) {
    try {
      const decodedStr = Buffer.from(parsed.b.p.d, 'base64').toString('utf8');
      payload = JSON.parse(decodedStr);
    } catch (_) {}
  }
  const userId = payload?.userId || 1;

  const responseObj = {
    t: 'xt',
    b: {
      r: roomId,
      c: 'user__getInventoryItems',
      o: {
        _cmd: 'user__getInventoryItems',
        items: [],
        userId: userId
      }
    }
  };
  return JSON.stringify(responseObj);
}

export function handleGetMessageTemplates(
  packet: string,
  config: ServerConfig
): string | null {
  const parsed = parseExtensionJson(packet);
  const cmd = parsed?.b?.c;
  if (cmd !== 'wall__getMessageTemplates') {
    return null;
  }
  logger.info('sfs', '[SFS] Handling wall__getMessageTemplates');
  const roomId = parsed?.b?.r !== undefined ? parsed.b.r : -1;
  const responseObj = {
    t: 'xt',
    b: {
      r: roomId,
      c: 'wall__getMessageTemplates',
      o: {
        _cmd: 'wall__getMessageTemplates',
        wmsgt: [{
          tmId: 1,
          tyId: 1,
          p: 0,
          mt: 1,
          ipm: "",
          ipt: "",
          hl: ""
        }],
        wmr: 5
      }
    }
  };
  return JSON.stringify(responseObj);
}

export function handleSendCustomMessage(
  packet: string,
  config: ServerConfig
): string | null {
  const parsed = parseExtensionJson(packet);
  const cmd = parsed?.b?.c;
  if (cmd !== 'wall__sendCustomMessage') {
    return null;
  }
  logger.info('sfs', '[SFS] Handling wall__sendCustomMessage');
  const roomId = parsed?.b?.r !== undefined ? parsed.b.r : -1;
  const responseObj = {
    t: 'xt',
    b: {
      r: roomId,
      c: 'wall__sendCustomMessage',
      o: {
        _cmd: 'wall__sendCustomMessage',
        status: -1
      }
    }
  };
  return JSON.stringify(responseObj);
}

export function handleDeleteUserMessage(
  packet: string,
  config: ServerConfig
): string | null {
  const parsed = parseExtensionJson(packet);
  const cmd = parsed?.b?.c;
  if (cmd !== 'wall__deleteUserMessage') {
    return null;
  }
  logger.info('sfs', '[SFS] Handling wall__deleteUserMessage');
  const roomId = parsed?.b?.r !== undefined ? parsed.b.r : -1;
  
  let payload = parsed?.b?.o;
  if (parsed?.b?.p?.d) {
    try {
      const decodedStr = Buffer.from(parsed.b.p.d, 'base64').toString('utf8');
      payload = JSON.parse(decodedStr);
    } catch (_) {}
  }
  const wmsgId = payload?.wmsgId !== undefined ? Number(payload.wmsgId) : 0;

  const responseObj = {
    t: 'xt',
    b: {
      r: roomId,
      c: 'wall__deleteUserMessage',
      o: {
        _cmd: 'wall__deleteUserMessage',
        status: true,
        wmsgId: wmsgId
      }
    }
  };
  return JSON.stringify(responseObj);
}

export function handleSetMessageRead(
  packet: string,
  config: ServerConfig
): string | null {
  const parsed = parseExtensionJson(packet);
  const cmd = parsed?.b?.c;
  if (cmd !== 'wall__setMessageRead') {
    return null;
  }
  logger.info('sfs', '[SFS] Handling wall__setMessageRead');
  const roomId = parsed?.b?.r !== undefined ? parsed.b.r : -1;
  
  let payload = parsed?.b?.o;
  if (parsed?.b?.p?.d) {
    try {
      const decodedStr = Buffer.from(parsed.b.p.d, 'base64').toString('utf8');
      payload = JSON.parse(decodedStr);
    } catch (_) {}
  }
  const wmsgId = payload?.wmsgId !== undefined ? Number(payload.wmsgId) : 0;

  const responseObj = {
    t: 'xt',
    b: {
      r: roomId,
      c: 'wall__setMessageRead',
      o: {
        _cmd: 'wall__setMessageRead',
        wmsgId: wmsgId
      }
    }
  };
  return JSON.stringify(responseObj);
}

function parseExtensionJson(packet: string): any {
  try {
    let jsonStr = packet.trim();
    if (jsonStr.startsWith('<msg')) {
      const cdataMatch = packet.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
      if (cdataMatch) {
        jsonStr = cdataMatch[1].trim();
      } else {
        const bodyMatch = packet.match(/<body[^>]*>([\s\S]*?)<\/body>/);
        if (bodyMatch) {
          jsonStr = bodyMatch[1].trim();
        }
      }
    }
    return JSON.parse(jsonStr);
  } catch (err) {
    return null;
  }
}
