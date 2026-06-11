import { describe, it, expect, beforeEach } from 'vitest';
import { handleLogin, resetSessions, activeSessions, cleanUsername } from '../handlers/login';
import { handleRoomJoin, handleGetUserData, handleGetUserBuddies, handleGetUserMessages, handleGetNumUnReadMessages, handleGetAdventureDetails } from '../handlers/room';
import { ServerConfig } from '@flash-socket-server/core';

describe('SFS Actions, Profiles and Nicknames tests', () => {
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
    defaultLanguage: 4,
    blueboxLoginExtensionOnly: false,
    blueboxLoginMode: 'deferred',
    flashDebug: true,
    serverList: true,
    staticRoomFirstRoomDelay: 0
  };

  beforeEach(() => {
    resetSessions();
  });

  describe('Username Display Cleaning', () => {
    it('should correctly extract display name from SFS raw login nickname', () => {
      expect(cleanUsername('::0:john:1')).toBe('john');
      expect(cleanUsername('::1:alex:0')).toBe('alex');
      expect(cleanUsername('alex')).toBe('alex');
    });

    it('should strip Hebrew BiDi prefix from "::0:שששaaaa:1" → "aaaa"', () => {
      // ששש is a Hebrew RTL BiDi artifact prepended when Latin text is typed in RTL field
      expect(cleanUsername('::0:שששaaaa:1')).toBe('aaaa');
    });

    it('should keep fully Hebrew username intact "::0:משתמש:1" → "משתמש"', () => {
      // Fully Hebrew username — not a BiDi artifact, preserve as-is
      expect(cleanUsername('::0:משתמש:1')).toBe('משתמש');
    });

    it('should return plain name unchanged when no SFS encoding', () => {
      expect(cleanUsername('plainName')).toBe('plainName');
    });

    it('should strip any leading Hebrew prefix when Latin chars follow', () => {
      // Any combination: שש prefix + Latin
      expect(cleanUsername('::0:ששuser123:1')).toBe('user123');
      // Single Hebrew char prefix + Latin
      expect(cleanUsername('::0:שtest:1')).toBe('test');
      // Mixed: Hebrew then numbers only (numbers are non-Hebrew, so strip prefix)
      expect(cleanUsername('::0:ששש12345:1')).toBe('12345');
    });

    it('should handle empty middle segment gracefully', () => {
      // Edge: encoded but empty username
      expect(cleanUsername('::0::1')).toBe('');
    });

    it('should login with the original raw nickname but join rooms and profiles with clean display name', () => {
      // 1. Setup session with raw nick
      const rawNick = '::0:steve:1';
      const loginPacket = `<msg t='sys'><body action='login' r='0'><login z='worlds4u'><nick><![CDATA[${rawNick}]]></nick><pass><![CDATA[pass]]></pass></login></body></msg>`;
      const loginRes = handleLogin(loginPacket, dummyConfig);
      
      expect(loginRes).not.toBeNull();
      expect(activeSessions.size).toBe(1);
      
      const session = Array.from(activeSessions.values())[0];
      // Login/session identity MUST be kept raw
      expect(session.username).toBe(rawNick);

      // 2. Perform room join
      const joinPacket = `<msg t='sys'><body action='joinRoom' r='20'><room id='20' o='-1' spec='0' p='' /></body></msg>`;
      const joinRes = handleRoomJoin(joinPacket, session.userId, dummyConfig);
      
      expect(joinRes).not.toBeNull();
      // uLs/uList XML must contain cleaned name
      expect(joinRes![0]).toContain('<n><![CDATA[steve]]></n>');
      expect(joinRes![0]).not.toContain('::0:steve:1');
    });

    it('should produce clean display name for Hebrew BiDi prefix nick in room join', () => {
      // The key end-to-end regression: ::0:שששaaaa:1 → avatar displays "aaaa"
      const rawNick = '::0:שששaaaa:1';
      const loginPacket = `<msg t='sys'><body action='login' r='0'><login z='worlds4u'><nick><![CDATA[${rawNick}]]></nick><pass><![CDATA[pass]]></pass></login></body></msg>`;
      handleLogin(loginPacket, dummyConfig);
      
      const session = Array.from(activeSessions.values())[0];
      expect(session.username).toBe(rawNick); // raw nick preserved in session

      const joinPacket = `<msg t='sys'><body action='joinRoom' r='20'><room id='20' o='-1' spec='0' p='' /></body></msg>`;
      const joinRes = handleRoomJoin(joinPacket, session.userId, dummyConfig);
      
      expect(joinRes).not.toBeNull();
      // Avatar name must be "aaaa", NOT "שששaaaa"
      expect(joinRes![0]).toContain('<n><![CDATA[aaaa]]></n>');
      expect(joinRes![0]).not.toContain('שששaaaa');
    });

    it('should produce clean display name for fully Hebrew nick in room join', () => {
      const rawNick = '::0:משתמש:1';
      const loginPacket = `<msg t='sys'><body action='login' r='0'><login z='worlds4u'><nick><![CDATA[${rawNick}]]></nick><pass><![CDATA[pass]]></pass></login></body></msg>`;
      handleLogin(loginPacket, dummyConfig);
      
      const session = Array.from(activeSessions.values())[0];
      const joinPacket = `<msg t='sys'><body action='joinRoom' r='20'><room id='20' o='-1' spec='0' p='' /></body></msg>`;
      const joinRes = handleRoomJoin(joinPacket, session.userId, dummyConfig);
      
      expect(joinRes).not.toBeNull();
      // Fully Hebrew username preserved
      expect(joinRes![0]).toContain('<n><![CDATA[משתמש]]></n>');
    });
  });


  describe('Player Card and Profile commands', () => {
    it('should retrieve dynamic coordinate and mo_1 currency variables from active session for profile commands', () => {
      // 1. Create a session with raw nickname and customize coordinates/money
      const rawNick = '::0:player1:1';
      const loginPacket = `<msg t='sys'><body action='login' r='0'><login z='worlds4u'><nick><![CDATA[${rawNick}]]></nick><pass><![CDATA[pass]]></pass></login></body></msg>`;
      handleLogin(loginPacket, dummyConfig);
      
      const session = Array.from(activeSessions.values())[0];
      session.x = 420;
      session.y = 240;
      session.AD = 3;
      session.mo_1 = 8888;

      // 2. Test user__getUserCard
      const cardPacket = `{"t":"xt","b":{"r":20,"c":"user__getUserCard","o":{"userId":${session.userId}}}}`;
      const cardRes = handleGetUserData(cardPacket, dummyConfig);
      
      expect(cardRes).not.toBeNull();
      const cardObj = JSON.parse(cardRes!);
      expect(cardObj.b.o.userName).toBe('player1');
      expect(cardObj.b.o.userId).toBe(session.userId);
      expect(cardObj.b.o.x).toBe(420);
      expect(cardObj.b.o.y).toBe(240);
      expect(cardObj.b.o.AD).toBe(3);
      expect(cardObj.b.o.mo_1).toBe(8888);

      // 3. Test user__getUserCardInfo stub metadata
      const cardInfoPacket = `{"t":"xt","b":{"r":20,"c":"user__getUserCardInfo","o":{"userId":${session.userId}}}}`;
      const cardInfoRes = handleGetUserData(cardInfoPacket, dummyConfig);
      
      expect(cardInfoRes).not.toBeNull();
      const cardInfoObj = JSON.parse(cardInfoRes!);
      expect(cardInfoObj.b.o.userName).toBe('player1');
      expect(cardInfoObj.b.o.groups).toEqual([]);
      expect(cardInfoObj.b.o.member).toBe(true);

      // 4. Test user__getUserTO command mapping and online flags
      const toPacket = `{"t":"xt","b":{"r":20,"c":"user__getUserTO","o":{"id":${session.userId}}}}`;
      const toRes = handleGetUserData(toPacket, dummyConfig);
      
      expect(toRes).not.toBeNull();
      const toObj = JSON.parse(toRes!);
      expect(toObj.b.c).toBe('user__getBuddy');
      expect(toObj.b.o._cmd).toBe('user__getBuddy');
      expect(toObj.b.o.online).toBe(true);
      expect(toObj.b.o.isOnline).toBe(true);
      expect(toObj.b.o.isOneline).toBe(true);
      expect(toObj.b.o.userName).toBe('player1');
      expect(toObj.b.o.mo_1).toBe(8888);
      expect(toObj.b.o.x).toBe(420);
    });

    it('should echo exact raw userName for user__getUserCardInfo, but return clean name for user__getUserCard', () => {
      // 1. Create a session with raw nickname
      const rawNick = '::0:שששtestuser:1';
      const loginPacket = `<msg t='sys'><body action='login' r='0'><login z='worlds4u'><nick><![CDATA[${rawNick}]]></nick><pass><![CDATA[pass]]></pass></login></body></msg>`;
      handleLogin(loginPacket, dummyConfig);
      
      const session = Array.from(activeSessions.values())[0];

      // 2. user__getUserCardInfo with raw userName in request should echo raw name
      const cardInfoPacket = `{"t":"xt","b":{"r":20,"c":"user__getUserCardInfo","o":{"userId":${session.userId},"userName":"${rawNick}"}}}`;
      const cardInfoRes = handleGetUserData(cardInfoPacket, dummyConfig);
      
      expect(cardInfoRes).not.toBeNull();
      const cardInfoObj = JSON.parse(cardInfoRes!);
      expect(cardInfoObj.b.o.userName).toBe(rawNick); // Must echo raw username exactly

      // 3. user__getUserCard with raw userName in request should return clean displayName
      const cardPacket = `{"t":"xt","b":{"r":20,"c":"user__getUserCard","o":{"userName":"${rawNick}"}}}`;
      const cardRes = handleGetUserData(cardPacket, dummyConfig);
      
      expect(cardRes).not.toBeNull();
      const cardObj = JSON.parse(cardRes!);
      expect(cardObj.b.o.userName).toBe('testuser'); // Must return clean displayName
    });

    it('should support session lookup by userId, raw username, and clean username', () => {
      const rawNick1 = '::0:john:1';
      const rawNick2 = '::0:שששmary:1';

      // Register two users
      const login1 = `<msg t='sys'><body action='login' r='0'><login z='worlds4u'><nick><![CDATA[${rawNick1}]]></nick><pass><![CDATA[pass]]></pass></login></body></msg>`;
      const login2 = `<msg t='sys'><body action='login' r='0'><login z='worlds4u'><nick><![CDATA[${rawNick2}]]></nick><pass><![CDATA[pass]]></pass></login></body></msg>`;
      
      handleLogin(login1, dummyConfig);
      handleLogin(login2, dummyConfig);

      const sessions = Array.from(activeSessions.values());
      const s1 = sessions.find(s => s.username === rawNick1)!;
      const s2 = sessions.find(s => s.username === rawNick2)!;

      // Lookup S2 by clean name
      const cleanNamePacket = `{"t":"xt","b":{"r":20,"c":"user__getUserTO","o":{"userName":"mary"}}}`;
      const cleanNameRes = handleGetUserData(cleanNamePacket, dummyConfig);
      expect(cleanNameRes).not.toBeNull();
      expect(JSON.parse(cleanNameRes!).b.o.userId).toBe(s2.userId);

      // Lookup S2 by raw name
      const rawNamePacket = `{"t":"xt","b":{"r":20,"c":"user__getUserTO","o":{"userName":"${rawNick2}"}}}`;
      const rawNameRes = handleGetUserData(rawNamePacket, dummyConfig);
      expect(rawNameRes).not.toBeNull();
      expect(JSON.parse(rawNameRes!).b.o.userId).toBe(s2.userId);

      // Lookup S1 by ID
      const idPacket = `{"t":"xt","b":{"r":20,"c":"user__getUserTO","o":{"userId":${s1.userId}}}}`;
      const idRes = handleGetUserData(idPacket, dummyConfig);
      expect(idRes).not.toBeNull();
      expect(JSON.parse(idRes!).b.o.userId).toBe(s1.userId);
    });

    it('should support base64 encoded p.d request payloads and correctly clean or echo raw usernames', () => {
      const rawNick = '::0:admin:1';
      const loginPacket = `<msg t='sys'><body action='login' r='0'><login z='worlds4u'><nick><![CDATA[${rawNick}]]></nick><pass><![CDATA[pass]]></pass></login></body></msg>`;
      handleLogin(loginPacket, dummyConfig);
      
      const session = Array.from(activeSessions.values())[0];

      // 1. user__getUserCardInfo with base64 p.d payload
      const infoObj = { userId: session.userId, userName: rawNick };
      const infoBase64 = Buffer.from(JSON.stringify(infoObj)).toString('base64');
      const infoPacket = `{"t":"xt","b":{"r":20,"c":"user__getUserCardInfo","p":{"d":"${infoBase64}"}}}`;
      
      const infoRes = handleGetUserData(infoPacket, dummyConfig);
      expect(infoRes).not.toBeNull();
      const infoObjRes = JSON.parse(infoRes!);
      expect(infoObjRes.b.o.userName).toBe(rawNick); // Must echo raw username exactly
      expect(infoObjRes.b.o.hearts).toBeDefined();
      expect(infoObjRes.b.o.hearts.h).toBe(5);
      expect(infoObjRes.b.o.hearts.ch).toBe(5);
      expect(infoObjRes.b.o.hearts.dh).toBe(0);

      // 2. user__getUserCard with base64 p.d payload
      const cardObjReq = { userName: rawNick };
      const cardBase64 = Buffer.from(JSON.stringify(cardObjReq)).toString('base64');
      const cardPacket = `{"t":"xt","b":{"r":20,"c":"user__getUserCard","p":{"d":"${cardBase64}"}}}`;
      
      const cardRes = handleGetUserData(cardPacket, dummyConfig);
      expect(cardRes).not.toBeNull();
      const cardObjRes = JSON.parse(cardRes!);
      expect(cardObjRes.b.o.userName).toBe('admin'); // Must return clean displayName
    });

    it('should support base64 encoded p.d request payloads for buddyList__getUserBuddies and preserve showPage', () => {
      // 1. Request with showPage 3
      const reqObj3 = { showPage: 3 };
      const base64_3 = Buffer.from(JSON.stringify(reqObj3)).toString('base64');
      const packet3 = `{"t":"xt","b":{"r":20,"c":"buddyList__getUserBuddies","p":{"d":"${base64_3}"}}}`;

      const res3 = handleGetUserBuddies(packet3, dummyConfig);
      expect(res3).not.toBeNull();
      const objRes3 = JSON.parse(res3!.packet);
      expect(objRes3.b.o.showPage).toBe(3);
      expect(res3!.decodedPd.showPage).toBe(3);

      // 2. Request with showPage 6
      const reqObj6 = { showPage: 6 };
      const base64_6 = Buffer.from(JSON.stringify(reqObj6)).toString('base64');
      const packet6 = `{"t":"xt","b":{"r":20,"c":"buddyList__getUserBuddies","p":{"d":"${base64_6}"}}}`;

      const res6 = handleGetUserBuddies(packet6, dummyConfig);
      expect(res6).not.toBeNull();
      const objRes6 = JSON.parse(res6!.packet);
      expect(objRes6.b.o.showPage).toBe(6);
      expect(res6!.decodedPd.showPage).toBe(6);
    });

    it('should include _cmd in wall__getUserMessages, wall__getNumUnReadMessages, and worldAdven__getAdventureDetails responses', () => {
      // 1. handleGetUserMessages
      const packet1 = `{"t":"xt","b":{"r":20,"c":"wall__getUserMessages","o":{}}}`;
      const res1 = handleGetUserMessages(packet1, dummyConfig);
      expect(res1).not.toBeNull();
      const obj1 = JSON.parse(res1!);
      expect(obj1.b.o._cmd).toBe('wall__getUserMessages');
      expect(obj1.b.o.wmsg).toEqual([]);

      // 2. handleGetNumUnReadMessages
      const packet2 = `{"t":"xt","b":{"r":20,"c":"wall__getNumUnReadMessages","o":{}}}`;
      const res2 = handleGetNumUnReadMessages(packet2, dummyConfig);
      expect(res2).not.toBeNull();
      const obj2 = JSON.parse(res2!);
      expect(obj2.b.o._cmd).toBe('wall__getNumUnReadMessages');
      expect(obj2.b.o.showSms).toBe(true);
      expect(obj2.b.o.wearSwimsuit).toBe(true);
      expect(obj2.b.o.petMagics).toEqual([]);
      expect(obj2.b.o.adminChat).toBe(true);
      expect(obj2.b.o.isVehicle).toBe(false);
      expect(obj2.b.o.newMsgs).toBe(false);

      // 3. handleGetAdventureDetails
      const packet3 = `{"t":"xt","b":{"r":20,"c":"worldAdven__getAdventureDetails","o":{}}}`;
      const res3 = handleGetAdventureDetails(packet3, dummyConfig);
      expect(res3).not.toBeNull();
      const obj3 = JSON.parse(res3!);
      expect(obj3.b.o._cmd).toBe('worldAdven__getAdventureDetails');
      expect(obj3.b.o.id).toBe(0);
      expect(obj3.b.o.items).toEqual([]);
    });
  });
});
