import { describe, it, expect, beforeEach } from 'vitest';
import { handleLogin, resetSessions, activeSessions } from '../handlers/login';
import { ServerConfig } from '@flash-socket-server/core';

describe('SFS XML Login Handler', () => {
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

  beforeEach(() => {
    resetSessions();
  });

  it('should ignore non-login packets', () => {
    const result = handleLogin("<msg t='sys'><body action='verChk' /></msg>", dummyConfig);
    expect(result).toBeNull();
  });

  it('should successfully parse standard login XML with CDATA nick/pass and extract zone', () => {
    const packet = `<msg t='sys'><body action='login' r='0'><login z='worlds4u'><nick><![CDATA[myUser]]></nick><pass><![CDATA[myPass]]></pass></login></body></msg>`;
    
    const result = handleLogin(packet, dummyConfig);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1); // Only logOK, since sendRoomListAfterLogin is false
    
    expect(result![0]).toContain("<body action='logOK'");
    expect(result![0]).toContain("n='myUser'");
    expect(result![0]).toContain("mod='1'");

    // Check active sessions
    expect(activeSessions.size).toBe(1);
    const session = Array.from(activeSessions.values())[0];
    expect(session.username).toBe('myUser');
    expect(session.userId).toBe(1);
    expect(session.isModerator).toBe(true);
  });

  it('should optionally append rmList when sendRoomListAfterLogin is configured true', () => {
    const packet = `<msg t='sys'><body action='login' r='0'><login z='worlds4u'><nick>testUser</nick><pass>testPass</pass></login></body></msg>`;
    
    const configWithRoom = {
      ...dummyConfig,
      sendRoomListAfterLogin: true,
      defaultRoomName: 'custom_room',
      defaultRoomId: 10
    };

    const result = handleLogin(packet, configWithRoom);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2); // Both logOK and rmList

    expect(result![0]).toContain("<body action='logOK'");
    
    expect(result![1]).toContain("<body action='rmList'");
    expect(result![1]).toContain("<n>custom_room</n>");
    expect(result![1]).toContain("id='10'");
  });

  it('should NOT emit experimental login extension packet when sendLoginExtensionAfterLogOk is false', () => {
    const packet = `<msg t='sys'><body action='login' r='0'><login z='worlds4u'><nick>testUser</nick><pass>testPass</pass></login></body></msg>`;
    const result = handleLogin(packet, dummyConfig);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1);
    expect(result![0]).toContain("<body action='logOK'");
    expect(result![0]).not.toContain('"_cmd":"login"');
  });

  it('should emit experimental login extension packet when sendLoginExtensionAfterLogOk is true', () => {
    const packet = `<msg t='sys'><body action='login' r='0'><login z='worlds4u'><nick>testUser</nick><pass>testPass</pass></login></body></msg>`;
    const configWithExtension = {
      ...dummyConfig,
      sendLoginExtensionAfterLogOk: true
    };
    const result = handleLogin(packet, configWithExtension);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2); // logOK and the custom extension response packet
    expect(result![0]).toContain("<body action='logOK'");
    
    const extensionPacket = result![1];
    expect(extensionPacket).toContain('"_cmd":"login"');
    const parsedPacket = JSON.parse(extensionPacket);
    expect(parsedPacket.t).toBe('xt');
    expect(parsedPacket.b.c).toBe('login');
    expect(parsedPacket.b.p).toBeUndefined(); // Verification that it does not use 'p'
    expect(parsedPacket.b.o).toBeDefined();   // Verification that it uses 'o'
    expect(parsedPacket.b.o._cmd).toBe('login');
    expect(parsedPacket.b.o.uSFSId).toBe(1);
    expect(parsedPacket.b.o.lang).toBe(4);
    expect(parsedPacket.b.o.worldAdvan).toBe(0);
    expect(Array.isArray(parsedPacket.b.o.ld)).toBe(true);
    expect(parsedPacket.b.o.ld.length).toBe(2);
    expect(parsedPacket.b.o.ld[0]).toEqual({ i: 1, t: 2 });
  });

  it('should emit experimental login extension packet with custom defaultLanguage if configured', () => {
    const packet = `<msg t='sys'><body action='login' r='0'><login z='worlds4u'><nick>testUser</nick><pass>testPass</pass></login></body></msg>`;
    const configWithExtension = {
      ...dummyConfig,
      sendLoginExtensionAfterLogOk: true,
      defaultLanguage: 1
    };
    const result = handleLogin(packet, configWithExtension);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
    expect(result![0]).toContain("<body action='logOK'");
    
    const extensionPacket = result![1];
    const parsedPacket = JSON.parse(extensionPacket);
    expect(parsedPacket.b.o.lang).toBe(1);
  });
});
