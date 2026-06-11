import { describe, it, expect, beforeEach, vi } from 'vitest';
import fastify from 'fastify';
import { ServerConfig, logger, timelineManager, ruffleDiagnosticsManager } from '@flash-socket-server/core';
import { registerBlueBoxRoute, capturedRequests, capturedNonPollRequests, activeSessions } from '../routes/blueBox';
import { resetSessions } from '@flash-socket-server/sfs-emulator';

describe('HTTP Gateway BlueBox Diagnostic Route', () => {
  const dummyConfig: ServerConfig = {
    httpPort: 8080,
    socketPort: 9339,
    policyPort: 843,
    assetsPath: './non_existent_folder_xyz',
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

  const createTestApp = () => {
    const app = fastify({ bodyLimit: 10 * 1024 * 1024 });
    registerBlueBoxRoute(app, dummyConfig);
    return app;
  };

  beforeEach(() => {
    capturedRequests.length = 0; // Clear captured requests list
    capturedNonPollRequests.length = 0;
    activeSessions.clear();
    resetSessions();
    ruffleDiagnosticsManager.clear();
  });

  it('should support CORS headers and preflight OPTIONS request for allowed origins', async () => {
    const app = createTestApp();
    
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/BlueBox/HttpBox.do',
      headers: {
        origin: 'http://localhost:8080'
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:8080');
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(response.headers['vary']).toBe('Origin');
  });

  it('should omit CORS headers for disallowed origins', async () => {
    const app = createTestApp();
    
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/BlueBox/HttpBox.do',
      headers: {
        origin: 'http://malicious.com'
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-methods']).toBeUndefined();
  });

  it('should support CORS headers on POST requests for allowed origins', async () => {
    const app = createTestApp();
    
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: {
        origin: 'http://127.0.0.1:8080',
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: 'sfsHttp=connect'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:8080');
    expect(response.headers['vary']).toBe('Origin');
  });

  it('should return a 32-character session ID prefixed with # for connect requests', async () => {
    const app = createTestApp();
    const payload = 'sfsHttp=connect';
    
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload
    });

    expect(response.statusCode).toBe(200);
    // Connection handshake variant must start with # and be followed by 32 character session ID + \n
    expect(response.body).toMatch(/^#[a-f0-9]{32}\n$/);

    const generatedSessionId = response.body.substring(1, 33);
    const session = activeSessions.get(generatedSessionId);
    expect(session).toBeDefined();
    expect(session?.queue).toEqual([]);

    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0].sfsHttp).toBe('connect');
    expect(capturedRequests[0].sessionId).toBe(generatedSessionId);
    expect(capturedRequests[0].responseBody).toBe(`#${generatedSessionId}\n`);
  });

  it('should return ok\\n for poll requests with an active session ID and empty queue', async () => {
    const app = createTestApp();
    
    // Simulate active session
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: `sfsHttp=${sessionId}poll`
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('ok\n');

    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0].sessionId).toBe(sessionId);
    expect(capturedRequests[0].sfsHttp).toBe(`${sessionId}poll`);
    expect(capturedRequests[0].responseBody).toBe('ok\n');
  });

  it('should suppress verbose per-poll logs by default while keeping poll diagnostics', async () => {
    const infoSpy = vi.spyOn(logger, 'info');
    const app = createTestApp();

    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: `sfsHttp=${sessionId}poll`
    });

    expect(response.statusCode).toBe(200);
    expect(capturedRequests).toHaveLength(1);
    expect(activeSessions.get(sessionId)?.pollCount).toBe(1);
    expect(infoSpy.mock.calls.some(call => String(call[1] || '').includes('Poll for session'))).toBe(false);
    expect(infoSpy.mock.calls.some(call => String(call[1] || '').includes('raw body:'))).toBe(false);

    infoSpy.mockRestore();
  });

  it('should log per-poll details when verboseBlueboxPolls is enabled', async () => {
    const infoSpy = vi.spyOn(logger, 'info');
    const app = fastify({ bodyLimit: 10 * 1024 * 1024 });
    registerBlueBoxRoute(app, {
      ...dummyConfig,
      verboseBlueboxPolls: true
    });

    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: `sfsHttp=${sessionId}poll`
    });

    expect(response.statusCode).toBe(200);
    expect(infoSpy.mock.calls.some(call => String(call[1] || '').includes('Poll for session'))).toBe(true);
    expect(infoSpy.mock.calls.some(call => String(call[1] || '').includes('raw body:'))).toBe(true);

    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.verboseBlueboxPolls).toBe(true);
    expect(summary.pollCount).toBe(1);

    infoSpy.mockRestore();
  });

  it('should return queued packets joined by newlines for poll requests', async () => {
    const app = createTestApp();
    
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { 
      sessionId, 
      created: Date.now(), 
      queue: ['packet1', 'packet2'] 
    });

    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: `sfsHttp=${sessionId}poll`
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('packet1\npacket2\n');
    expect(activeSessions.get(sessionId)?.queue).toEqual([]);
  });

  it('should process verChk over BlueBox and return apiOK immediately', async () => {
    const app = createTestApp();
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const verChkXml = "<msg t='sys'><body action='verChk' r='0'><ver v='158'/></body></msg>";
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: `sfsHttp=${sessionId}${verChkXml}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("<msg t='sys'><body action='apiOK' r='0'></body></msg>\n");
    expect(activeSessions.get(sessionId)?.apiOkDelayAppliedAt).toBeUndefined();
  });

  it('should delay only the apiOK response when configured and record diagnostics', async () => {
    const app = fastify({ bodyLimit: 10 * 1024 * 1024 });
    registerBlueBoxRoute(app, {
      ...dummyConfig,
      blueboxApiOkDelayMs: 30
    });
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const verChkXml = "<msg t='sys'><body action='verChk' r='0'><ver v='158'/></body></msg>";
    const startedAt = Date.now();
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: `sfsHttp=${sessionId}${verChkXml}`
    });
    const elapsed = Date.now() - startedAt;

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("<msg t='sys'><body action='apiOK' r='0'></body></msg>\n");
    expect(elapsed).toBeGreaterThanOrEqual(25);

    const session = activeSessions.get(sessionId);
    expect(session?.apiOkDelayAppliedAt).toBeTypeOf('number');
    expect(session?.apiOkDelayReleasedAt).toBeTypeOf('number');
    expect(session?.apiOkDelayActualMs).toBeGreaterThanOrEqual(25);
    expect(session?.apiOKResponseAt).toBeGreaterThanOrEqual(session?.apiOkDelayReleasedAt || 0);

    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.blueboxApiOkDelayMs).toBe(30);
    expect(summary.apiOkDelayAppliedAt).toBe(session?.apiOkDelayAppliedAt);
    expect(summary.apiOkDelayReleasedAt).toBe(session?.apiOkDelayReleasedAt);
    expect(summary.apiOkDelayActualMs).toBe(session?.apiOkDelayActualMs);
    expect(summary.freezeDiagnostics.blueboxApiOkDelayMs).toBe(30);
  });

  it('should expose room transition diagnostics and mark completion after target room asset request', async () => {
    const app = createTestApp();
    const sessionId = 'abcdefabcdefabcdefabcdefabcdefab';
    activeSessions.set(sessionId, {
      sessionId,
      created: Date.now(),
      queue: [],
      roomsJumpToRoomSeen: true,
      roomsJumpToRoomDecodedPd: { nameId: 'room_50' },
      roomTransitionRequestedFromRoom: 20,
      roomTransitionTargetRoomId: 50,
      roomTransitionTargetRoomName: 'room_50',
      roomTransitionResponsePackets: ['sys.joinOK', 'xt.rooms__jumpToRoom'],
      roomTransitionJoinOkSent: true,
      roomTransitionUserListSent: true,
      currentRoomId: 50
    });
    ruffleDiagnosticsManager.recordRoomAssetRequest('/Swf/AssetsClean/Rooms/room_50.swf');
    ruffleDiagnosticsManager.recordRoomAssetRequest('/Swf/AssetsClean/Rooms/room_50.txt');

    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });

    expect(summaryResponse.statusCode).toBe(200);
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.roomsJumpToRoomSeen).toBe(true);
    expect(summary.roomTransitionRequestedFromRoom).toBe(20);
    expect(summary.roomTransitionTargetRoomId).toBe(50);
    expect(summary.roomTransitionTargetRoomName).toBe('room_50');
    expect(summary.roomTransitionResponsePackets).toEqual(['sys.joinOK', 'xt.rooms__jumpToRoom']);
    expect(summary.roomTransitionJoinOkSent).toBe(true);
    expect(summary.roomTransitionUserListSent).toBe(true);
    expect(summary.roomTransitionRoomAssetRequested).toBe(true);
    expect(summary.roomTransitionRoomTxtRequested).toBe(true);
    expect(summary.roomTransitionCompleted).toBe(true);
    expect(summary.lastRoomLoaded).toBe('room_50');
    expect(summary.currentRoomId).toBe(50);
  });

  it('should not delay login responses when apiOK delay is configured', async () => {
    const app = fastify({ bodyLimit: 10 * 1024 * 1024 });
    registerBlueBoxRoute(app, {
      ...dummyConfig,
      blueboxApiOkDelayMs: 50
    });
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const loginXml = "<msg t='sys'><body action='login' r='0'><nick><![CDATA[testuser]]></nick><pass><![CDATA[testpass]]></pass></body></msg>";
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: `sfsHttp=${sessionId}${loginXml}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("action='logOK'");
    expect(activeSessions.get(sessionId)?.apiOkDelayAppliedAt).toBeUndefined();
    expect(activeSessions.get(sessionId)?.apiOkDelayReleasedAt).toBeUndefined();
    expect(activeSessions.get(sessionId)?.apiOkDelayActualMs).toBeUndefined();
  });

  it('should process login over BlueBox and return logOK immediately', async () => {
    const app = createTestApp();
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const loginXml = "<msg t='sys'><body action='login' r='0'><nick><![CDATA[testuser]]></nick><pass><![CDATA[testpass]]></pass></body></msg>";
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: `sfsHttp=${sessionId}${loginXml}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("action='logOK'");
    expect(response.body).toContain("n='testuser'");
    
    // Check that session user ID was captured
    const session = activeSessions.get(sessionId);
    expect(session?.userId).toBeDefined();
  });

  it('should defer login extension to next poll when configured', async () => {
    const customConfig = {
      ...dummyConfig,
      sendLoginExtensionAfterLogOk: true,
      blueboxLoginExtensionOnly: false
    };
    const app = fastify({ bodyLimit: 10 * 1024 * 1024 });
    registerBlueBoxRoute(app, customConfig);

    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const loginXml = "<msg t='sys'><body action='login' r='0'><nick><![CDATA[testuser]]></nick><pass><![CDATA[testpass]]></pass></body></msg>";
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${loginXml}`
    });

    expect(response.statusCode).toBe(200);
    // Immediate response should NOT contain JSON extension, only logOK (and rmList if enabled)
    expect(response.body).toContain("action='logOK'");
    expect(response.body).not.toContain('"_cmd":"login"');

    // JSON extension must be queued
    const session = activeSessions.get(sessionId);
    expect(session?.queue).toHaveLength(1);
    expect(session?.queue[0]).toContain('"_cmd":"login"');

    // Next poll returns the queued JSON login extension
    const pollResponse = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}poll`
    });
    expect(pollResponse.statusCode).toBe(200);
    expect(pollResponse.body).toContain('"_cmd":"login"');
  });

  it('should support extension-only mode where logOK is omitted', async () => {
    const customConfig = {
      ...dummyConfig,
      sendLoginExtensionAfterLogOk: true,
      blueboxLoginExtensionOnly: true,
      blueboxLoginMode: undefined as any
    };
    const app = fastify({ bodyLimit: 10 * 1024 * 1024 });
    registerBlueBoxRoute(app, customConfig);

    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const loginXml = "<msg t='sys'><body action='login' r='0'><nick><![CDATA[testuser]]></nick><pass><![CDATA[testpass]]></pass></body></msg>";
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${loginXml}`
    });

    expect(response.statusCode).toBe(200);
    // Immediate response should contain BOTH JSON extension and rmList XML (no logOK)
    expect(response.body).toContain('"_cmd":"login"');
    expect(response.body).toContain("action='rmList' r='-1'");
    expect(response.body).not.toContain("action='logOK'");

    const session = activeSessions.get(sessionId);
    expect(session?.queue).toHaveLength(0); // Nothing queued
    expect(session?.loginResponseTypes).toEqual(['sys.rmList', 'xt.login']);
  });

  it('should support same-response mode with exact packet ordering', async () => {
    const customConfig = {
      ...dummyConfig,
      blueboxLoginMode: 'same-response' as const,
      sendRoomListAfterLogin: false
    };
    const app = fastify({ bodyLimit: 10 * 1024 * 1024 });
    registerBlueBoxRoute(app, customConfig);

    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const loginXml = "<msg t='sys'><body action='login' r='0'><nick><![CDATA[testuser]]></nick><pass><![CDATA[testpass]]></pass></body></msg>";
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${loginXml}`
    });

    expect(response.statusCode).toBe(200);
    // Packet order must be: sys.logOK first, then xt.login
    const lines = response.body.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("action='logOK'");
    expect(lines[1]).toContain('"_cmd":"login"');

    // rmList should NOT be present in login response since sendRoomListAfterLogin is false
    expect(response.body).not.toContain("action='rmList'");

    const session = activeSessions.get(sessionId);
    expect(session?.queue).toHaveLength(0); // Nothing queued
    expect(session?.loginResponseTypes).toEqual(['sys.logOK', 'xt.login']);

    // Check diagnostics summary
    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.loginMode).toBe('same-response');
    expect(summary.loginResponsePackets).toHaveLength(2);
    expect(summary.loginResponsePackets[0]).toContain("action='logOK'");
    expect(summary.loginResponsePackets[1]).toContain('"_cmd":"login"');
  });

  it('should support same-response-logko mode and convert logOK to logKO XML representation', async () => {
    const customConfig = {
      ...dummyConfig,
      blueboxLoginMode: 'same-response-logko' as const,
      sendRoomListAfterLogin: false
    };
    const app = fastify({ bodyLimit: 10 * 1024 * 1024 });
    registerBlueBoxRoute(app, customConfig);

    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const loginXml = "<msg t='sys'><body action='login' r='0'><nick><![CDATA[testuser]]></nick><pass><![CDATA[testpass]]></pass></body></msg>";
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${loginXml}`
    });

    expect(response.statusCode).toBe(200);
    // Packet order must be: sys.logKO, sys.rmList, then xt.login
    const lines = response.body.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("action='logKO'");
    expect(lines[0]).toContain("<login e='Suppressed standard login event' />");
    expect(lines[1]).toContain("action='rmList'");
    expect(lines[2]).toContain('"_cmd":"login"');

    // rmList should be present in login response unconditionally
    expect(response.body).toContain("action='rmList'");

    const session = activeSessions.get(sessionId);
    expect(session?.queue).toHaveLength(0); // Nothing queued
    expect(session?.loginResponseTypes).toEqual(['sys.logKO', 'sys.rmList', 'xt.login']);

    // Check diagnostics summary
    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.loginMode).toBe('same-response-logko');
    expect(summary.loginResponsePackets).toHaveLength(3);
    expect(summary.loginResponsePackets[0]).toContain("action='logKO'");
    expect(summary.loginResponsePackets[1]).toContain("action='rmList'");
    expect(summary.loginResponsePackets[2]).toContain('"_cmd":"login"');
  });

  it('should include rmList in same-response mode if sendRoomListAfterLogin is enabled', async () => {
    const customConfig = {
      ...dummyConfig,
      blueboxLoginMode: 'same-response' as const,
      sendRoomListAfterLogin: true
    };
    const app = fastify({ bodyLimit: 10 * 1024 * 1024 });
    registerBlueBoxRoute(app, customConfig);

    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const loginXml = "<msg t='sys'><body action='login' r='0'><nick><![CDATA[testuser]]></nick><pass><![CDATA[testpass]]></pass></body></msg>";
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${loginXml}`
    });

    expect(response.statusCode).toBe(200);
    const lines = response.body.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("action='logOK'");
    expect(lines[1]).toContain("action='rmList'");
    expect(lines[2]).toContain('"_cmd":"login"');
  });

  it('should support rmList-login-logko mode: sys.rmList -> xt.login -> sys.logKO', async () => {
    const customConfig = {
      ...dummyConfig,
      blueboxLoginMode: 'rmList-login-logko' as const,
    };
    const app = fastify({ bodyLimit: 10 * 1024 * 1024 });
    registerBlueBoxRoute(app, customConfig);

    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const loginXml = "<msg t='sys'><body action='login' r='0'><nick><![CDATA[testuser]]></nick><pass><![CDATA[testpass]]></pass></body></msg>";
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${loginXml}`
    });

    expect(response.statusCode).toBe(200);
    const lines = response.body.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("action='rmList'");
    expect(lines[1]).toContain('"_cmd":"login"');
    expect(lines[2]).toContain("action='logKO'");
    expect(lines[2]).toContain("<login e='Suppressed standard login event' />");

    const session = activeSessions.get(sessionId);
    expect(session?.loginResponseTypes).toEqual(['sys.rmList', 'xt.login', 'sys.logKO']);
    expect(session?.loginMode).toBe('rmList-login-logko');
  });

  it('should support rmList-login mode: sys.rmList -> xt.login only, no logOK or logKO', async () => {
    const customConfig = {
      ...dummyConfig,
      blueboxLoginMode: 'rmList-login' as const,
    };
    const app = fastify({ bodyLimit: 10 * 1024 * 1024 });
    registerBlueBoxRoute(app, customConfig);

    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const loginXml = "<msg t='sys'><body action='login' r='0'><nick><![CDATA[testuser]]></nick><pass><![CDATA[testpass]]></pass></body></msg>";
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${loginXml}`
    });

    expect(response.statusCode).toBe(200);
    const lines = response.body.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("action='rmList'");
    expect(lines[1]).toContain('"_cmd":"login"');
    expect(response.body).not.toContain("action='logOK'");
    expect(response.body).not.toContain("action='logKO'");

    const session = activeSessions.get(sessionId);
    expect(session?.loginResponseTypes).toEqual(['sys.rmList', 'xt.login']);
    expect(session?.loginMode).toBe('rmList-login-combined');
  });

  it('should support rmList-login-split-poll mode: sys.rmList in login response, xt.login on first poll', async () => {
    const app = fastify({ bodyLimit: 10 * 1024 * 1024 });
    registerBlueBoxRoute(app, {
      ...dummyConfig,
      blueboxLoginMode: 'rmList-login-split-poll'
    });

    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const loginXml = "<msg t='sys'><body action='login' r='0'><nick><![CDATA[testuser]]></nick><pass><![CDATA[testpass]]></pass></body></msg>";
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${loginXml}`
    });

    expect(response.statusCode).toBe(200);
    const lines = response.body.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("action='rmList'");
    expect(response.body).not.toContain('"_cmd":"login"');

    const pollResponse = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}poll`
    });

    expect(pollResponse.statusCode).toBe(200);
    expect(pollResponse.body.trim()).toContain('"_cmd":"login"');

    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.loginResponsePackets).toEqual([expect.stringContaining("action='rmList'")]);
    expect(summary.firstPollAfterLoginResponsePackets).toEqual(['xt.login']);
    expect(summary.blueboxLoginDeliveryMode).toBe('rmList-login-split-poll');
  });

  it('should support split-rmList-xtLogin mode: sys.rmList in login response, xt.login on next non-poll command', async () => {
    const app = fastify({ bodyLimit: 10 * 1024 * 1024 });
    registerBlueBoxRoute(app, {
      ...dummyConfig,
      blueboxLoginMode: 'split-rmList-xtLogin' as any
    });

    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const loginXml = "<msg t='sys'><body action='login' r='0'><nick><![CDATA[testuser]]></nick><pass><![CDATA[testpass]]></pass></body></msg>";
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${loginXml}`
    });

    expect(loginResponse.body.trim()).toContain("action='rmList'");
    expect(loginResponse.body).not.toContain('"_cmd":"login"');
    expect(activeSessions.get(sessionId)?.deferredXtLogin).toContain('"_cmd":"login"');

    const verChkXml = "<msg t='sys'><body action='verChk' r='0'><ver v='158'/></body></msg>";
    const nextCommandResponse = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${verChkXml}`
    });

    const lines = nextCommandResponse.body.trim().split('\n');
    expect(lines[0]).toContain('"_cmd":"login"');
    expect(lines[1]).toContain("action='apiOK'");
  });

  it('should support xt-login-only mode: xt.login in login response without rmList or logOK', async () => {
    const app = fastify({ bodyLimit: 10 * 1024 * 1024 });
    registerBlueBoxRoute(app, {
      ...dummyConfig,
      blueboxLoginMode: 'xt-login-only' as any
    });

    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const loginXml = "<msg t='sys'><body action='login' r='0'><nick><![CDATA[testuser]]></nick><pass><![CDATA[testpass]]></pass></body></msg>";
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${loginXml}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.trim()).toContain('"_cmd":"login"');
    expect(response.body).not.toContain("action='rmList'");
    expect(response.body).not.toContain("action='logOK'");
    expect(activeSessions.get(sessionId)?.loginResponseTypes).toEqual(['xt.login']);
  });

  it('should process getRmList over BlueBox and return rmList immediately', async () => {
    const app = createTestApp();
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const getRmListXml = "<msg t='sys'><body action='getRmList' r='0'></body></msg>";
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: `sfsHttp=${sessionId}${getRmListXml}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("action='rmList'");
    expect(response.body).toContain("room_20");
  });

  it('should return ok\\n and log warning for unknown session ID', async () => {
    const app = createTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: 'sfsHttp=99999999999999999999999999999999poll'
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('ok\n');
  });

  it('should capture text/plain requests, return ok\\n and not parse session', async () => {
    const app = createTestApp();
    const payload = 'raw plain text payload';

    const response = await app.inject({
      method: 'POST',
      url: '/bluebox/httpbox.do',
      headers: {
        'content-type': 'text/plain'
      },
      payload
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('ok\n');

    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0].contentType).toContain('text/plain');
    expect(capturedRequests[0].rawBody).toBe(payload);
    expect(capturedRequests[0].sessionId).toBeUndefined();
    expect(capturedRequests[0].responseBody).toBe('ok\n');
  });

  it('should truncate payload and mark truncated: true if it exceeds 1MB', async () => {
    const app = createTestApp();
    const largePayload = 'A'.repeat(1024 * 1024 + 10);

    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/httpbox.do',
      headers: {
        'content-type': 'application/octet-stream'
      },
      payload: largePayload
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('ok\n');

    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0].truncated).toBe(true);
    expect(capturedRequests[0].rawBody).toHaveLength(1024 * 1024);
  });

  it('should limit captured requests history to 100 entries', async () => {
    const app = createTestApp();

    for (let i = 0; i < 110; i++) {
      await app.inject({
        method: 'POST',
        url: '/BlueBox/HttpBox.do',
        headers: {
          'content-type': 'text/plain'
        },
        payload: `msg-${i}`
      });
    }

    expect(capturedRequests).toHaveLength(100);
    expect(capturedRequests[0].rawBody).toBe('msg-10');
    expect(capturedRequests[99].rawBody).toBe('msg-109');
  });

  it('should expose the captured request list via /debug/bluebox-report', async () => {
    const app = createTestApp();

    await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: {
        'content-type': 'text/plain'
      },
      payload: 'hello diagnostics'
    });

    const response = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-report'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');

    const body = JSON.parse(response.body);
    expect(body).toHaveLength(1);
    expect(body[0].rawBody).toBe('hello diagnostics');
    expect(body[0].responseBody).toBe('ok\n');
  });

  it('should expose a summary of BlueBox interactions via /debug/bluebox-summary', async () => {
    const app = createTestApp();

    // 1. Initial connect
    await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'sfsHttp=connect'
    });

    const sessionId = capturedRequests[0].sessionId;
    expect(sessionId).toBeDefined();

    // 2. verChk
    const verChkXml = "<msg t='sys'><body action='verChk' r='0'><ver v='158'/></body></msg>";
    await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${verChkXml}`
    });

    // 3. poll
    await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}poll`
    });

    // 4. Retrieve summary
    const response = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');

    const summary = JSON.parse(response.body);
    expect(summary.connectSeen).toBe(true);
    expect(summary.verChkSeen).toBe(true);
    expect(summary.loginSeen).toBe(false);
    expect(summary.pollCount).toBe(1);
    expect(summary.sessionId).toBe(sessionId);
    expect(summary.verboseBlueboxPolls).toBe(false);
  });

  it('should expose freeze timeline diagnostics for post-login room flow', async () => {
    const app = fastify({ bodyLimit: 10 * 1024 * 1024 });
    registerBlueBoxRoute(app, {
      ...dummyConfig,
      blueboxLoginMode: 'rmList-login-combined'
    });

    await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'sfsHttp=connect'
    });

    const sessionId = capturedRequests[0].sessionId;
    expect(sessionId).toBeDefined();

    const loginXml = "<msg t='sys'><body action='login' r='0'><nick><![CDATA[testuser]]></nick><pass><![CDATA[testpass]]></pass></body></msg>";
    await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${loginXml}`
    });

    await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}poll`
    });

    const rawJsonPayload = '{"t":"xt","b":{"r":-1,"x":"worlds4uEx","c":"rooms__getStaticRoomList","p":{"d":"eyJwbGF0Zm9ybSI6MX0=","m":"e9e3b8f01c7260ebad6b2f11cc3f5fde"}}}';
    await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${encodeURIComponent(rawJsonPayload)}`
    });

    const response = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });

    expect(response.statusCode).toBe(200);
    const summary = JSON.parse(response.body);
    expect(summary.freezeTimeline.map((event: any) => event.event)).toEqual(expect.arrayContaining([
      'blueboxConnect',
      'login.request',
      'login.response.delivered',
      'xt.login.delivered',
      'firstPollAfterLogin',
      'firstNonPollAfterLogin',
      'rooms__getStaticRoomList.request',
      'rooms__getStaticRoomList.response'
    ]));
    expect(summary.freezeDiagnostics.loginDeliveryMode).toBe('rmList-login-combined');
    expect(summary.freezeDiagnostics.firstNonPollAfterLoginCommand).toBe('xt.rooms__getStaticRoomList');
    expect(summary.freezeDiagnostics.loginResponseToFirstPollMs).not.toBeNull();
    expect(summary.freezeDiagnostics.loginResponseToStaticRoomListRequestMs).not.toBeNull();
    expect(summary.blueboxTiming.firstPollAfterLoginAt).not.toBeNull();
  });

  it('should expose pre-login verChk/apiOK timings in freeze diagnostics', async () => {
    const app = createTestApp();

    await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'sfsHttp=connect'
    });

    const sessionId = capturedRequests[0].sessionId;
    const verChkXml = "<msg t='sys'><body action='verChk' r='0'><ver v='158'/></body></msg>";
    await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${verChkXml}`
    });

    const loginXml = "<msg t='sys'><body action='login' r='0'><nick><![CDATA[testuser]]></nick><pass><![CDATA[testpass]]></pass></body></msg>";
    await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${loginXml}`
    });

    const response = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(response.body);

    expect(summary.freezeTimeline.map((event: any) => event.event)).toEqual(expect.arrayContaining([
      'blueboxConnect',
      'verChk.request',
      'apiOK.response',
      'login.request'
    ]));
    expect(summary.freezeDiagnostics.blueboxConnectToVerChkMs).not.toBeNull();
    expect(summary.freezeDiagnostics.verChkToApiOKMs).not.toBeNull();
    expect(summary.freezeDiagnostics.apiOKToLoginRequestMs).not.toBeNull();
    expect(summary.freezeDiagnostics.blueboxConnectToLoginRequestMs).not.toBeNull();
  });

  it('should process rooms__getStaticRoomList raw JSON over BlueBox and return StaticRooms response and record diagnostics', async () => {
    const app = createTestApp();
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const rawJsonPayload = '{"t":"xt","b":{"r":-1,"x":"worlds4uEx","c":"rooms__getStaticRoomList","p":{"d":"eyJwbGF0Zm9ybSI6MX0=","m":"e9e3b8f01c7260ebad6b2f11cc3f5fde"}}}';
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: `sfsHttp=${sessionId}${encodeURIComponent(rawJsonPayload)}`
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body.trim());
    expect(body.t).toBe('xt');
    expect(body.b.c).toBe('rooms__getStaticRoomList');
    expect(body.b.o.StaticRooms).toBeDefined();
    expect(body.b.o.StaticRooms[0].rId).toBe(20);

    // Verify session diagnostics
    const session = activeSessions.get(sessionId);
    expect(session?.getStaticRoomListResponseType).toEqual(['xt.rooms__getStaticRoomList']);
    expect(session?.getStaticRoomListDecodedPd).toEqual({ platform: 1 });
  });

  it('should process wall__getUserMessages JSON over BlueBox and return wmsg empty response preserving roomId', async () => {
    const app = createTestApp();
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const rawJsonPayload = '{"t":"xt","b":{"r":20,"c":"wall__getUserMessages","o":{}}}';
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: `sfsHttp=${sessionId}${encodeURIComponent(rawJsonPayload)}`
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body.trim());
    expect(body.t).toBe('xt');
    expect(body.b.r).toBe(20);
    expect(body.b.c).toBe('wall__getUserMessages');
    expect(body.b.o.wmsg).toEqual([]);

    // Check summary diagnostics
    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.wallGetUserMessagesSeen).toBe(true);
    expect(summary.nonPollCommandCounts['xt.wall__getUserMessages']).toBe(1);
  });

  it('should cap capturedNonPollRequests at 50 and expose via last50NonPollRequests in summary', async () => {
    const app = createTestApp();
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    for (let i = 0; i < 60; i++) {
      const payload = `<msg t='sys'><body action='dummy${i}' /></msg>`;
      await app.inject({
        method: 'POST',
        url: '/BlueBox/HttpBox.do',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: `sfsHttp=${sessionId}${encodeURIComponent(payload)}`
      });
    }

    expect(capturedNonPollRequests).toHaveLength(50);

    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.last50NonPollRequests).toHaveLength(50);
    expect(summary.last50NonPollRequests[0].rawBody).toContain('dummy10');
    expect(summary.last50NonPollRequests[49].rawBody).toContain('dummy59');
  });

  it('should detect user__joinFirstRoom in joinFirstRoomSeen', async () => {
    const app = createTestApp();
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const joinFirstPayload = '{"t":"xt","b":{"r":-1,"c":"user__joinFirstRoom","o":{}}}';
    await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${encodeURIComponent(joinFirstPayload)}`
    });

    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.joinFirstRoomSeen).toBe(true);
    expect(summary.nonPollCommandCounts['xt.user__joinFirstRoom']).toBe(1);
  });

  it('should detect user__getUserData in userGetUserDataSeen', async () => {
    const app = createTestApp();
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const userDataPayload = '{"t":"xt","b":{"r":-1,"c":"user__getUserData","o":{}}}';
    await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${encodeURIComponent(userDataPayload)}`
    });

    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.userGetUserDataSeen).toBe(true);
    expect(summary.nonPollCommandCounts['xt.user__getUserData']).toBe(1);
  });

  it('should process user__getUserCardInfo over BlueBox, return valid response with hearts, and populate diagnostics', async () => {
    const app = createTestApp();
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    // Establish raw session with raw nick in activeSessions/sfs emulator
    const sfsSession: any = { userId: 1, username: '::0:admin:1', isModerator: true, currentRoom: '20' };
    const { activeSessions: sfsActiveSessions } = await import('@flash-socket-server/sfs-emulator');
    sfsActiveSessions.set(1, sfsSession);

    // Request with base64 p.d
    const infoObj = { userId: 1, userName: '::0:admin:1' };
    const infoBase64 = Buffer.from(JSON.stringify(infoObj)).toString('base64');
    const infoPayload = `{"t":"xt","b":{"r":20,"c":"user__getUserCardInfo","p":{"d":"${infoBase64}"}}}`;

    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${encodeURIComponent(infoPayload)}`
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body.trim());
    expect(body.t).toBe('xt');
    expect(body.b.c).toBe('user__getUserCardInfo');
    expect(body.b.o.userName).toBe('::0:admin:1');
    expect(body.b.o.hearts).toEqual({
      h: 5,
      ch: 5,
      dh: 0
    });

    // Check summary diagnostics
    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.userGetUserCardInfoSeen).toBe(true);
    expect(summary.lastUserCardInfoRequestedUserName).toBe('::0:admin:1');
    expect(summary.lastUserCardInfoReturnedUserName).toBe('::0:admin:1');
    expect(summary.userCardInfoEchoMatchesRequest).toBe(true);
  });

  it('should process wall__getNumUnReadMessages over BlueBox and return valid response preserving room ID and update diagnostics', async () => {
    const app = createTestApp();
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const payload = '{"t":"xt","b":{"r":20,"c":"wall__getNumUnReadMessages","o":{}}}';
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${encodeURIComponent(payload)}`
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body.trim());
    expect(body.t).toBe('xt');
    expect(body.b.r).toBe(20);
    expect(body.b.c).toBe('wall__getNumUnReadMessages');
    expect(body.b.o.showSms).toBe(true);
    expect(body.b.o.wearSwimsuit).toBe(true);
    expect(body.b.o.petMagics).toEqual([]);
    expect(body.b.o.adminChat).toBe(true);
    expect(body.b.o.isVehicle).toBe(false);
    expect(body.b.o.newMsgs).toBe(false);

    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.wallGetNumUnreadMessagesSeen).toBe(true);
    expect(summary.controlStatePayloadDecoded).toMatchObject({
      _cmd: 'wall__getNumUnReadMessages',
      showSms: true,
      wearSwimsuit: true,
      petMagics: [],
      adminChat: true,
      isVehicle: false,
      newMsgs: false
    });
    expect(summary.controlStatePayloadValueTypes).toMatchObject({
      _cmd: 'string',
      showSms: 'boolean',
      wearSwimsuit: 'boolean',
      petMagics: 'array',
      adminChat: 'boolean',
      isVehicle: 'boolean',
      newMsgs: 'boolean'
    });
    expect(summary.controlStatePetMagicsValue).toEqual([]);
    expect(summary.controlStatePetMagicsType).toBe('array');
    expect(summary.controlPanelOnServerControlStateEntered).toBe(true);
    expect(summary.controlPanelOnServerControlStateDataKeys).toContain('petMagics');
    expect(summary.controlPanelOnServerControlStateFailStep).toBeNull();
    expect(summary.controlPanelOnServerControlStateFailProperty).toBeNull();
    expect(summary.nonPollCommandCounts['xt.wall__getNumUnReadMessages']).toBe(1);
    expect(summary.last50NonPollRequests[0].responseBody).toContain('wall__getNumUnReadMessages');
  });

  it('should process buddyList__getUserBuddies over BlueBox and return valid response preserving room ID and update diagnostics', async () => {
    const app = createTestApp();
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const payload = '{"t":"xt","b":{"r":20,"c":"buddyList__getUserBuddies","o":{"userId":1,"showPage":3}}}';
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${encodeURIComponent(payload)}`
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body.trim());
    expect(body.t).toBe('xt');
    expect(body.b.r).toBe(20);
    expect(body.b.c).toBe('buddyList__getUserBuddies');
    expect(body.b.o.showPage).toBe(3);
    expect(body.b.o.buddies).toEqual([]);

    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.buddyListGetUserBuddiesSeen).toBe(true);
    expect(summary.buddyListGetUserBuddiesResponseType).toEqual(['xt.buddyList__getUserBuddies']);
    expect(summary.buddyListGetUserBuddiesDecodedPd).toEqual({ userId: 1, showPage: 3 });
    expect(summary.nonPollCommandCounts['xt.buddyList__getUserBuddies']).toBe(1);
  });

  it('should process rewardSystem__getDetails over BlueBox and return valid response and update diagnostics', async () => {
    const app = createTestApp();
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const payload = '{"t":"xt","b":{"r":20,"c":"rewardSystem__getDetails","o":{"showPage":6}}}';
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${encodeURIComponent(payload)}`
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body.trim());
    expect(body.t).toBe('xt');
    expect(body.b.r).toBe(20);
    expect(body.b.c).toBe('rewardSystem__getDetails');
    expect(body.b.o.showPage).toBe(6);
    expect(body.b.o.status).toBe(true);
    expect(body.b.o.hearts).toEqual({
      h: 5,
      ch: 5,
      dh: 0
    });

    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.rewardSystemSeen).toBe(true);
    expect(summary.rewardSystemCommandCounts['xt.rewardSystem__getDetails']).toBe(1);
    expect(summary.rewardSystemResponseTypes['xt.rewardSystem__getDetails']).toEqual(['xt.rewardSystem__getDetails']);
    expect(summary.rewardSystemDecodedPdByCommand['xt.rewardSystem__getDetails']).toEqual({ showPage: 6 });
  });

  it('should process rewardSystem__giveHeartTofriends over BlueBox and update generic diagnostics', async () => {
    const app = createTestApp();
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const payload = '{"t":"xt","b":{"r":20,"c":"rewardSystem__giveHeartTofriends","o":{"rsfIds":[2,3]}}}';
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${encodeURIComponent(payload)}`
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body.trim());
    expect(body.t).toBe('xt');
    expect(body.b.c).toBe('rewardSystem__giveHeartTofriends');
    expect(body.b.o.status).toBe(true);

    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.rewardSystemSeen).toBe(true);
    expect(summary.rewardSystemCommandCounts['xt.rewardSystem__giveHeartTofriends']).toBe(1);
    expect(summary.rewardSystemDecodedPdByCommand['xt.rewardSystem__giveHeartTofriends']).toEqual({ rsfIds: [2, 3] });
  });

  it('should process worldAdven__getAdventureDetails over BlueBox and return valid response preserving room ID and update diagnostics', async () => {
    const app = createTestApp();
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const payload = '{"t":"xt","b":{"r":20,"c":"worldAdven__getAdventureDetails","o":{}}}';
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${encodeURIComponent(payload)}`
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body.trim());
    expect(body.t).toBe('xt');
    expect(body.b.r).toBe(20);
    expect(body.b.c).toBe('worldAdven__getAdventureDetails');
    expect(body.b.o.id).toBe(0);
    expect(body.b.o.name).toBe('');
    expect(body.b.o.showProgress).toBe(false);

    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.worldAdventureDetailsSeen).toBe(true);
    expect(summary.nonPollCommandCounts['xt.worldAdven__getAdventureDetails']).toBe(1);
    expect(summary.last50NonPollRequests[0].responseBody).toContain('worldAdven__getAdventureDetails');
  });

  it('should deliver deferred login extension on the next command request getRmList without intervening poll', async () => {
    const app = createTestApp();

    // 1. BlueBox connect
    const connectRes = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'sfsHttp=connect'
    });
    expect(connectRes.statusCode).toBe(200);
    const sessionId = connectRes.body.substring(1, 33);

    // 2. verChk
    const verChkXml = "<msg t='sys'><body action='verChk' r='0'><ver v='158'/></body></msg>";
    await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${verChkXml}`
    });

    // 3. login
    const loginXml = "<msg t='sys'><body action='login' r='0'><nick><![CDATA[testuser]]></nick><pass><![CDATA[testpass]]></pass></body></msg>";
    const loginRes = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${loginXml}`
    });
    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.body).toContain("action='logOK'");
    expect(loginRes.body).not.toContain('"_cmd":"login"'); // Deferred!

    // 4. getRmList (without intervening poll)
    const getRmListXml = "<msg t='sys'><body action='getRmList' r='0'></body></msg>";
    const rmListRes = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${getRmListXml}`
    });

    expect(rmListRes.statusCode).toBe(200);
    // Must contain BOTH the deferred login JSON and the rmList XML response
    expect(rmListRes.body).toContain('"_cmd":"login"');
    expect(rmListRes.body).toContain("action='rmList'");
  });

  it('should deliver deferred login extension on intervening poll', async () => {
    const app = createTestApp();

    const connectRes = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'sfsHttp=connect'
    });
    const sessionId = connectRes.body.substring(1, 33);

    const verChkXml = "<msg t='sys'><body action='verChk' r='0'><ver v='158'/></body></msg>";
    await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${verChkXml}`
    });

    const loginXml = "<msg t='sys'><body action='login' r='0'><nick><![CDATA[testuser]]></nick><pass><![CDATA[testpass]]></pass></body></msg>";
    await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${loginXml}`
    });

    // Poll right after login
    const pollRes = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}poll`
    });

    expect(pollRes.statusCode).toBe(200);
  });

  it('should support default joinOK-uLs-embedded mode with embedded uLs inside joinOK and no separate uList', async () => {
    const app = createTestApp();
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [], userId: 1 });

    const joinPayload = "<msg t='sys'><body action='joinRoom' r='20'></body></msg>";
    const joinRes = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${encodeURIComponent(joinPayload)}`
    });

    expect(joinRes.statusCode).toBe(200);
    // Response should contain joinOK, but NOT uList immediately or deferred
    expect(joinRes.body).toContain("action='joinOK' r='20'");
    expect(joinRes.body).toContain("<uLs>");
    expect(joinRes.body).toContain("<u i='1' m='1' s='0' p='1'>");
    expect(joinRes.body).toContain("<n><![CDATA[myUser]]></n>");
    expect(joinRes.body).toContain("<vars>");
    expect(joinRes.body).toContain("<var n='x' t='n'>400</var>");
    expect(joinRes.body).toContain("<var n='adventure' t='s'><![CDATA[]]></var>");
    expect(joinRes.body).not.toContain("action='uList'");

    const session = activeSessions.get(sessionId);
    expect(session?.queue).toHaveLength(0); // Nothing queued
    expect(session?.embeddedUserListInJoinOK).toBe(true);
    expect(session?.separateUListSent).toBe(false);
    expect(session?.userListXmlFormat).toBe('embedded-uLs');
    expect(session?.userListSentAt).toBeDefined();

    // Check summary diagnostics
    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.blueboxJoinMode).toBe('joinOK-uLs-embedded');
    expect(summary.embeddedUserListInJoinOK).toBe(true);
    expect(summary.separateUListSent).toBe(false);
    expect(summary.userListXmlFormat).toBe('embedded-uLs');
  });

  it('should support joinOK-uList-split-poll mode', async () => {
    const customConfig = {
      ...dummyConfig,
      blueboxJoinMode: 'joinOK-uList-split-poll' as const
    };
    const app = fastify({ bodyLimit: 10 * 1024 * 1024 });
    registerBlueBoxRoute(app, customConfig);

    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    // Join room payload
    const joinPayload = "<msg t='sys'><body action='joinRoom' r='20'></body></msg>";
    const joinRes = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${encodeURIComponent(joinPayload)}`
    });

    expect(joinRes.statusCode).toBe(200);
    // Should contain joinOK immediately
    expect(joinRes.body).toContain("action='joinOK'");
    // uList should be deferred and NOT in the immediate response
    expect(joinRes.body).not.toContain("action='uList'");

    const session = activeSessions.get(sessionId);
    expect(session?.queue).toHaveLength(1);
    expect(session?.queue[0]).toContain("action='uList'");
    expect(session?.userListSentAt).toBeDefined();

    // Next poll returns the deferred uList
    const pollRes = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}poll`
    });
    expect(pollRes.statusCode).toBe(200);
    expect(pollRes.body).toContain("action='uList'");

    // Check summary diagnostics
    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.blueboxJoinMode).toBe('joinOK-uList-split-poll');
    expect(summary.joinResponsePackets).toEqual(['sys.joinOK']);
    expect(summary.firstPollAfterJoinResponsePackets).toEqual(['sys.uList']);
  });

  it('should support uList-joinOK-split-poll mode', async () => {
    const customConfig = {
      ...dummyConfig,
      blueboxJoinMode: 'uList-joinOK-split-poll' as const
    };
    const app = fastify({ bodyLimit: 10 * 1024 * 1024 });
    registerBlueBoxRoute(app, customConfig);

    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const joinPayload = "<msg t='sys'><body action='joinRoom' r='20'></body></msg>";
    const joinRes = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${encodeURIComponent(joinPayload)}`
    });

    expect(joinRes.statusCode).toBe(200);
    // Should contain uList immediately
    expect(joinRes.body).toContain("action='uList'");
    // joinOK should be deferred
    expect(joinRes.body).not.toContain("action='joinOK'");

    const session = activeSessions.get(sessionId);
    expect(session?.queue).toHaveLength(1);
    expect(session?.queue[0]).toContain("action='joinOK'");

    const pollRes = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}poll`
    });
    expect(pollRes.statusCode).toBe(200);
    expect(pollRes.body).toContain("action='joinOK'");
  });

  it('should support joinOK-uList-delayed-poll mode and hold/release uList', async () => {
    const customConfig = {
      ...dummyConfig,
      blueboxJoinMode: 'joinOK-uList-delayed-poll' as const,
      blueboxUlistDelayMs: 200
    };
    const app = fastify({ bodyLimit: 10 * 1024 * 1024 });
    registerBlueBoxRoute(app, customConfig);

    const sessionId = 'abcdefabcdefabcdefabcdefabcdef12';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    const joinPayload = "<msg t='sys'><body action='joinRoom' r='20'></body></msg>";
    const joinRes = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${encodeURIComponent(joinPayload)}`
    });

    expect(joinRes.statusCode).toBe(200);
    expect(joinRes.body).toContain("action='joinOK'");
    expect(joinRes.body).not.toContain("action='uList'");

    const session = activeSessions.get(sessionId);
    expect(session?.pendingUList).toContain("action='uList'");
    expect(session?.pendingUListQueuedAt).toBeDefined();

    // Immediate poll should NOT return uList if delay not elapsed
    const pollRes1 = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}poll`
    });
    expect(pollRes1.statusCode).toBe(200);
    expect(pollRes1.body).not.toContain("action='uList'");

    // Wait 250ms for delay to elapse
    await new Promise(resolve => setTimeout(resolve, 250));

    // Poll after delay should release uList
    const pollRes2 = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}poll`
    });
    expect(pollRes2.statusCode).toBe(200);
    expect(pollRes2.body).toContain("action='uList'");

    // Check summary diagnostics
    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.blueboxJoinMode).toBe('joinOK-uList-delayed-poll');
    expect(summary.pendingUListQueuedAt).toBeDefined();
    expect(summary.pendingUListReleasedAt).toBeDefined();
    expect(summary.pendingUListReleaseReason).toBe('delayElapsed');
  });

  it('should support joinOK-uList-after-room-asset mode and release on room20AssetLoaded milestone', async () => {
    const customConfig = {
      ...dummyConfig,
      blueboxJoinMode: 'joinOK-uList-after-room-asset' as const,
      blueboxUlistDelayMs: 2000 // Long fallback
    };
    const app = fastify({ bodyLimit: 10 * 1024 * 1024 });
    registerBlueBoxRoute(app, customConfig);

    const sessionId = '12341234123412341234123412341234';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    // Ensure we start a clean timeline session
    timelineManager.clearAll();
    timelineManager.recordMilestone('127.0.0.1', 'Mozilla', 'Mogo.swf served');

    const joinPayload = "<msg t='sys'><body action='joinRoom' r='20'></body></msg>";
    const joinRes = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${encodeURIComponent(joinPayload)}`
    });

    expect(joinRes.statusCode).toBe(200);
    expect(joinRes.body).toContain("action='joinOK'");
    expect(joinRes.body).not.toContain("action='uList'");

    const session = activeSessions.get(sessionId);
    expect(session?.pendingUList).toContain("action='uList'");

    // Poll should not release yet
    const pollRes1 = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}poll`
    });
    expect(pollRes1.body).not.toContain("action='uList'");

    // Record assets milestones
    timelineManager.recordMilestone('127.0.0.1', 'Mozilla', 'room20AssetLoaded');
    timelineManager.recordMilestone('127.0.0.1', 'Mozilla', 'room20TxtServed');

    // Poll after assets milestones should release uList
    const pollRes2 = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}poll`
    });
    expect(pollRes2.statusCode).toBe(200);
    expect(pollRes2.body).toContain("action='uList'");

    // Check summary diagnostics
    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.blueboxJoinMode).toBe('joinOK-uList-after-room-asset');
    expect(summary.pendingUListReleaseReason).toBe('roomAssetLoaded');
    expect(summary.room20AssetLoadedAt).toBeDefined();
    expect(summary.room20TxtServedAt).toBeDefined();
    expect(summary.roomAssetToUListMs).toBeDefined();
  });

  it('should handle sys.pubMsg, broadcast it to all room members, and register in diagnostics', async () => {
    const app = createTestApp();
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [], userId: 1 });

    // Establish a dummy SFS session in room 20
    const sfsSession: any = { userId: 1, username: '::0:user1:1', isModerator: true, currentRoom: '20' };
    const { activeSessions: sfsActiveSessions } = await import('@flash-socket-server/sfs-emulator');
    sfsActiveSessions.set(1, sfsSession);

    const pubMsgPacket = `<msg t='sys'><body action='pubMsg' r='20'><txt><![CDATA[hello world]]></txt></body></msg>`;
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${pubMsgPacket}`
    });

    expect(response.statusCode).toBe(200);
    // Sender gets the broadcast in the response body or queue
    expect(response.body).toContain("<body action='pubMsg' r='20'");
    expect(response.body).toContain("<user id='1' />");
    expect(response.body).toContain("<txt><![CDATA[hello world]]></txt>");

    // Check summary diagnostics
    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.pubMsgSeen).toBe(true);
    expect(summary.lastPubMsg).toBe('hello world');
  });

  it('should handle sys.setUvars, update coordinates and state on SFS session, broadcast uVarsUpdate, and register in diagnostics', async () => {
    const app = createTestApp();
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [], userId: 1 });

    const sfsSession: any = { userId: 1, username: '::0:user1:1', isModerator: true, currentRoom: '20' };
    const { activeSessions: sfsActiveSessions } = await import('@flash-socket-server/sfs-emulator');
    sfsActiveSessions.set(1, sfsSession);

    const setUvarsPacket = `<msg t='sys'><body action='setUvars' r='20'><vars><var n='x' t='n'>123</var><var n='AD' t='s'><![CDATA[jump]]></var></vars></body></msg>`;
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${setUvarsPacket}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("<body action='uVarsUpdate' r='20'");
    expect(response.body).toContain("<var n='x' t='n'><![CDATA[123]]></var>");
    expect(response.body).toContain("<var n='AD' t='s'><![CDATA[jump]]></var>");

    // Check SFS session is updated
    expect(sfsSession.x).toBe(123);
    expect(sfsSession.AD).toBe('jump');

    // Check summary diagnostics
    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.setUvarsSeen).toBe(true);
    expect(summary.setUvarsVars).toEqual([
      { name: 'x', type: 'n', value: '123' },
      { name: 'AD', type: 's', value: 'jump' }
    ]);
  });

  it('should handle xt.user__move, update coordinates, broadcast user__move extension, broadcast uVarsUpdate, and register in diagnostics', async () => {
    const app = createTestApp();
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [], userId: 1 });

    const sfsSession: any = { userId: 1, username: '::0:user1:1', isModerator: true, currentRoom: '20' };
    const { activeSessions: sfsActiveSessions } = await import('@flash-socket-server/sfs-emulator');
    sfsActiveSessions.set(1, sfsSession);

    const movePacket = `{"t":"xt","b":{"r":20,"c":"user__move","o":{"x":500,"y":600,"AD":2}}}`;
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${movePacket}`
    });

    expect(response.statusCode).toBe(200);
    // Response should contain both the JSON movement and XML variables update
    expect(response.body).toContain('"_cmd":"user__move"');
    expect(response.body).toContain('"x":500');
    expect(response.body).toContain("<body action='uVarsUpdate' r='20'");
    expect(response.body).toContain("<var n='x' t='n'><![CDATA[500]]></var>");

    // Check SFS session is updated
    expect(sfsSession.x).toBe(500);
    expect(sfsSession.y).toBe(600);
    expect(sfsSession.AD).toBe(2);

    // Check summary diagnostics
    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.userMoveSeen).toBe(true);
    expect(summary.lastUserMoveDecodedPd).toEqual({ x: 500, y: 600, AD: 2 });
  });

  it('should handle successful rooms__jumpToRoom by joining room and returning joinOK XML (no JSON extension)', async () => {
    const app = createTestApp();
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [], userId: 1 });

    const sfsSession: any = { userId: 1, username: '::0:user1:1', isModerator: true, currentRoom: '20' };
    const { activeSessions: sfsActiveSessions } = await import('@flash-socket-server/sfs-emulator');
    sfsActiveSessions.set(1, sfsSession);

    const jumpPacket = `{"t":"xt","b":{"r":20,"c":"rooms__jumpToRoom","o":{"nameId":"room_20"}}}`;
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${jumpPacket}`
    });

    expect(response.statusCode).toBe(200);
    // Successful join returns joinOK SFS XML packet
    expect(response.body).toContain("<body action='joinOK' r='20'>");
    expect(response.body).toContain("<uLs>");
    // Crucial: on success, do NOT return rooms__jumpToRoom JSON extension packet
    expect(response.body).not.toContain('"_cmd":"rooms__jumpToRoom"');

    // Check summary diagnostics
    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.roomsJumpToRoomSeen).toBe(true);
    expect(summary.roomsJumpToRoomDecodedPd).toEqual({ nameId: 'room_20' });
  });

  it('should record unresolved rooms__jumpToRoom diagnostics without returning popup-triggering errorId -2', async () => {
    const app = createTestApp();
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [], userId: 1 });

    const sfsSession: any = { userId: 1, username: '::0:user1:1', isModerator: true, currentRoom: '20' };
    const { activeSessions: sfsActiveSessions } = await import('@flash-socket-server/sfs-emulator');
    sfsActiveSessions.set(1, sfsSession);

    // null nameId
    const jumpPacket = `{"t":"xt","b":{"r":20,"c":"rooms__jumpToRoom","o":{"nameId":null}}}`;
    const response = await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${jumpPacket}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('"_cmd":"rooms__jumpToRoom"');
    expect(response.body).not.toContain('"errorId":-2');
    expect(response.body).not.toContain("<body action='joinOK'");

    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.roomTransitionErrorSeen).toBe(true);
    expect(summary.doorGateBlockedReason).toBe('unresolved_target');
  });

  it('should collect cmd coverage and missing _cmd diagnostics in session summary', async () => {
    const app = createTestApp();
    const sessionId = '12345678901234567890123456789012';
    activeSessions.set(sessionId, { sessionId, created: Date.now(), queue: [] });

    // 1. Send an XT packet that has _cmd (wall__getUserMessages has _cmd now!)
    const payloadWithCmd = '{"t":"xt","b":{"r":20,"c":"wall__getUserMessages","o":{}}}';
    await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}${encodeURIComponent(payloadWithCmd)}`
    });

    // 2. Put a mock response directly in queue that is missing _cmd to trigger missing _cmd diagnostics
    const session = activeSessions.get(sessionId)!;
    session.queue.push('{"t":"xt","b":{"r":20,"c":"mock__missingCmd","o":{}}}');

    // 3. Poll to flush the queue and trigger parsing
    await app.inject({
      method: 'POST',
      url: '/BlueBox/HttpBox.do',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `sfsHttp=${sessionId}poll`
    });

    // 4. Check summary
    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/debug/bluebox-summary'
    });
    const summary = JSON.parse(summaryResponse.body);
    expect(summary.extensionResponseCmdCoverage['wall__getUserMessages']).toBe(true);
    expect(summary.extensionResponseCmdCoverage['mock__missingCmd']).toBe(false);
    expect(summary.xtResponsesMissingCmd).toContain('mock__missingCmd');
    expect(summary.xtResponsesMissingCmdCount).toBe(1);
    expect(summary.lastXtResponseMissingCmd).toBe('mock__missingCmd');
  });
});
