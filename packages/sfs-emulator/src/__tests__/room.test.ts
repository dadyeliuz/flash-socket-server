import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { handleLogin, resetSessions, activeSessions } from '../handlers/login';
import { ServerConfig } from '@flash-socket-server/core';
import { encodePacket } from '../codec';
import {
  handleRoomJoin,
  handleGetRmList,
  handleGetUserMessages,
  handleGetNumUnReadMessages,
  handleGetAdventureDetails,
  handleGetStaticRoomList,
  handleGetUserBuddies,
  handleGetRoomElements,
  handleGetWorldUserItems,
  handleGetInventoryItems,
  handleGetMessageTemplates,
  handleSendCustomMessage,
  handleDeleteUserMessage,
  handleSetMessageRead,
  getStaticRoomCatalog,
  parseRoomTransitionTarget,
  buildSmartFoxRoomListXml
} from '../handlers/room';

describe('SFS XML Room Join Handler', () => {
  const dummyConfig: ServerConfig = {
    httpPort: 8080,
    socketPort: 9339,
    policyPort: 843,
    assetsPath: './xyz',
    runtimeMode: 'web-container',
    entrySwf: 'Login.swf',
    publicHost: '127.0.0.1',
    acceptAnyLogin: true,
    defaultUserModerator: true,
    sendRoomListAfterLogin: true,
    defaultRoomName: 'room_20',
    defaultRoomId: 1,
    verboseHttp: false,
    debugAssetsPath: './debug-assets',
    ruffleRuntimeDir: null,
    compatFixLanguageXml: true,
    compatLoginGraphicsAlias: null,
    sendLoginExtensionAfterLogOk: false,
    compatLoginFirstLoadingScreensMode: 'clean-single',
    defaultLanguage: 4,
    blueboxLoginExtensionOnly: false,
    blueboxLoginMode: 'deferred',
    flashDebug: true,
    serverList: true,
    staticRoomFirstRoomDelay: 0,
    roomBackSoundMap: {}
  };

  beforeEach(() => {
    resetSessions();
  });

  it('should ignore non-joinRoom packets', () => {
    const result = handleRoomJoin("<msg t='sys'><body action='verChk' /></msg>", undefined, dummyConfig);
    expect(result).toBeNull();
  });

  it('should successfully parse standard SFS joinRoom XML and update session and return joinOK with embedded uLs', () => {
    // 1. Setup session via handleLogin
    const loginPacket = `<msg t='sys'><body action='login' r='0'><login z='worlds4u'><nick><![CDATA[testUser]]></nick><pass><![CDATA[testPass]]></pass></login></body></msg>`;
    const loginRes = handleLogin(loginPacket, dummyConfig);
    expect(loginRes).not.toBeNull();
    expect(activeSessions.size).toBe(1);
    
    const session = Array.from(activeSessions.values())[0];
    expect(session.userId).toBe(1);
    expect(session.currentRoom).toBeNull();

    // 2. Perform room join
    const joinPacket = `<msg t='sys'><body action='joinRoom' r='1'><room id='1' o='-1' spec='0' p='' /></body></msg>`;
    const joinRes = handleRoomJoin(joinPacket, session.userId, dummyConfig);

    expect(joinRes).not.toBeNull();
    expect(joinRes!.length).toBe(1); // Only joinOK with embedded uLs
    expect(joinRes![0]).toContain("<body action='joinOK' r='1'");
    expect(joinRes![0]).toContain("<pid id='1' />");
    expect(joinRes![0]).toContain("<uLs>");
    expect(joinRes![0]).toContain("<u i='1' m='1' s='0' p='1'>");
    expect(joinRes![0]).toContain("<n><![CDATA[testUser]]></n>");
    expect(joinRes![0]).toContain("<vars>");
    expect(joinRes![0]).toContain("<var n='x' t='n'>400</var>");
    expect(joinRes![0]).toContain("<var n='y' t='n'>300</var>");
    expect(joinRes![0]).toContain("<var n='color' t='n'>1</var>");
    expect(joinRes![0]).toContain("<var n='mo_1' t='n'>0</var>");
    expect(joinRes![0]).toContain("<var n='adventure' t='s'><![CDATA[]]></var>");
    expect(joinRes![0]).not.toContain("n='rbs'");

    // 3. Verify session was updated
    expect(session.currentRoom).toBe('1');
  });

  it('should inject configured rbs room variable into joinOK only for mapped rooms', () => {
    const configWithBackSound = {
      ...dummyConfig,
      roomBackSoundMap: {
        room_20: 'mcCabin.mp3'
      }
    };
    const loginPacket = `<msg t='sys'><body action='login' r='0'><login z='worlds4u'><nick><![CDATA[testUser]]></nick><pass><![CDATA[testPass]]></pass></login></body></msg>`;
    const loginRes = handleLogin(loginPacket, configWithBackSound);
    expect(loginRes).not.toBeNull();

    const session = Array.from(activeSessions.values())[0];
    const joinPacket = `<msg t='xt'><body action='xtReq' r='-1'><![CDATA[{"t":"xt","b":{"r":-1,"c":"user__joinFirstRoom","o":{"id":20}}}]]></body></msg>`;
    const joinRes = handleRoomJoin(joinPacket, session.userId, configWithBackSound);

    expect(joinRes).not.toBeNull();
    expect(joinRes![0]).toContain("<body action='joinOK' r='20'");
    expect(joinRes![0]).toContain("<vars><var n='rbs' t='s'><![CDATA[mcCabin.mp3]]></var></vars>");
  });

  it('should successfully parse standard SFS joinRoom XML and return legacy separate uList when configured', () => {
    const legacyConfig = { ...dummyConfig, blueboxJoinMode: 'legacy-separate-uList' as const };
    // 1. Setup session via handleLogin
    const loginPacket = `<msg t='sys'><body action='login' r='0'><login z='worlds4u'><nick><![CDATA[testUser]]></nick><pass><![CDATA[testPass]]></pass></login></body></msg>`;
    const loginRes = handleLogin(loginPacket, legacyConfig);
    expect(loginRes).not.toBeNull();

    const session = Array.from(activeSessions.values())[0];

    // 2. Perform room join
    const joinPacket = `<msg t='sys'><body action='joinRoom' r='1'><room id='1' o='-1' spec='0' p='' /></body></msg>`;
    const joinRes = handleRoomJoin(joinPacket, session.userId, legacyConfig);

    expect(joinRes).not.toBeNull();
    expect(joinRes!.length).toBe(2); // Both joinOK and uList
    expect(joinRes![0]).toContain("<body action='joinOK' r='1'");
    expect(joinRes![1]).toContain("<body action='uList' r='1'");
    expect(joinRes![1]).toContain("<u id='1' name='testUser'");
  });

  it('should handle SFS xtReq rooms__joinFirstRoom JSON extension request and return joinOK with embedded uLs + extension response', () => {
    const loginPacket = `<msg t='sys'><body action='login' r='0'><login z='worlds4u'><nick><![CDATA[testUser]]></nick><pass><![CDATA[testPass]]></pass></login></body></msg>`;
    const loginRes = handleLogin(loginPacket, dummyConfig);
    expect(loginRes).not.toBeNull();
    
    const session = Array.from(activeSessions.values())[0];
    const joinPacket = `<msg t='xt'><body action='xtReq' r='-1'><![CDATA[{"t":"xt","b":{"r":-1,"c":"rooms__joinFirstRoom","o":{"id":21312}}}]]></body></msg>`;
    const joinRes = handleRoomJoin(joinPacket, session.userId, dummyConfig);

    expect(joinRes).not.toBeNull();
    expect(joinRes!.length).toBe(2); // joinOK (with embedded uLs) and extension response rooms__joinFirstRoom
    expect(joinRes![0]).toContain("<body action='joinOK' r='20'");
    expect(joinRes![0]).toContain("<uLs>");
    expect(joinRes![1]).toContain('"_cmd":"rooms__joinFirstRoom"');
    expect(joinRes![1]).toContain('"roomId":20');
  });

  it('should handle SFS user__joinFirstRoom JSON extension request with base64 p.d payload and return joinOK with embedded uLs only', () => {
    const loginPacket = `<msg t='sys'><body action='login' r='0'><login z='worlds4u'><nick><![CDATA[testUser]]></nick><pass><![CDATA[testPass]]></pass></login></body></msg>`;
    const loginRes = handleLogin(loginPacket, dummyConfig);
    expect(loginRes).not.toBeNull();
    
    const session = Array.from(activeSessions.values())[0];
    // user__joinFirstRoom request with Base64 JSON {"id":20}
    const base64Data = Buffer.from(JSON.stringify({ id: 20 })).toString('base64');
    const joinPacket = `<msg t='xt'><body action='xtReq' r='-1'><![CDATA[{"t":"xt","b":{"r":-1,"c":"user__joinFirstRoom","p":{"d":"${base64Data}","m":"hash"}}}]]></body></msg>`;
    const joinRes = handleRoomJoin(joinPacket, session.userId, dummyConfig);

    expect(joinRes).not.toBeNull();
    expect(joinRes!.length).toBe(1); // Only joinOK with embedded uLs (no joinXt extension response)
    expect(joinRes![0]).toContain("<body action='joinOK' r='20'");
    expect(joinRes![0]).toContain("<uLs>");
  });

  it('should parse rooms__jumpToRoom targets from b.o and base64 p.d payloads', () => {
    const objectPacket = '{"t":"xt","b":{"r":20,"c":"rooms__jumpToRoom","o":{"nameId":"room_50","x":12,"y":34,"AD":2,"doorId":"east"}}}';
    const objectTarget = parseRoomTransitionTarget(objectPacket, dummyConfig);
    expect(objectTarget).toMatchObject({
      roomId: 50,
      roomName: 'room_50',
      x: 12,
      y: 34,
      direction: 2,
      doorId: 'east',
      sourceField: 'nameId'
    });

    const encoded = Buffer.from(JSON.stringify({ roomId: 70 })).toString('base64');
    const encodedPacket = JSON.stringify({ t: 'xt', b: { r: 20, c: 'rooms__jumpToRoom', p: { d: encoded } } });
    const encodedTarget = parseRoomTransitionTarget(encodedPacket, dummyConfig);
    expect(encodedTarget).toMatchObject({
      roomId: 70,
      roomName: 'room_70',
      sourceField: 'roomId'
    });

    const gatePacket = '{"t":"xt","b":{"r":20,"c":"rooms__changeRoom","o":{"gCId":170}}}';
    const gateTarget = parseRoomTransitionTarget(gatePacket, dummyConfig);
    expect(gateTarget).toMatchObject({
      roomId: 170,
      roomName: 'room_170',
      doorId: 170,
      sourceField: 'gCId'
    });
  });
});

describe('SFS XML Room List Handler', () => {
  const dummyConfig: ServerConfig = {
    httpPort: 8080,
    socketPort: 9339,
    policyPort: 843,
    assetsPath: './xyz',
    runtimeMode: 'web-container',
    entrySwf: 'Login.swf',
    publicHost: '127.0.0.1',
    acceptAnyLogin: true,
    defaultUserModerator: true,
    sendRoomListAfterLogin: true,
    defaultRoomName: 'room_20',
    defaultRoomId: 1,
    verboseHttp: false,
    debugAssetsPath: './debug-assets',
    ruffleRuntimeDir: null,
    compatFixLanguageXml: true,
    compatLoginGraphicsAlias: null,
    sendLoginExtensionAfterLogOk: false,
    compatLoginFirstLoadingScreensMode: 'clean-single',
    defaultLanguage: 4,
    blueboxLoginExtensionOnly: false,
    blueboxLoginMode: 'deferred',
    flashDebug: true,
    serverList: true,
    staticRoomFirstRoomDelay: 0
  };

  it('should ignore non-getRmList packets', () => {
    const result = handleGetRmList("<msg t='sys'><body action='verChk' /></msg>", dummyConfig);
    expect(result).toBeNull();
  });

  it('should successfully parse getRmList and return formatted rmList XML with default room information mapping ID 1 to 20', () => {
    const packet = "<msg t='sys'><body action='getRmList' r='-1' ></body></msg>";
    const result = handleGetRmList(packet, dummyConfig);

    expect(result).not.toBeNull();
    expect(result!.length).toBe(1);
    
    const rmListXml = result![0];
    expect(rmListXml).toContain("<body action='rmList' r='-1'>");
    expect(rmListXml).toContain("<rmList>");
    expect(rmListXml).toContain("id='20'");
    expect(rmListXml).toContain("<n>room_20</n>");
    expect(rmListXml).toContain("maxu='100'");
  });

  it('should include scanned room catalog entries in SmartFox rmList for later joinOK transitions', () => {
    const tempAssets = path.join(__dirname, 'temp_sfs_rmlist_assets');
    const roomsDir = path.join(tempAssets, 'Swf', 'AssetsClean', 'Rooms');
    fs.rmSync(tempAssets, { recursive: true, force: true });
    fs.mkdirSync(roomsDir, { recursive: true });
    fs.writeFileSync(path.join(roomsDir, 'room_20.swf'), 'swf20');
    fs.writeFileSync(path.join(roomsDir, 'room_110.swf'), 'swf110');

    try {
      const rmListXml = buildSmartFoxRoomListXml({ ...dummyConfig, assetsPath: tempAssets });
      expect(rmListXml).toContain("<rm id='20'");
      expect(rmListXml).toContain('<n>room_20</n>');
      expect(rmListXml).toContain("<rm id='110'");
      expect(rmListXml).toContain('<n>room_110</n>');
    } finally {
      fs.rmSync(tempAssets, { recursive: true, force: true });
    }
  });

  it('should ensure the encoded room list packet is null-terminated as required by socket protocol', () => {
    const packet = "<msg t='sys'><body action='getRmList' r='-1' ></body></msg>";
    const result = handleGetRmList(packet, dummyConfig);
    
    expect(result).not.toBeNull();
    const encoded = encodePacket(result![0]);
    
    // Check that last byte is 0 (null terminator)
    expect(encoded[encoded.length - 1]).toBe(0);
    // Check content before null terminator matches the raw XML
    const decoded = encoded.subarray(0, encoded.length - 1).toString('utf8');
    expect(decoded).toBe(result![0]);
  });
});

describe('SFS wall__getUserMessages Handler', () => {
  const dummyConfig: ServerConfig = {
    httpPort: 8080,
    socketPort: 9339,
    policyPort: 843,
    assetsPath: './xyz',
    runtimeMode: 'web-container',
    entrySwf: 'Login.swf',
    publicHost: '127.0.0.1',
    acceptAnyLogin: true,
    defaultUserModerator: true,
    sendRoomListAfterLogin: true,
    defaultRoomName: 'room_20',
    defaultRoomId: 1,
    verboseHttp: false,
    debugAssetsPath: './debug-assets',
    ruffleRuntimeDir: null,
    compatFixLanguageXml: true,
    compatLoginGraphicsAlias: null,
    sendLoginExtensionAfterLogOk: false,
    compatLoginFirstLoadingScreensMode: 'clean-single',
    defaultLanguage: 4,
    blueboxLoginExtensionOnly: false,
    blueboxLoginMode: 'deferred',
    flashDebug: true,
    serverList: true,
    staticRoomFirstRoomDelay: 0
  };

  it('should return null for non-wall__getUserMessages commands', () => {
    const result = handleGetUserMessages('{"t":"xt","b":{"r":20,"c":"some_other_cmd"}}', dummyConfig);
    expect(result).toBeNull();
  });

  it('should successfully handle wall__getUserMessages and preserve request room id', () => {
    const packet = '{"t":"xt","b":{"r":20,"c":"wall__getUserMessages","o":{}}}';
    const result = handleGetUserMessages(packet, dummyConfig);

    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.t).toBe('xt');
    expect(parsed.b.r).toBe(20);
    expect(parsed.b.c).toBe('wall__getUserMessages');
    expect(parsed.b.o.wmsg).toEqual([]);
  });

  it('should handle wall__getUserMessages wrapped in SFS CDATA XML', () => {
    const packet = `<msg t='xt'><body action='xtReq' r='55'><![CDATA[{"t":"xt","b":{"r":55,"c":"wall__getUserMessages","o":{}}}]]></body></msg>`;
    const result = handleGetUserMessages(packet, dummyConfig);

    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.b.r).toBe(55);
    expect(parsed.b.o.wmsg).toEqual([]);
  });
});

describe('SFS wall__getNumUnReadMessages Handler', () => {
  const dummyConfig: ServerConfig = {
    httpPort: 8080,
    socketPort: 9339,
    policyPort: 843,
    assetsPath: './xyz',
    runtimeMode: 'web-container',
    entrySwf: 'Login.swf',
    publicHost: '127.0.0.1',
    acceptAnyLogin: true,
    defaultUserModerator: true,
    sendRoomListAfterLogin: true,
    defaultRoomName: 'room_20',
    defaultRoomId: 1,
    verboseHttp: false,
    debugAssetsPath: './debug-assets',
    ruffleRuntimeDir: null,
    compatFixLanguageXml: true,
    compatLoginGraphicsAlias: null,
    sendLoginExtensionAfterLogOk: false,
    compatLoginFirstLoadingScreensMode: 'clean-single',
    defaultLanguage: 4,
    blueboxLoginExtensionOnly: false,
    blueboxLoginMode: 'deferred',
    flashDebug: true,
    serverList: true,
    staticRoomFirstRoomDelay: 0
  };

  it('should return null for non-wall__getNumUnReadMessages commands', () => {
    const result = handleGetNumUnReadMessages('{"t":"xt","b":{"r":20,"c":"some_other_cmd"}}', dummyConfig);
    expect(result).toBeNull();
  });

  it('should successfully handle wall__getNumUnReadMessages and preserve request room id', () => {
    const packet = '{"t":"xt","b":{"r":20,"c":"wall__getNumUnReadMessages","o":{}}}';
    const result = handleGetNumUnReadMessages(packet, dummyConfig);

    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.t).toBe('xt');
    expect(parsed.b.r).toBe(20);
    expect(parsed.b.c).toBe('wall__getNumUnReadMessages');
    expect(parsed.b.o.showSms).toBe(true);
    expect(parsed.b.o.wearSwimsuit).toBe(true);
    expect(parsed.b.o.petMagics).toEqual([]);
    expect(parsed.b.o.adminChat).toBe(true);
    expect(parsed.b.o.isVehicle).toBe(false);
    expect(parsed.b.o.newMsgs).toBe(false);
  });
});

describe('SFS worldAdven__getAdventureDetails Handler', () => {
  const dummyConfig: ServerConfig = {
    httpPort: 8080,
    socketPort: 9339,
    policyPort: 843,
    assetsPath: './xyz',
    runtimeMode: 'web-container',
    entrySwf: 'Login.swf',
    publicHost: '127.0.0.1',
    acceptAnyLogin: true,
    defaultUserModerator: true,
    sendRoomListAfterLogin: true,
    defaultRoomName: 'room_20',
    defaultRoomId: 1,
    verboseHttp: false,
    debugAssetsPath: './debug-assets',
    ruffleRuntimeDir: null,
    compatFixLanguageXml: true,
    compatLoginGraphicsAlias: null,
    sendLoginExtensionAfterLogOk: false,
    compatLoginFirstLoadingScreensMode: 'clean-single',
    defaultLanguage: 4,
    blueboxLoginExtensionOnly: false,
    blueboxLoginMode: 'deferred',
    flashDebug: true,
    serverList: true,
    staticRoomFirstRoomDelay: 0
  };

  it('should return null for non-worldAdven__getAdventureDetails commands', () => {
    const result = handleGetAdventureDetails('{"t":"xt","b":{"r":20,"c":"some_other_cmd"}}', dummyConfig);
    expect(result).toBeNull();
  });

  it('should successfully handle worldAdven__getAdventureDetails and preserve request room id', () => {
    const packet = '{"t":"xt","b":{"r":20,"c":"worldAdven__getAdventureDetails","o":{}}}';
    const result = handleGetAdventureDetails(packet, dummyConfig);

    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.t).toBe('xt');
    expect(parsed.b.r).toBe(20);
    expect(parsed.b.c).toBe('worldAdven__getAdventureDetails');
    expect(parsed.b.o.id).toBe(0);
    expect(parsed.b.o.name).toBe('');
    expect(parsed.b.o.showProgress).toBe(false);
    expect(parsed.b.o.showBag).toBe(false);
    expect(parsed.b.o.showScroll).toBe(false);
    expect(parsed.b.o.items).toEqual([]);
    expect(parsed.b.o.isItemDraggable).toBe(false);
  });
});

describe('SFS rooms__getStaticRoomList Handler', () => {
  const baseConfig: ServerConfig = {
    httpPort: 8080,
    socketPort: 9339,
    policyPort: 843,
    assetsPath: './xyz',
    runtimeMode: 'web-container',
    entrySwf: 'Login.swf',
    publicHost: '127.0.0.1',
    acceptAnyLogin: true,
    defaultUserModerator: true,
    sendRoomListAfterLogin: false,
    defaultRoomName: 'room_20',
    defaultRoomId: 20,
    verboseHttp: false,
    debugAssetsPath: './debug-assets',
    ruffleRuntimeDir: null,
    compatFixLanguageXml: true,
    compatLoginGraphicsAlias: null,
    sendLoginExtensionAfterLogOk: false,
    compatLoginFirstLoadingScreensMode: 'clean-single',
    defaultLanguage: 1,
    blueboxLoginExtensionOnly: false,
    blueboxLoginMode: 'rmList-login',
    flashDebug: false,
    serverList: true,
    staticRoomFirstRoomDelay: 0
  };

  const staticRoomListPacket = '{"t":"xt","b":{"r":-1,"c":"rooms__getStaticRoomList","o":{}}}';

  it('should return null for non-rooms__getStaticRoomList commands', () => {
    const result = handleGetStaticRoomList('{"t":"xt","b":{"r":-1,"c":"some_other_cmd"}}', baseConfig);
    expect(result).toBeNull();
  });

  it('should emit fR: 0 by default (no pre-join delay)', () => {
    const result = handleGetStaticRoomList(staticRoomListPacket, baseConfig);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!.packet);
    expect(parsed.b.c).toBe('rooms__getStaticRoomList');
    const room = parsed.b.o.StaticRooms[0];
    expect(room.fR).toBe(0);
    expect(room.rId).toBe(20);
    expect(room.rN).toBe('room_20');
  });
 
  it('should strip room_ prefix from rN when compatStaticRoomNameStripPrefix is true', () => {
    const configWithStrip = { ...baseConfig, compatStaticRoomNameStripPrefix: true };
    const result = handleGetStaticRoomList(staticRoomListPacket, configWithStrip);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!.packet);
    const room = parsed.b.o.StaticRooms[0];
    expect(room.rId).toBe(20);
    expect(room.rN).toBe('20');
  });

  it('should emit fR matching staticRoomFirstRoomDelay when configured to 5', () => {
    const configWithDelay = { ...baseConfig, staticRoomFirstRoomDelay: 5 };
    const result = handleGetStaticRoomList(staticRoomListPacket, configWithDelay);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!.packet);
    const room = parsed.b.o.StaticRooms[0];
    expect(room.fR).toBe(5);
  });

  it('should emit fR: 15 when staticRoomFirstRoomDelay is 15 (legacy behaviour)', () => {
    const configLegacy = { ...baseConfig, staticRoomFirstRoomDelay: 15 };
    const result = handleGetStaticRoomList(staticRoomListPacket, configLegacy);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!.packet);
    const room = parsed.b.o.StaticRooms[0];
    expect(room.fR).toBe(15);
  });

  it('should include a static room catalog from existing room SWF/TXT files when assets are present', () => {
    const tempAssets = path.join(__dirname, 'temp_room_catalog_assets');
    const roomsDir = path.join(tempAssets, 'Swf', 'AssetsClean', 'Rooms');
    fs.mkdirSync(roomsDir, { recursive: true });
    fs.writeFileSync(path.join(roomsDir, 'room_20.swf'), 'swf20');
    fs.writeFileSync(path.join(roomsDir, 'room_20.txt'), '{}');
    fs.writeFileSync(path.join(roomsDir, 'room_50.swf'), 'swf50');
    fs.writeFileSync(path.join(roomsDir, 'room_50.txt'), '{}');

    try {
      const configWithCatalog = { ...baseConfig, assetsPath: tempAssets };
      const catalog = getStaticRoomCatalog(configWithCatalog);
      expect(catalog).toEqual([
        { id: 20, name: 'room_20', hasSwf: true, hasTxt: true },
        { id: 50, name: 'room_50', hasSwf: true, hasTxt: true }
      ]);

      const result = handleGetStaticRoomList(staticRoomListPacket, configWithCatalog);
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result!.packet);
      expect(parsed.b.o.StaticRooms.map((room: any) => room.rId)).toEqual([20, 50]);
      expect(parsed.b.o.StaticRooms.map((room: any) => room.rN)).toEqual(['room_20', 'room_50']);
    } finally {
      fs.rmSync(tempAssets, { recursive: true, force: true });
    }
  });
});

describe('SFS buddyList and minimal room handlers', () => {
  const dummyConfig: ServerConfig = {
    httpPort: 8080,
    socketPort: 9339,
    policyPort: 843,
    assetsPath: './xyz',
    runtimeMode: 'web-container',
    entrySwf: 'Login.swf',
    publicHost: '127.0.0.1',
    acceptAnyLogin: true,
    defaultUserModerator: true,
    sendRoomListAfterLogin: true,
    defaultRoomName: 'room_20',
    defaultRoomId: 1,
    verboseHttp: false,
    debugAssetsPath: './debug-assets',
    ruffleRuntimeDir: null,
    compatFixLanguageXml: true,
    compatLoginGraphicsAlias: null,
    sendLoginExtensionAfterLogOk: false,
    compatLoginFirstLoadingScreensMode: 'clean-single',
    defaultLanguage: 4,
    blueboxLoginExtensionOnly: false,
    blueboxLoginMode: 'deferred',
    flashDebug: true,
    serverList: true,
    staticRoomFirstRoomDelay: 0
  };

  it('handleGetUserBuddies should return buddy list with showPage and buddies array', () => {
    const packet = '{"t":"xt","b":{"r":20,"c":"buddyList__getUserBuddies","o":{"showPage":2}}}';
    const result = handleGetUserBuddies(packet, dummyConfig);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!.packet);
    expect(parsed.b.c).toBe('buddyList__getUserBuddies');
    expect(parsed.b.o._cmd).toBe('buddyList__getUserBuddies');
    expect(parsed.b.o.showPage).toBe(2);
    expect(parsed.b.o.buddies).toEqual([]);
  });

  it('handleGetRoomElements should return empty room elements list with _cmd', () => {
    const packet = '{"t":"xt","b":{"r":20,"c":"worldAdven__getRoomElements","o":{}}}';
    const result = handleGetRoomElements(packet, dummyConfig);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.b.c).toBe('worldAdven__getRoomElements');
    expect(parsed.b.o._cmd).toBe('worldAdven__getRoomElements');
    expect(parsed.b.o.elements).toEqual([]);
  });

  it('handleGetWorldUserItems should return empty user items list with _cmd', () => {
    const packet = '{"t":"xt","b":{"r":20,"c":"worldAdven__getUserItems","o":{}}}';
    const result = handleGetWorldUserItems(packet, dummyConfig);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.b.c).toBe('worldAdven__getUserItems');
    expect(parsed.b.o._cmd).toBe('worldAdven__getUserItems');
    expect(parsed.b.o.items).toEqual([]);
  });

  it('handleGetInventoryItems should return empty items list with _cmd and userId', () => {
    const packet = '{"t":"xt","b":{"r":20,"c":"user__getInventoryItems","o":{"userId":42}}}';
    const result = handleGetInventoryItems(packet, dummyConfig);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.b.c).toBe('user__getInventoryItems');
    expect(parsed.b.o._cmd).toBe('user__getInventoryItems');
    expect(parsed.b.o.items).toEqual([]);
    expect(parsed.b.o.userId).toBe(42);
  });

  it('handleGetMessageTemplates should return mock template with _cmd and wmr: 5', () => {
    const packet = '{"t":"xt","b":{"r":20,"c":"wall__getMessageTemplates","o":{}}}';
    const result = handleGetMessageTemplates(packet, dummyConfig);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.b.c).toBe('wall__getMessageTemplates');
    expect(parsed.b.o._cmd).toBe('wall__getMessageTemplates');
    expect(parsed.b.o.wmsgt).toEqual([{
      tmId: 1,
      tyId: 1,
      p: 0,
      mt: 1,
      ipm: "",
      ipt: "",
      hl: ""
    }]);
    expect(parsed.b.o.wmr).toBe(5);
  });

  it('handleSendCustomMessage should return status: -1 with _cmd', () => {
    const packet = '{"t":"xt","b":{"r":20,"c":"wall__sendCustomMessage","o":{}}}';
    const result = handleSendCustomMessage(packet, dummyConfig);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.b.c).toBe('wall__sendCustomMessage');
    expect(parsed.b.o._cmd).toBe('wall__sendCustomMessage');
    expect(parsed.b.o.status).toBe(-1);
  });

  it('handleDeleteUserMessage should return status: true and echoes wmsgId with _cmd', () => {
    const packet = '{"t":"xt","b":{"r":20,"c":"wall__deleteUserMessage","o":{"wmsgId":123}}}';
    const result = handleDeleteUserMessage(packet, dummyConfig);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.b.c).toBe('wall__deleteUserMessage');
    expect(parsed.b.o._cmd).toBe('wall__deleteUserMessage');
    expect(parsed.b.o.status).toBe(true);
    expect(parsed.b.o.wmsgId).toBe(123);
  });

  it('handleSetMessageRead should return echoes wmsgId with _cmd', () => {
    const packet = '{"t":"xt","b":{"r":20,"c":"wall__setMessageRead","o":{"wmsgId":456}}}';
    const result = handleSetMessageRead(packet, dummyConfig);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.b.c).toBe('wall__setMessageRead');
    expect(parsed.b.o._cmd).toBe('wall__setMessageRead');
    expect(parsed.b.o.wmsgId).toBe(456);
  });
});
