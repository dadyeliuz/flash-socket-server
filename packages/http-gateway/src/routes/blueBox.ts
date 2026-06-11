import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ServerConfig, logger, timelineManager, ruffleDiagnosticsManager } from '@flash-socket-server/core';
import * as crypto from 'crypto';
import { handleHandshake, handleLogin, handleGetRmList, handleRoomJoin, handleGetStaticRoomList, handleGetUserMessages, handleGetNumUnReadMessages, handleGetAdventureDetails, handleGetUserData, handleGetUserBuddies, handleRewardSystemDetails, handleGetRoomElements, handleGetWorldUserItems, handleGetInventoryItems, handleGetMessageTemplates, handleSendCustomMessage, handleDeleteUserMessage, handleSetMessageRead, parseRoomTransitionTarget, buildSmartFoxRoomListXml, activeSessions as sfsActiveSessions, cleanUsername } from '@flash-socket-server/sfs-emulator';

export interface CapturedRequest {
  timestamp: string;
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  contentType: string;
  rawBody: string;
  truncated: boolean;
  parsedParams?: Record<string, string>;
  sfsHttp?: string;
  sessionId?: string;
  responseBody: string;
}

export interface BlueBoxSession {
  sessionId: string;
  created: number;
  queue: string[];
  userId?: number;
  pollCount?: number;
  loginResponseTypes?: string[];
  loginResponsePackets?: string[];
  loginMode?: string | null;
  getStaticRoomListResponseType?: string[];
  getStaticRoomListDecodedPd?: any;
  nonPollCommandCounts?: Record<string, number>;
  controlStatePayloadDecoded?: Record<string, unknown>;
  controlStatePayloadValueTypes?: Record<string, string>;
  controlStatePetMagicsValue?: unknown;
  controlStatePetMagicsType?: string | null;
  controlStateAdminChatValue?: unknown;
  controlStateAdminChatType?: string | null;
  controlPanelOnServerControlStateFailStep?: string | null;
  controlPanelOnServerControlStateFailProperty?: string | null;
  controlPanelOnServerControlStateExceptionMessage?: string | null;
  uListHasVars?: boolean;
  // Per-session BlueBox timestamps (ms since epoch)
  sessionStartedAt?: number;
  loginRequestAt?: number;
  loginResponseAt?: number;
  verChkRequestAt?: number;
  apiOKResponseAt?: number;
  apiOkDelayAppliedAt?: number;
  apiOkDelayReleasedAt?: number;
  apiOkDelayActualMs?: number;
  xtLoginSentAt?: number;
  roomsGetStaticRoomListRequestAt?: number;
  roomsGetStaticRoomListResponseAt?: number;
  userJoinFirstRoomRequestAt?: number;
  userJoinFirstRoomResponseAt?: number;
  room20ReachedAt?: number;
  firstPollAfterLoginResponsePackets?: string[];
  deferredXtLogin?: string;
  xtLoginEffectObservedAt?: number;
  blueboxLoginDeliveryMode?: string;
  firstPollAfterLoginAt?: number;
  firstNonPollAfterLoginAt?: number;
  firstNonPollAfterLoginCommand?: string | null;
  freezeTimeline?: FreezeTimelineEvent[];
  // Per-session Join response and user list diagnostics
  joinResponsePackets?: string[];
  firstPollAfterJoinResponsePackets?: string[];
  userListSentAt?: number;
  blueboxJoinMode?: string;
  buddyListGetUserBuddiesResponseType?: string[];
  buddyListGetUserBuddiesDecodedPd?: any;
  rewardSystemSeen?: boolean;
  rewardSystemCommandCounts?: Record<string, number>;
  rewardSystemResponseTypes?: Record<string, string[]>;
  rewardSystemDecodedPdByCommand?: Record<string, any>;
  pendingUList?: string;
  pendingUListQueuedAt?: number;
  pendingUListReleasedAt?: number;
  pendingUListReleaseReason?: string;
  embeddedUserListInJoinOK?: boolean;
  separateUListSent?: boolean;
  userListXmlFormat?: string;
  userMoveSeen?: boolean;
  userMoveResponseType?: string[];
  lastUserMoveDecodedPd?: any;
  setUvarsSeen?: boolean;
  setUvarsVars?: any[];
  pubMsgSeen?: boolean;
  lastPubMsg?: string;
  roomsJumpToRoomSeen?: boolean;
  roomsJumpToRoomDecodedPd?: any;
  jumpToRoomResponseShape?: string[] | null;
  changeRoomResponseShape?: string[] | null;
  roomTransitionExpectedClientCommand?: string | null;
  roomTransitionXtResponseSent?: boolean;
  roomTransitionSysJoinOkSent?: boolean;
  mapTargetRoomId?: number | null;
  doorGateId?: number | string | null;
  gCId?: number | string | null;
  doorGateTargetRoomId?: number | null;
  doorGateBlockedReason?: string | null;
  roomLoaderVersionDetected?: string | null;
  roomLoaderExpectedTxt?: boolean | null;
  roomLoaderMetadataSource?: string | null;
  roomTransitionLoaderVersion?: string | null;
  lastRoomLoadedLoaderVersion?: string | null;
  roomTransitionRequestedFromRoom?: number | null;
  roomTransitionTargetRoomId?: number | null;
  roomTransitionTargetRoomName?: string | null;
  roomTransitionResponsePackets?: string[];
  roomTransitionJoinOkSent?: boolean;
  roomTransitionUserListSent?: boolean;
  roomTransitionRoomAssetRequested?: boolean;
  roomTransitionRoomTxtRequested?: boolean;
  roomTransitionCompleted?: boolean;
  roomTransitionErrorSeen?: boolean;
  lastRoomLoaded?: string | null;
  currentRoomId?: number | null;
  userGetUserTOSeen?: boolean;
  userGetUserDataSeen?: boolean;
  userGetUserCardInfoSeen?: boolean;
  userGetUserCardSeen?: boolean;
  userGetUserDetailSeen?: boolean;
  profileCommandResponseTypes?: Record<string, string[]>;
  userCardCommandCounts?: Record<string, number>;
  userCardResponseTypes?: Record<string, string[]>;
  userCardDecodedPdByCommand?: Record<string, any>;
  lastUserCardResponseShapeKeys?: Record<string, string[]>;
  lastUserCardResolvedUser?: {
    requestedUserName?: string;
    resolvedRawUserName?: string;
    resolvedCleanUserName?: string;
    resolvedUserId?: number;
  };
  lastUserCardInfoRequestedUserName?: string | null;
  lastUserCardInfoReturnedUserName?: string | null;
  userCardInfoEchoMatchesRequest?: boolean;
  buddyListCommandCounts?: Record<string, number>;
  buddyListDecodedPdByCommand?: Record<string, any>;
  lastBuddyListRequestedShowPage?: number | null;
  lastBuddyListReturnedShowPage?: number | null;
  buddyListShowPageEchoMatchesRequest?: boolean;
  xtResponsesMissingCmd?: string[];
  xtResponsesMissingCmdCount?: number;
  lastXtResponseMissingCmd?: string | null;
  extensionResponseCmdCoverage?: Record<string, boolean>;
}

export interface FreezeTimelineEvent {
  timestamp: number;
  iso: string;
  event: string;
  source: string;
  deltaFromPreviousMs: number | null;
  details?: Record<string, unknown>;
  interpretation?: string;
}

export const unhandledCommandCounts: Record<string, number> = {};
export const lastUnhandledCommands: any[] = [];

function recordFreezeTimelineEvent(
  session: BlueBoxSession | undefined,
  event: string,
  source: string,
  details?: Record<string, unknown>,
  interpretation?: string
): void {
  if (!session) return;
  const timestamp = Date.now();
  if (!session.freezeTimeline) {
    session.freezeTimeline = [];
  }
  const previous = session.freezeTimeline[session.freezeTimeline.length - 1];
  session.freezeTimeline.push({
    timestamp,
    iso: new Date(timestamp).toISOString(),
    event,
    source,
    deltaFromPreviousMs: previous ? timestamp - previous.timestamp : null,
    details,
    interpretation
  });
  if (session.freezeTimeline.length > 200) {
    session.freezeTimeline.shift();
  }
}

function extractCommandName(payload: string): string | null {
  if (!payload) return null;
  const trimmed = payload.trim();
  if (trimmed.startsWith('<msg')) {
    const actionMatch = trimmed.match(/action=['"](.*?)['"]/);
    if (actionMatch) {
      return `sys.${actionMatch[1]}`;
    }
  } else if (trimmed.startsWith('{') || trimmed.includes('"t":"xt"') || trimmed.includes("'t':'xt'")) {
    try {
      let jsonStr = trimmed;
      const cdataMatch = trimmed.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
      if (cdataMatch) {
        jsonStr = cdataMatch[1].trim();
      } else {
        const bodyMatch = trimmed.match(/<body[^>]*>([\s\S]*?)<\/body>/);
        if (bodyMatch) {
          jsonStr = bodyMatch[1].trim();
        }
      }
      const parsed = JSON.parse(jsonStr);
      if (parsed?.b?.c) {
        return `xt.${parsed.b.c}`;
      }
    } catch (err) {}
  }
  return null;
}

function getPacketType(packet: string): string {
  if (packet.includes("action='logOK'") || packet.includes('action="logOK"')) {
    return 'sys.logOK';
  }
  if (packet.includes("action='logKO'") || packet.includes('action="logKO"')) {
    return 'sys.logKO';
  }
  if (packet.includes('"c":"login"') || packet.includes("'c':'login'")) {
    return 'xt.login';
  }
  if (packet.includes("action='rmList'") || packet.includes('action="rmList"')) {
    return 'sys.rmList';
  }
  if (packet.includes("action='apiOK'") || packet.includes('action="apiOK"')) {
    return 'sys.apiOK';
  }
  if (packet.includes("action='joinOK'") || packet.includes('action="joinOK"')) {
    return 'sys.joinOK';
  }
  if (packet.includes("action='uList'") || packet.includes('action="uList"')) {
    return 'sys.uList';
  }
  if (packet.includes('"c":"rooms__joinFirstRoom"')) {
    return 'xt.joinFirstRoom';
  }
  const commandName = extractCommandName(packet);
  if (commandName?.startsWith('xt.')) {
    return commandName;
  }
  return 'unknown';
}

interface UserVar {
  name: string;
  type: string;
  value: string;
}

function parseUvars(packet: string): UserVar[] {
  const vars: UserVar[] = [];
  const regex = /<var n='([^']*)' t='([^']*)'>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/var>/g;
  let match;
  while ((match = regex.exec(packet)) !== null) {
    vars.push({
      name: match[1],
      type: match[2],
      value: match[3]
    });
  }
  const regexDbl = /<var n="([^"]*)" t="([^"]*)">(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/var>/g;
  while ((match = regexDbl.exec(packet)) !== null) {
    vars.push({
      name: match[1],
      type: match[2],
      value: match[3]
    });
  }
  return vars;
}

export const capturedRequests: CapturedRequest[] = [];
export const capturedNonPollRequests: CapturedRequest[] = [];
export const activeSessions = new Map<string, BlueBoxSession>();

function describeValueType(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function describePayloadValueTypes(payload: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, describeValueType(value)]));
}

export function registerBlueBoxRoute(fastify: FastifyInstance, config: ServerConfig) {
  // Register a custom parser to capture raw string bodies for all content types
  // but fallback to JSON parsing for application/json requests.
  if (!fastify.hasContentTypeParser('*')) {
    fastify.addContentTypeParser('*', { parseAs: 'buffer' }, (req, body, done) => {
      const contentType = req.headers['content-type'] || '';
      const bodyStr = body.toString('utf8');
      
      if (contentType.includes('application/json')) {
        try {
          done(null, JSON.parse(bodyStr));
        } catch (err: any) {
          done(err);
        }
      } else {
        done(null, bodyStr);
      }
    });
  }

  // Casing variations for routing
  const blueBoxRoutes = [
    '/BlueBox/HttpBox.do',
    '/bluebox/httpbox.do',
    '/BlueBox/httpbox.do',
    '/bluebox/HttpBox.do',
    '/blueBox/httpBox.do'
  ];

  for (const route of blueBoxRoutes) {
    fastify.all(route, async (request, reply) => {
      const origin = (request.headers.origin || '').trim();
      
      const allowedOrigins = [
        'http://localhost:8080',
        'http://127.0.0.1:8080',
        `http://localhost:${config.httpPort}`,
        `http://127.0.0.1:${config.httpPort}`,
        `http://${config.publicHost}:${config.httpPort}`
      ];

      const isAllowed = allowedOrigins.includes(origin);

      if (isAllowed) {
        reply.header('Access-Control-Allow-Origin', origin);
        reply.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
        reply.header('Access-Control-Allow-Headers', 'Content-Type');
        reply.header('Vary', 'Origin');
      }

      if (request.method === 'OPTIONS') {
        logger.info('http', `[BLUEBOX] OPTIONS preflight origin=${origin}`);
        return reply.status(204).send();
      }

      if (isAllowed && config.verboseBlueboxPolls) {
        logger.info('http', `[BLUEBOX] CORS allowed origin=${origin}`);
      }

      const contentType = request.headers['content-type'] || 'unknown';
      let rawBody = (request.body as string) || '';
      let truncated = false;
      const MAX_BODY_SIZE = 1024 * 1024; // 1MB

      if (rawBody.length > MAX_BODY_SIZE) {
        rawBody = rawBody.substring(0, MAX_BODY_SIZE);
        truncated = true;
      }

      const loggedBodyPreview = rawBody.length > 4000
        ? rawBody.substring(0, 4000) + '... [PREVIEW TRUNCATED]'
        : rawBody;

      let parsedParams: Record<string, string> | undefined = undefined;
      let sfsHttp: string | undefined = undefined;

      if (contentType.includes('application/x-www-form-urlencoded')) {
        try {
          const params = new URLSearchParams(rawBody);
          parsedParams = {};
          for (const [key, val] of params.entries()) {
            parsedParams[key] = val;
          }
          sfsHttp = parsedParams['sfsHttp'];
        } catch (err: any) {
          logger.error('http', `[BLUEBOX] Failed to parse URLSearchParams: ${err.message}`);
        }
      }

      // Determine response logic for connect vs poll/packets
      let responseText = 'ok\n';
      let extractedSessionId: string | undefined = undefined;

      if (sfsHttp === 'connect') {
        timelineManager.recordMilestone(request.ip, request.headers['user-agent'] || '', 'blueboxConnect');
        // Generate a fresh 32-character session ID
        extractedSessionId = crypto.randomBytes(16).toString('hex');
        
        // Store in activeSessions
        const nowConnect = Date.now();
        const session: BlueBoxSession = {
          sessionId: extractedSessionId,
          created: nowConnect,
          queue: [],
          sessionStartedAt: nowConnect
        };
        activeSessions.set(extractedSessionId, session);
        recordFreezeTimelineEvent(session, 'blueboxConnect', 'server', {
          response: '#<sessionId>'
        }, 'Server selection produced the BlueBox connect request.');

        // Use variant "#<id>\n" (newline-terminated) for connect response
        responseText = `#${extractedSessionId}\n`;
        
        logger.info('http', `[BLUEBOX] sfsHttp=connect -> session=${extractedSessionId}`);
        logger.info('http', `[BLUEBOX] active variant: #<id>\\n`);
        logger.info('http', `[BLUEBOX] Sent response: #${extractedSessionId}\\n`);
      } else {
        let payload = '';
        if (sfsHttp && sfsHttp.length >= 32) {
          extractedSessionId = sfsHttp.substring(0, 32);
          payload = sfsHttp.substring(32);
        }

        const session = extractedSessionId ? activeSessions.get(extractedSessionId) : undefined;

        if (!session) {
          if (extractedSessionId) {
            logger.warn('http', `[BLUEBOX] Unknown session ${extractedSessionId}`);
          }
          responseText = 'ok\n';
          logger.info('http', `[BLUEBOX] Sent response: ok\\n`);
        } else {
          // Check if we should release a pending uList from joinOK-uList-delayed-poll / joinOK-uList-after-room-asset
          if (session.pendingUList) {
            const joinMode = config.blueboxJoinMode || 'joinOK-uList-combined';
            let shouldRelease = false;
            let releaseReason: 'roomAssetLoaded' | 'delayElapsed' | undefined = undefined;

            const elapsed = Date.now() - (session.pendingUListQueuedAt || 0);
            const targetDelay = config.blueboxUlistDelayMs !== undefined ? config.blueboxUlistDelayMs : 1000;

            if (joinMode === 'joinOK-uList-delayed-poll') {
              if (elapsed >= targetDelay) {
                shouldRelease = true;
                releaseReason = 'delayElapsed';
              }
            } else if (joinMode === 'joinOK-uList-after-room-asset') {
              const latestTimeline = timelineManager.getLatestSession();
              const hasMilestone = (name: string) => latestTimeline?.milestones?.some((m: any) => m.name === name);
              const roomAssetLoaded = hasMilestone('room20AssetLoaded') && hasMilestone('room20TxtServed');

              if (roomAssetLoaded) {
                shouldRelease = true;
                releaseReason = 'roomAssetLoaded';
              } else if (elapsed >= targetDelay) {
                shouldRelease = true;
                releaseReason = 'delayElapsed';
              }
            }

            if (shouldRelease && releaseReason) {
              logger.info('http', `[BLUEBOX] Releasing pending uList for session ${session.sessionId}. Reason: ${releaseReason}`);
              session.queue.push(session.pendingUList);
              session.userListSentAt = Date.now();
              session.pendingUListReleasedAt = Date.now();
              session.pendingUListReleaseReason = releaseReason;
              session.pendingUList = undefined;
              session.separateUListSent = true;
            }
          }

          if (payload === 'poll') {
            session.pollCount = (session.pollCount || 0) + 1;
            if (session.loginResponseAt && !session.firstPollAfterLoginAt) {
              session.firstPollAfterLoginAt = Date.now();
              recordFreezeTimelineEvent(session, 'firstPollAfterLogin', 'server', {
                pollCount: session.pollCount,
                queuedPacketTypes: session.queue.map(getPacketType)
              }, 'First client poll observed after the login response was delivered.');
            }
            if (session.loginResponseAt && !session.firstPollAfterLoginResponsePackets) {
              session.firstPollAfterLoginResponsePackets = session.queue.map(getPacketType);
            }
            if (session.userJoinFirstRoomResponseAt && !session.firstPollAfterJoinResponsePackets) {
              session.firstPollAfterJoinResponsePackets = session.queue.map(getPacketType);
            }
            if (session.queue.length > 0) {
              responseText = session.queue.join('\n') + '\n';
              for (const res of session.queue) {
                if (res.trim().startsWith('{')) {
                  try {
                    const parsed = JSON.parse(res);
                    if (parsed && parsed.t === 'xt') {
                      const cmdName = parsed.b?.c;
                      if (cmdName) {
                        const hasCmd = parsed.b?.o && parsed.b.o._cmd !== undefined;
                        if (!session.extensionResponseCmdCoverage) {
                          session.extensionResponseCmdCoverage = {};
                        }
                        session.extensionResponseCmdCoverage[cmdName] = hasCmd;

                        if (!hasCmd) {
                          if (!session.xtResponsesMissingCmd) {
                            session.xtResponsesMissingCmd = [];
                          }
                          if (!session.xtResponsesMissingCmd.includes(cmdName)) {
                            session.xtResponsesMissingCmd.push(cmdName);
                          }
                          session.xtResponsesMissingCmdCount = (session.xtResponsesMissingCmdCount || 0) + 1;
                          session.lastXtResponseMissingCmd = cmdName;
                        }
                      }
                    }
                  } catch (_) {}
                }
              }
              session.queue = [];
            } else {
              responseText = 'ok\n';
            }
            if (config.verboseBlueboxPolls) {
              logger.info('http', `[BLUEBOX] Poll for session ${extractedSessionId} -> ${responseText.trim()}`);
            }
          } else if (payload.startsWith('<msg') || payload.trim().startsWith('{')) {
            const cmdName = extractCommandName(payload);
            if (session.loginResponseAt && !session.firstNonPollAfterLoginAt) {
              session.firstNonPollAfterLoginAt = Date.now();
              session.firstNonPollAfterLoginCommand = cmdName;
              recordFreezeTimelineEvent(session, 'firstNonPollAfterLogin', 'server', {
                command: cmdName,
                payloadPreview: payload.substring(0, 240)
              }, 'First non-poll command observed after the login response was delivered.');
            }
            if (cmdName && session) {
              ruffleDiagnosticsManager.recordMogoWallCommandSent(cmdName);
              ruffleDiagnosticsManager.recordMagicCommandSent(cmdName, payload);
              if (!session.nonPollCommandCounts) {
                session.nonPollCommandCounts = {};
              }
              session.nonPollCommandCounts[cmdName] = (session.nonPollCommandCounts[cmdName] || 0) + 1;
            }

            if (payload.includes("action='getRmList'") || payload.includes('action="getRmList"')) {
              timelineManager.recordMilestone(request.ip, request.headers['user-agent'] || '', 'getRmList');
            }
            if (payload.includes("action='verChk'") || payload.includes('action="verChk"')) {
              session.verChkRequestAt = Date.now();
              recordFreezeTimelineEvent(session, 'verChk.request', 'server', {
                payloadPreview: payload.substring(0, 240)
              }, 'Client sent SmartFox version check after BlueBox HTTP connection.');
            }
            if (payload.includes('rooms__getStaticRoomList')) {
              timelineManager.recordMilestone(request.ip, request.headers['user-agent'] || '', 'roomsGetStaticRoomList');
              if (session) {
                session.roomsGetStaticRoomListRequestAt = Date.now();
                session.xtLoginEffectObservedAt = session.roomsGetStaticRoomListRequestAt;
                recordFreezeTimelineEvent(session, 'rooms__getStaticRoomList.request', 'server', {
                  command: cmdName,
                  payloadPreview: payload.substring(0, 240)
                }, 'Client requested the static room list; this is the first known post-login effect marker.');
              }
            }
            if (payload.includes('user__joinFirstRoom') || payload.includes('rooms__joinFirstRoom')) {
              timelineManager.recordMilestone(request.ip, request.headers['user-agent'] || '', 'userJoinFirstRoom');
              if (session) {
                session.userJoinFirstRoomRequestAt = Date.now();
                recordFreezeTimelineEvent(session, 'joinFirstRoom.request', 'server', {
                  command: cmdName,
                  payloadPreview: payload.substring(0, 240)
                }, 'Client requested first room join after receiving static room data.');
              }
            }

            const responses: string[] = [];
            if (session && session.deferredXtLogin) {
              responses.push(session.deferredXtLogin);
              logger.info('http', `[BLUEBOX] Prepended deferred login extension to non-poll command response: ${session.deferredXtLogin}`);
              delete session.deferredXtLogin;
            }
            let loginRes: string[] | null = null;
            let deferredResponse: string | null = null;
            let isHandled = false;

            // 1. Handshake
            const handshakeRes = handleHandshake(payload);
            if (handshakeRes) {
              isHandled = true;
              if (handshakeRes.includes("action='apiOK'")) {
                const apiOkDelayMs = config.blueboxApiOkDelayMs ?? 0;
                if (apiOkDelayMs > 0 && session) {
                  session.apiOkDelayAppliedAt = Date.now();
                  recordFreezeTimelineEvent(session, 'apiOK.delay.applied', 'server', {
                    configuredDelayMs: apiOkDelayMs
                  }, 'Server intentionally delayed only the SmartFox apiOK response for race diagnostics.');
                  await new Promise(resolve => setTimeout(resolve, apiOkDelayMs));
                  session.apiOkDelayReleasedAt = Date.now();
                  session.apiOkDelayActualMs = session.apiOkDelayReleasedAt - session.apiOkDelayAppliedAt;
                  recordFreezeTimelineEvent(session, 'apiOK.delay.released', 'server', {
                    configuredDelayMs: apiOkDelayMs,
                    actualDelayMs: session.apiOkDelayActualMs
                  }, 'Server released the delayed SmartFox apiOK response.');
                }
                responses.push(handshakeRes);
                timelineManager.recordMilestone(request.ip, request.headers['user-agent'] || '', 'apiOK');
                if (session) {
                  session.apiOKResponseAt = Date.now();
                  recordFreezeTimelineEvent(session, 'apiOK.response', 'server', {
                    packetType: getPacketType(handshakeRes)
                  }, 'Server generated SmartFox apiOK response for verChk.');
                }
              } else {
                responses.push(handshakeRes);
              }
            } else {
              // 2. Login
              const isLoginPayload = payload.includes("action='login'") || payload.includes('action="login"');
              if (isLoginPayload && session) {
                session.loginRequestAt = Date.now();
                recordFreezeTimelineEvent(session, 'login.request', 'server', {
                  payloadPreview: payload.substring(0, 240)
                }, 'Client sent the SmartFox login XML.');
              }
              loginRes = handleLogin(payload, { ...config, sendLoginExtensionAfterLogOk: true });
              if (loginRes) {
                isHandled = true;
                if (session) {
                  let effectiveLoginMode = config.blueboxLoginMode || 
                    (config.blueboxLoginExtensionOnly ? 'extension-only' : 'deferred');
                  if (effectiveLoginMode === 'rmList-login') {
                    effectiveLoginMode = 'rmList-login-combined';
                  }
                  if (effectiveLoginMode === 'rmList-only-then-xt-login-on-poll') {
                    effectiveLoginMode = 'rmList-login-split-poll';
                  }
                  if (effectiveLoginMode === 'split-rmList-xtLogin') {
                    effectiveLoginMode = 'rmList-login-split-command';
                  }
                  session.loginMode = effectiveLoginMode;
                  session.blueboxLoginDeliveryMode = effectiveLoginMode;
                  const buildCompatRmList = () =>
                    buildSmartFoxRoomListXml(config);

                  if (effectiveLoginMode === 'same-response' || effectiveLoginMode === 'same-response-logko') {
                    const logOk = loginRes.find(r => r.includes("action='logOK'") || r.includes('action="logOK"'));
                    const xtLogin = loginRes.find(r => r.startsWith('{') && r.includes('"c":"login"'));
                    const rmList = loginRes.find(r => r.includes("action='rmList'") || r.includes('action="rmList"'));
                    
                    if (logOk) {
                      if (effectiveLoginMode === 'same-response-logko') {
                        const logKoXml = logOk
                          .replace("action='logOK'", "action='logKO'")
                          .replace('action="logOK"', 'action="logKO"')
                          .replace(/<login\b[^>]*\/>/, "<login e='Suppressed standard login event' />")
                          .replace(/<login\b[^>]*>([\s\S]*?)<\/login>/, "<login e='Suppressed standard login event'></login>");
                        responses.push(logKoXml);
                        // Always inject rmList after logKO so SmartFox has a room list
                        // before xt.login triggers the getStaticRoomList / joinFirstRoom flows.
                        responses.push(buildCompatRmList());
                      } else {
                        responses.push(logOk);
                        if (rmList && config.sendRoomListAfterLogin) {
                          responses.push(rmList);
                        }
                      }
                    }
                    if (xtLogin) responses.push(xtLogin);
                    session.loginResponseTypes = responses.map(getPacketType);
                  } else if (
                    effectiveLoginMode === 'rmList-login-logko' ||
                    effectiveLoginMode === 'rmList-login-combined'
                  ) {
                    // New experimental modes: lead with rmList so SFS room list is populated
                    // before xt.login fires, avoiding the extension-only race condition.
                    const logOk = loginRes.find(r => r.includes("action='logOK'") || r.includes('action="logOK"'));
                    const xtLogin = loginRes.find(r => r.startsWith('{') && r.includes('"c":"login"'));
                    responses.push(buildCompatRmList());
                    if (xtLogin) responses.push(xtLogin);
                    if (effectiveLoginMode === 'rmList-login-logko' && logOk) {
                      // Append logKO after xt.login — suppresses any late-arriving logOK side effects
                      const logKoXml = logOk
                        .replace("action='logOK'", "action='logKO'")
                        .replace('action="logOK"', 'action="logKO"')
                        .replace(/<login\b[^>]*\/>/, "<login e='Suppressed standard login event' />")
                        .replace(/<login\b[^>]*>([\s\S]*?)<\/login>/, "<login e='Suppressed standard login event'></login>");
                      responses.push(logKoXml);
                    }
                    session.loginResponseTypes = responses.map(getPacketType);
                  } else if (effectiveLoginMode === 'rmList-login-split-poll') {
                    const xtLogin = loginRes.find(r => r.startsWith('{') && r.includes('"c":"login"'));
                    responses.push(buildCompatRmList());
                    if (xtLogin) {
                      deferredResponse = xtLogin;
                    }
                    session.loginResponseTypes = responses.map(getPacketType);
                  } else if (effectiveLoginMode === 'rmList-login-split-command') {
                    const xtLogin = loginRes.find(r => r.startsWith('{') && r.includes('"c":"login"'));
                    responses.push(buildCompatRmList());
                    if (xtLogin) {
                      session.deferredXtLogin = xtLogin;
                      logger.info('http', `[BLUEBOX] Deferring login extension until next non-poll command: ${xtLogin}`);
                    }
                    session.loginResponseTypes = responses.map(getPacketType);
                  } else if (effectiveLoginMode === 'login-rmList-split-poll') {
                    const xtLogin = loginRes.find(r => r.startsWith('{') && r.includes('"c":"login"'));
                    if (xtLogin) responses.push(xtLogin);
                    deferredResponse = buildCompatRmList();
                    session.loginResponseTypes = responses.map(getPacketType);
                  } else if (effectiveLoginMode === 'xt-login-only') {
                    const xtLogin = loginRes.find(r => r.startsWith('{') && r.includes('"c":"login"'));
                    if (xtLogin) responses.push(xtLogin);
                    session.loginResponseTypes = responses.map(getPacketType);
                  } else if (effectiveLoginMode === 'extension-only') {
                    const xtLogin = loginRes.find(r => r.startsWith('{') && r.includes('"c":"login"'));
                    if (xtLogin) {
                      responses.push(buildCompatRmList());
                      responses.push(xtLogin);
                      session.loginResponseTypes = ['sys.rmList', 'xt.login'];
                      session.xtLoginSentAt = Date.now();
                    } else {
                      responses.push(...loginRes);
                      session.loginResponseTypes = loginRes.map(getPacketType);
                    }
                  } else {
                    // deferred (default)
                    const xtLogin = loginRes.find(r => r.startsWith('{') && r.includes('"c":"login"'));
                    const nonXtResponses = loginRes.filter(r => !(r.startsWith('{') && r.includes('"c":"login"')));
                    responses.push(...nonXtResponses);
                    session.loginResponseTypes = loginRes.map(getPacketType);
                    if (xtLogin) {
                      deferredResponse = xtLogin;
                      logger.info('http', `[BLUEBOX] Deferring login extension to next poll: ${xtLogin}`);
                    }
                  }
                  session.loginResponsePackets = [...responses];
                } else {
                  responses.push(...loginRes);
                }
              } else {
                // 3. Room List
                const rmListRes = handleGetRmList(payload, config);
                if (rmListRes) {
                  responses.push(...rmListRes);
                  isHandled = true;
                } else {
                  // 3.5 Static Room List
                  const staticRoomRes = handleGetStaticRoomList(payload, config);
                  if (staticRoomRes) {
                    responses.push(staticRoomRes.packet);
                    isHandled = true;
                    if (session) {
                      session.getStaticRoomListResponseType = ['xt.rooms__getStaticRoomList'];
                      session.getStaticRoomListDecodedPd = staticRoomRes.decodedPd;
                      session.roomsGetStaticRoomListResponseAt = Date.now();
                      recordFreezeTimelineEvent(session, 'rooms__getStaticRoomList.response', 'server', {
                        responseType: 'xt.rooms__getStaticRoomList',
                        staticRoomCount: Array.isArray(staticRoomRes.decodedPd?.StaticRooms)
                          ? staticRoomRes.decodedPd.StaticRooms.length
                          : undefined
                      }, 'Server generated the static room list response.');
                    }
                  } else {
                    // 3.7 Wall User Messages
                    const wallMsgRes = handleGetUserMessages(payload, config);
                    if (wallMsgRes) {
                      responses.push(wallMsgRes);
                      isHandled = true;
                    } else {
                      // 3.8 Wall Num Unread Messages
                      const numUnreadRes = handleGetNumUnReadMessages(payload, config);
                      if (numUnreadRes) {
                        responses.push(numUnreadRes);
                        isHandled = true;
                        if (session) {
                          try {
                            const parsedNumUnread = JSON.parse(numUnreadRes);
                            const payloadDecoded = parsedNumUnread?.b?.o && typeof parsedNumUnread.b.o === 'object'
                              ? parsedNumUnread.b.o as Record<string, unknown>
                              : {};
                            session.controlStatePayloadDecoded = payloadDecoded;
                            session.controlStatePayloadValueTypes = describePayloadValueTypes(payloadDecoded);
                            session.controlStatePetMagicsValue = payloadDecoded.petMagics;
                            session.controlStatePetMagicsType = payloadDecoded.petMagics === undefined
                              ? null
                              : describeValueType(payloadDecoded.petMagics);
                            session.controlStateAdminChatValue = payloadDecoded.adminChat;
                            session.controlStateAdminChatType = payloadDecoded.adminChat === undefined
                              ? null
                              : describeValueType(payloadDecoded.adminChat);
                            if (payloadDecoded.petMagics !== undefined && !Array.isArray(payloadDecoded.petMagics)) {
                              session.controlPanelOnServerControlStateFailStep = 'initPetControl';
                              session.controlPanelOnServerControlStateFailProperty = 'petMagics.length';
                              session.controlPanelOnServerControlStateExceptionMessage = 'petMagics must be an Array for this ControlPanel build';
                            } else {
                              session.controlPanelOnServerControlStateFailStep = null;
                              session.controlPanelOnServerControlStateFailProperty = null;
                              session.controlPanelOnServerControlStateExceptionMessage = null;
                            }
                          } catch (_) {
                            session.controlStatePayloadDecoded = {};
                            session.controlStatePayloadValueTypes = {};
                            session.controlStatePetMagicsValue = undefined;
                            session.controlStatePetMagicsType = null;
                            session.controlStateAdminChatValue = undefined;
                            session.controlStateAdminChatType = null;
                            session.controlPanelOnServerControlStateFailStep = null;
                            session.controlPanelOnServerControlStateFailProperty = null;
                            session.controlPanelOnServerControlStateExceptionMessage = null;
                          }
                        }
                      } else {
                        // 3.9 World Adventure Details
                        const advenDetailsRes = handleGetAdventureDetails(payload, config);
                        if (advenDetailsRes) {
                          responses.push(advenDetailsRes);
                          isHandled = true;
                        } else {
                          const newRes = handleGetRoomElements(payload, config) ||
                                         handleGetWorldUserItems(payload, config) ||
                                         handleGetInventoryItems(payload, config) ||
                                         handleGetMessageTemplates(payload, config) ||
                                         handleSendCustomMessage(payload, config) ||
                                         handleDeleteUserMessage(payload, config) ||
                                         handleSetMessageRead(payload, config);
                          if (newRes) {
                            if (cmdName === 'user__getInventoryItems') {
                              try {
                                const parsedInventoryResponse = JSON.parse(newRes);
                                ruffleDiagnosticsManager.recordMogoWallInventoryResponseShape(parsedInventoryResponse?.b?.o);
                              } catch (_) {
                                ruffleDiagnosticsManager.recordMogoWallInventoryResponseShape(null);
                              }
                            }
                            responses.push(newRes);
                            isHandled = true;
                          } else {
                            // 3.10 Buddy List
                            const userBuddiesRes = handleGetUserBuddies(payload, config);
                          if (userBuddiesRes) {
                            responses.push(userBuddiesRes.packet);
                            isHandled = true;
                            if (session) {
                              session.buddyListGetUserBuddiesResponseType = ['xt.buddyList__getUserBuddies'];
                              session.buddyListGetUserBuddiesDecodedPd = userBuddiesRes.decodedPd;

                              const rawCmdName = extractCommandName(payload) || 'unknown';

                              if (!session.buddyListCommandCounts) session.buddyListCommandCounts = {};
                              session.buddyListCommandCounts[rawCmdName] = (session.buddyListCommandCounts[rawCmdName] || 0) + 1;

                              if (!session.buddyListDecodedPdByCommand) session.buddyListDecodedPdByCommand = {};
                              session.buddyListDecodedPdByCommand[rawCmdName] = userBuddiesRes.decodedPd;

                              const reqShowPage = userBuddiesRes.decodedPd?.showPage !== undefined ? Number(userBuddiesRes.decodedPd.showPage) : null;
                              let resShowPage: number | null = null;
                              try {
                                const parsedRes = JSON.parse(userBuddiesRes.packet);
                                resShowPage = parsedRes?.b?.o?.showPage !== undefined ? Number(parsedRes.b.o.showPage) : null;
                              } catch (_) {}

                              session.lastBuddyListRequestedShowPage = reqShowPage;
                              session.lastBuddyListReturnedShowPage = resShowPage;
                              session.buddyListShowPageEchoMatchesRequest = reqShowPage !== null && reqShowPage === resShowPage;
                            }
                          } else {
                            // 3.10.5 Reward System
                            const rewardSystemRes = handleRewardSystemDetails(payload, config);
                            if (rewardSystemRes) {
                              responses.push(rewardSystemRes.packet);
                              isHandled = true;
                              if (session) {
                                const rawCmdName = extractCommandName(payload) || 'unknown';
                                session.rewardSystemSeen = true;
                                if (!session.rewardSystemCommandCounts) {
                                  session.rewardSystemCommandCounts = {};
                                }
                                session.rewardSystemCommandCounts[rawCmdName] = (session.rewardSystemCommandCounts[rawCmdName] || 0) + 1;
                                if (!session.rewardSystemResponseTypes) {
                                  session.rewardSystemResponseTypes = {};
                                }
                                session.rewardSystemResponseTypes[rawCmdName] = [rawCmdName];
                                if (!session.rewardSystemDecodedPdByCommand) {
                                  session.rewardSystemDecodedPdByCommand = {};
                                }
                                session.rewardSystemDecodedPdByCommand[rawCmdName] = rewardSystemRes.decodedPd;
                              }
                            } else {
                              // 3.11 User data (user__getUserTO / user__getUserData etc.)
                            const userDataRes = handleGetUserData(payload, config);
                            if (userDataRes) {
                              responses.push(userDataRes);
                              isHandled = true;
                              if (session) {
                                if (cmdName === 'xt.user__getUserTO') session.userGetUserTOSeen = true;
                                if (cmdName === 'xt.user__getUserData') session.userGetUserDataSeen = true;
                                if (cmdName === 'xt.user__getUserCardInfo') session.userGetUserCardInfoSeen = true;
                                if (cmdName === 'xt.user__getUserCard') session.userGetUserCardSeen = true;
                                if (cmdName === 'xt.user__getUserDetail') session.userGetUserDetailSeen = true;

                                if (cmdName) {
                                  session.profileCommandResponseTypes = session.profileCommandResponseTypes || {};
                                  session.profileCommandResponseTypes[cmdName] = [cmdName];
                                }

                                // UserCard / Profile diagnostics
                                const rawCmdName = extractCommandName(payload) || 'unknown';

                                // 1. Increment command count
                                if (!session.userCardCommandCounts) session.userCardCommandCounts = {};
                                session.userCardCommandCounts[rawCmdName] = (session.userCardCommandCounts[rawCmdName] || 0) + 1;

                                // 2. Record response type
                                if (!session.userCardResponseTypes) session.userCardResponseTypes = {};
                                session.userCardResponseTypes[rawCmdName] = [rawCmdName];

                                // 3. Decode payload request object (p.d base64 or b.o)
                                let requestObj: any = null;
                                try {
                                  const parsed = JSON.parse(payload);
                                  requestObj = parsed?.b?.o || {};
                                  if (parsed?.b?.p?.d) {
                                    const decodedStr = Buffer.from(parsed.b.p.d, 'base64').toString('utf8');
                                    requestObj = JSON.parse(decodedStr);
                                  }
                                } catch (_) {}
                                if (!session.userCardDecodedPdByCommand) session.userCardDecodedPdByCommand = {};
                                session.userCardDecodedPdByCommand[rawCmdName] = requestObj;

                                // 4. Parse shape keys of the response
                                try {
                                  const parsedRes = JSON.parse(userDataRes);
                                  const keys = parsedRes?.b?.o ? Object.keys(parsedRes.b.o) : [];
                                  if (!session.lastUserCardResponseShapeKeys) session.lastUserCardResponseShapeKeys = {};
                                  session.lastUserCardResponseShapeKeys[rawCmdName] = keys;
                                } catch (_) {}

                                // 5. Save lastUserCardResolvedUser manual debug info
                                const requestedUserName = requestObj?.userName;
                                let resolvedRawUserName: string | undefined = undefined;
                                let resolvedCleanUserName: string | undefined = undefined;
                                let resolvedUserId: number | undefined = undefined;

                                const reqUserId = requestObj?.userId || requestObj?.id;
                                let sfsSessionToUse: any = null;
                                if (reqUserId !== undefined) {
                                  sfsSessionToUse = sfsActiveSessions.get(Number(reqUserId));
                                }
                                if (!sfsSessionToUse && requestedUserName) {
                                  const cleanReq = cleanUsername(requestedUserName);
                                  for (const [, sfsSess] of sfsActiveSessions) {
                                    if (sfsSess.username === requestedUserName || cleanUsername(sfsSess.username) === cleanReq) {
                                      sfsSessionToUse = sfsSess;
                                      break;
                                    }
                                  }
                                }
                                if (!sfsSessionToUse && sfsActiveSessions.size > 0) {
                                  sfsSessionToUse = Array.from(sfsActiveSessions.values())[0];
                                }
                                if (sfsSessionToUse) {
                                  resolvedRawUserName = sfsSessionToUse.username;
                                  resolvedCleanUserName = cleanUsername(sfsSessionToUse.username);
                                  resolvedUserId = sfsSessionToUse.userId;
                                }
                                session.lastUserCardResolvedUser = {
                                  requestedUserName,
                                  resolvedRawUserName,
                                  resolvedCleanUserName,
                                  resolvedUserId
                                };

                                // 6. Populate userCardInfo validation diagnostics
                                if (rawCmdName === 'xt.user__getUserCardInfo') {
                                  let responseUserName: string | null = null;
                                  try {
                                    const parsedRes = JSON.parse(userDataRes);
                                    responseUserName = parsedRes?.b?.o?.userName || null;
                                  } catch (_) {}
                                  session.lastUserCardInfoRequestedUserName = requestedUserName || null;
                                  session.lastUserCardInfoReturnedUserName = responseUserName;
                                  session.userCardInfoEchoMatchesRequest = requestedUserName !== undefined && requestedUserName === responseUserName;
                                }
                              }
                            } else {
                              // 4. Room Join
                            const joinRes = handleRoomJoin(payload, session.userId, config);
                            if (joinRes) {
                              isHandled = true;
                              if (session) {
                                session.userJoinFirstRoomResponseAt = Date.now();
                                const joinMode = config.blueboxJoinMode || 'joinOK-uLs-embedded';
                                session.blueboxJoinMode = joinMode;

                                const hasEmbeddedUls = joinRes.some(r => r.includes("action='joinOK'") && r.includes('<uLs>'));
                                if (hasEmbeddedUls) {
                                  session.embeddedUserListInJoinOK = true;
                                  session.separateUListSent = false;
                                  session.userListXmlFormat = 'embedded-uLs';
                                  session.userListSentAt = Date.now();
                                } else {
                                  session.embeddedUserListInJoinOK = false;
                                  session.userListXmlFormat = 'legacy-separate';
                                  if (joinMode === 'legacy-separate-uList' || joinMode === 'joinOK-uList-combined') {
                                    session.separateUListSent = true;
                                    session.userListSentAt = Date.now();
                                  } else {
                                    session.separateUListSent = false;
                                  }
                                }
                              }

                              const joinOk = joinRes.find(r => r.includes("action='joinOK'") || r.includes('action="joinOK"'));
                              const uList = joinRes.find(r => r.includes("action='uList'") || r.includes('action="uList"'));
                              const others = joinRes.filter(r => !r.includes("action='joinOK'") && !r.includes('action="joinOK"') && !r.includes("action='uList'") && !r.includes('action="uList"'));

                              const immediateResponses: string[] = [];
                              const joinMode = config.blueboxJoinMode || 'joinOK-uList-combined';

                              if (joinMode === 'joinOK-uList-split-poll') {
                                if (joinOk) immediateResponses.push(joinOk);
                                immediateResponses.push(...others);
                                if (uList) {
                                  deferredResponse = uList;
                                  if (session) {
                                    session.userListSentAt = Date.now();
                                  }
                                }
                              } else if (joinMode === 'uList-joinOK-split-poll') {
                                if (uList) immediateResponses.push(uList);
                                if (joinOk) {
                                  deferredResponse = joinOk;
                                  if (session) {
                                    session.userListSentAt = Date.now();
                                  }
                                  if (others.length > 0 && session) {
                                    session.queue.push(...others);
                                  }
                                }
                              } else if (joinMode === 'joinOK-uList-delayed-poll' || joinMode === 'joinOK-uList-after-room-asset') {
                                if (joinOk) immediateResponses.push(joinOk);
                                immediateResponses.push(...others);
                                if (uList && session) {
                                  session.pendingUList = uList;
                                  session.pendingUListQueuedAt = Date.now();
                                  session.pendingUListReleasedAt = undefined;
                                  session.pendingUListReleaseReason = undefined;
                                  logger.info('http', `[BLUEBOX] Holding pending uList in session queue. Mode: ${joinMode}`);
                                }
                              } else {
                                // joinOK-uList-combined (default)
                                immediateResponses.push(...joinRes);
                                if (session) {
                                  session.userListSentAt = Date.now();
                                }
                              }

                              responses.push(...immediateResponses);

                              if (session) {
                                session.joinResponsePackets = immediateResponses.map(getPacketType);
                                recordFreezeTimelineEvent(session, 'joinFirstRoom.response', 'server', {
                                  joinMode,
                                  packetTypes: session.joinResponsePackets,
                                  deferredResponseType: deferredResponse ? getPacketType(deferredResponse) : null
                                }, 'Server generated the first-room join response.');
                              }

                              const uListRes = joinRes.find(r => r.includes("action='uList'") || r.includes('action="uList"'));
                              const hasEmbeddedVars = joinRes.some(r => r.includes("action='joinOK'") && r.includes('<vars>'));
                              if (((uListRes && !uListRes.includes('<vars />')) || hasEmbeddedVars) && session) {
                                session.uListHasVars = true;
                              }
                            } else {
                              // NEW: Custom Core SFS command handling!
                              if (cmdName === 'sys.pubMsg') {
                                isHandled = true;
                                const sfsSession = session.userId ? sfsActiveSessions.get(session.userId) : null;
                                const currentRoomId = sfsSession?.currentRoom ? parseInt(sfsSession.currentRoom, 10) : 20;
                                
                                const rMatch = payload.match(/r=['"]/);
                                const roomId = rMatch ? parseInt(payload.match(/r=['"](\d+)['"]/)?.[1] || '20', 10) : currentRoomId;
                                
                                let msg = '';
                                const txtMatch = payload.match(/<txt>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/txt>/);
                                if (txtMatch) {
                                  msg = txtMatch[1];
                                }

                                if (session) {
                                  session.pubMsgSeen = true;
                                  session.lastPubMsg = msg;
                                }

                                if (msg.startsWith('effect__')) {
                                  ruffleDiagnosticsManager.recordMagicCommandResponse('sys.pubMsg-broadcast');
                                }

                                const userId = session.userId || 1;
                                const broadcastPacket = `<msg t='sys'><body action='pubMsg' r='${roomId}'><user id='${userId}' /><txt><![CDATA[${msg}]]></txt></body></msg>`;

                                for (const otherSession of activeSessions.values()) {
                                  const otherSfsSession = otherSession.userId ? sfsActiveSessions.get(otherSession.userId) : null;
                                  if (otherSfsSession && otherSfsSession.currentRoom === String(roomId)) {
                                    otherSession.queue.push(broadcastPacket);
                                  }
                                }
                              } else if (cmdName === 'sys.setUvars') {
                                isHandled = true;
                                const sfsSession = session.userId ? sfsActiveSessions.get(session.userId) : null;
                                const currentRoomId = sfsSession?.currentRoom ? parseInt(sfsSession.currentRoom, 10) : 20;
                                
                                const rMatch = payload.match(/r=['"]/);
                                const roomId = rMatch ? parseInt(payload.match(/r=['"](\d+)['"]/)?.[1] || '20', 10) : currentRoomId;
                                const userId = session.userId || 1;

                                const parsedVars = parseUvars(payload);
                                if (session) {
                                  session.setUvarsSeen = true;
                                  session.setUvarsVars = parsedVars;
                                }

                                if (sfsSession) {
                                  for (const v of parsedVars) {
                                    let typedValue: any = v.value;
                                    if (v.type === 'n') {
                                      typedValue = Number(v.value);
                                    } else if (v.type === 'b') {
                                      typedValue = v.value === '1' || v.value === 'true';
                                    }
                                    sfsSession[v.name] = typedValue;
                                    if (v.name === 'x') sfsSession.x = Number(v.value);
                                    if (v.name === 'y') sfsSession.y = Number(v.value);
                                    if (v.name === 'AD') sfsSession.AD = typedValue;
                                  }
                                }

                                let varXml = '';
                                for (const v of parsedVars) {
                                  varXml += `<var n='${v.name}' t='${v.type}'><![CDATA[${v.value}]]></var>`;
                                }

                                const broadcastPacket = `<msg t='sys'><body action='uVarsUpdate' r='${roomId}'><user id='${userId}' /><vars>${varXml}</vars></body></msg>`;

                                for (const otherSession of activeSessions.values()) {
                                  const otherSfsSession = otherSession.userId ? sfsActiveSessions.get(otherSession.userId) : null;
                                  if (otherSfsSession && otherSfsSession.currentRoom === String(roomId)) {
                                    otherSession.queue.push(broadcastPacket);
                                  }
                                }
                              } else if (cmdName === 'xt.user__move') {
                                isHandled = true;
                                const sfsSession = session.userId ? sfsActiveSessions.get(session.userId) : null;
                                const currentRoomId = sfsSession?.currentRoom ? parseInt(sfsSession.currentRoom, 10) : 20;

                                let moveData: any = null;
                                try {
                                  let jsonStr = payload.trim();
                                  if (jsonStr.startsWith('<msg')) {
                                    const cdataMatch = payload.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
                                    if (cdataMatch) {
                                      jsonStr = cdataMatch[1].trim();
                                    } else {
                                      const bodyMatch = payload.match(/<body[^>]*>([\s\S]*?)<\/body>/);
                                      if (bodyMatch) {
                                        jsonStr = bodyMatch[1].trim();
                                      }
                                    }
                                  }
                                  const parsed = JSON.parse(jsonStr);
                                  moveData = parsed?.b?.o;
                                  if (parsed?.b?.p?.d) {
                                    const decodedStr = Buffer.from(parsed.b.p.d, 'base64').toString('utf8');
                                    moveData = JSON.parse(decodedStr);
                                  }
                                } catch (err: any) {
                                  logger.error('http', `Failed to parse user__move JSON: ${err.message}`);
                                }

                                const roomId = (moveData && moveData.roomId) || currentRoomId;
                                const userId = session.userId || 1;

                                if (session) {
                                  session.userMoveSeen = true;
                                  session.lastUserMoveDecodedPd = moveData;
                                  session.userMoveResponseType = ['xt.user__move', 'sys.uVarsUpdate'];
                                }

                                if (sfsSession && moveData) {
                                  if (moveData.x !== undefined) sfsSession.x = Number(moveData.x);
                                  if (moveData.y !== undefined) sfsSession.y = Number(moveData.y);
                                  if (moveData.AD !== undefined) sfsSession.AD = moveData.AD;
                                }

                                if (moveData) {
                                  const moveJsonPacket = JSON.stringify({
                                    t: 'xt',
                                    b: {
                                      r: roomId,
                                      c: 'user__move',
                                      o: {
                                        _cmd: 'user__move',
                                        uid: userId,
                                        x: moveData.x,
                                        y: moveData.y,
                                        AD: moveData.AD
                                      }
                                    }
                                  });

                                  const moveVarsXmlPacket = `<msg t='sys'><body action='uVarsUpdate' r='${roomId}'><user id='${userId}' /><vars><var n='x' t='n'><![CDATA[${moveData.x}]]></var><var n='y' t='n'><![CDATA[${moveData.y}]]></var><var n='AD' t='n'><![CDATA[${moveData.AD}]]></var></vars></body></msg>`;

                                  for (const otherSession of activeSessions.values()) {
                                    const otherSfsSession = otherSession.userId ? sfsActiveSessions.get(otherSession.userId) : null;
                                    if (otherSfsSession && otherSfsSession.currentRoom === String(roomId)) {
                                      otherSession.queue.push(moveJsonPacket);
                                      otherSession.queue.push(moveVarsXmlPacket);
                                    }
                                  }
                                }
                              } else if (cmdName === 'xt.rooms__jumpToRoom' || cmdName === 'xt.user__jumpToRoom' || cmdName === 'xt.rooms__changeRoom') {
                                isHandled = true;
                                const sfsSession = session.userId ? sfsActiveSessions.get(session.userId) : null;
                                const currentRoomId = sfsSession?.currentRoom ? parseInt(sfsSession.currentRoom, 10) : 20;

                                const transitionTarget = parseRoomTransitionTarget(payload, config);
                                const jumpData = transitionTarget?.decodedPd || null;
                                const cleanCmd = cmdName.substring(3);

                                if (session) {
                                  session.roomsJumpToRoomSeen = true;
                                  session.roomsJumpToRoomDecodedPd = jumpData;
                                  session.jumpToRoomResponseShape = cleanCmd === 'rooms__jumpToRoom' ? ['sys.joinOK'] : (session.jumpToRoomResponseShape ?? null);
                                  session.changeRoomResponseShape = cleanCmd === 'rooms__changeRoom' ? ['sys.joinOK'] : (session.changeRoomResponseShape ?? null);
                                  session.roomTransitionExpectedClientCommand = 'sys.joinOK';
                                  session.roomTransitionXtResponseSent = false;
                                  session.roomTransitionSysJoinOkSent = false;
                                  session.roomTransitionRequestedFromRoom = currentRoomId;
                                  session.currentRoomId = currentRoomId;
                                  session.roomTransitionTargetRoomId = transitionTarget?.roomId ?? null;
                                  session.roomTransitionTargetRoomName = transitionTarget?.roomName ?? null;
                                  session.mapTargetRoomId = cleanCmd.includes('jumpToRoom') ? (transitionTarget?.roomId ?? null) : null;
                                  session.doorGateId = jumpData?.gCId ?? jumpData?.grfCompunentId ?? jumpData?.doorId ?? jumpData?.door ?? jumpData?.exitId ?? null;
                                  session.gCId = jumpData?.gCId ?? null;
                                  session.doorGateTargetRoomId = cleanCmd === 'rooms__changeRoom' ? (transitionTarget?.roomId ?? null) : null;
                                  session.doorGateBlockedReason = transitionTarget ? null : 'unresolved_target';
                                  session.roomTransitionErrorSeen = transitionTarget ? false : true;
                                  session.roomTransitionCompleted = false;
                                  session.roomTransitionRoomAssetRequested = false;
                                  session.roomTransitionRoomTxtRequested = false;
                                  recordFreezeTimelineEvent(session, 'roomTransition.request', 'client', {
                                    command: cleanCmd,
                                    fromRoomId: currentRoomId,
                                    targetRoomId: transitionTarget?.roomId ?? null,
                                    targetRoomName: transitionTarget?.roomName ?? null,
                                    decodedPd: jumpData
                                  }, 'Client requested a room transition.');
                                }

                                if (transitionTarget) {
                                  if (sfsSession) {
                                    sfsSession.currentRoom = String(transitionTarget.roomId);
                                    if (transitionTarget.x !== undefined) sfsSession.x = transitionTarget.x;
                                    if (transitionTarget.y !== undefined) sfsSession.y = transitionTarget.y;
                                    if (transitionTarget.direction !== undefined) sfsSession.AD = transitionTarget.direction as any;
                                  }

                                  const joinRes = handleRoomJoin(`action='joinRoom' r='${transitionTarget.roomId}'`, session.userId, config);
                                  if (joinRes) {
                                    responses.push(...joinRes);
                                    if (session) {
                                      session.currentRoomId = transitionTarget.roomId;
                                      session.roomTransitionResponsePackets = joinRes.map(getPacketType);
                                      session.roomTransitionJoinOkSent = joinRes.some(r => r.includes("action='joinOK'") || r.includes('action="joinOK"'));
                                      session.roomTransitionSysJoinOkSent = session.roomTransitionJoinOkSent;
                                      session.roomTransitionUserListSent = joinRes.some(r => r.includes('<uLs>') || r.includes("action='uList'") || r.includes('action="uList"'));
                                      if (cleanCmd === 'rooms__jumpToRoom') {
                                        session.jumpToRoomResponseShape = session.roomTransitionResponsePackets;
                                      }
                                      if (cleanCmd === 'rooms__changeRoom') {
                                        session.changeRoomResponseShape = session.roomTransitionResponsePackets;
                                      }
                                      session.roomTransitionErrorSeen = false;
                                      recordFreezeTimelineEvent(session, 'roomTransition.response', 'server', {
                                        packetTypes: session.roomTransitionResponsePackets,
                                        targetRoomId: transitionTarget.roomId,
                                        targetRoomName: transitionTarget.roomName
                                      }, 'Server generated joinOK for room transition; no xt success packet is sent because the client treats that path as an entry/error popup.');
                                    }
                                  }
                                } else {
                                  if (session) {
                                    session.roomTransitionResponsePackets = [];
                                    session.roomTransitionErrorSeen = true;
                                    recordFreezeTimelineEvent(session, 'roomTransition.unresolved', 'server', {
                                      command: cleanCmd,
                                      decodedPd: jumpData,
                                      blockedReason: session.doorGateBlockedReason
                                    }, 'Server could not resolve the transition target and intentionally avoided the popup-triggering errorId:-2 response.');
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

            // Extract userId from logOK response to associate with this session
            const packetsToSearch = loginRes ? [...responses, ...loginRes] : responses;
            for (const res of packetsToSearch) {
              if (res.includes("action='logOK'") || res.includes('action="logOK"')) {
                timelineManager.recordMilestone(request.ip, request.headers['user-agent'] || '', 'sysLogOK');
                const idMatch = res.match(/id=['"](\d+)['"]/);
                if (idMatch) {
                  session.userId = parseInt(idMatch[1], 10);
                }
              }
            }

            // Record login response timestamp once responses are assembled
            if (loginRes && session) {
              session.loginResponseAt = Date.now();
              // Record xtLoginSentAt if xt.login is in the immediate response
              if (responses.some(r => r.includes('"c":"login"') && r.includes('"_cmd":"login"'))) {
                session.xtLoginSentAt = Date.now();
              }
              recordFreezeTimelineEvent(session, 'login.response.delivered', 'server', {
                deliveryMode: session.blueboxLoginDeliveryMode || session.loginMode || null,
                packetTypes: responses.map(getPacketType),
                deferredResponseType: deferredResponse ? getPacketType(deferredResponse) : null,
                immediateXtLogin: responses.some(r => r.includes('"c":"login"') && r.includes('"_cmd":"login"'))
              }, 'Server assembled and delivered the login response packets.');
            }

            // Flush existing queue alongside newly generated responses
            const allResponses = [...responses, ...session.queue];
            session.queue = [];

            for (const res of allResponses) {
              if (res.includes('"c":"login"') && res.includes('"_cmd":"login"')) {
                timelineManager.recordMilestone(request.ip, request.headers['user-agent'] || '', 'xtLoginDelivered');
                if (session && !session.xtLoginSentAt) session.xtLoginSentAt = Date.now();
                recordFreezeTimelineEvent(session, 'xt.login.delivered', 'server', {
                  packetType: getPacketType(res),
                  deliveryMode: session.blueboxLoginDeliveryMode || session.loginMode || null
                }, 'xt.login reached the client in this BlueBox response.');
              }

              // Analyze JSON response commands and missing _cmd properties
              if (res.trim().startsWith('{') && session) {
                try {
                  const parsed = JSON.parse(res);
                  if (parsed && parsed.t === 'xt') {
                    const cmdName = parsed.b?.c;
                    if (cmdName) {
                      const hasCmd = parsed.b?.o && parsed.b.o._cmd !== undefined;
                      if (!session.extensionResponseCmdCoverage) {
                        session.extensionResponseCmdCoverage = {};
                      }
                      session.extensionResponseCmdCoverage[cmdName] = hasCmd;

                      if (!hasCmd) {
                        if (!session.xtResponsesMissingCmd) {
                          session.xtResponsesMissingCmd = [];
                        }
                        if (!session.xtResponsesMissingCmd.includes(cmdName)) {
                          session.xtResponsesMissingCmd.push(cmdName);
                        }
                        session.xtResponsesMissingCmdCount = (session.xtResponsesMissingCmdCount || 0) + 1;
                        session.lastXtResponseMissingCmd = cmdName;
                      }
                    }
                  }
                } catch (_) {}
              }
            }

            if (allResponses.length > 0) {
              responseText = allResponses.join('\n') + '\n';
            } else {
              responseText = 'ok\n';
            }

            if (!isHandled && cmdName && responseText === 'ok\n') {
              let decodedPd: any = null;
              let rawCmd: any = null;
              try {
                const parsed = JSON.parse(payload);
                rawCmd = parsed?.b?.o || parsed?.b || null;
                if (parsed?.b?.p?.d) {
                  const decodedStr = Buffer.from(parsed.b.p.d, 'base64').toString('utf8');
                  decodedPd = JSON.parse(decodedStr);
                }
              } catch (_) {}

              unhandledCommandCounts[cmdName] = (unhandledCommandCounts[cmdName] || 0) + 1;
              const sfsSession = session.userId ? sfsActiveSessions.get(session.userId) : null;
              const roomId = sfsSession?.currentRoom ? parseInt(sfsSession.currentRoom, 10) : -1;
              const unhandledEntry = {
                commandName: cmdName,
                roomId,
                decodedPd,
                rawCmd,
                ts: new Date().toISOString(),
                responseBody: 'ok\n'
              };
              lastUnhandledCommands.push(unhandledEntry);
              if (lastUnhandledCommands.length > 50) {
                lastUnhandledCommands.shift();
              }
              logger.warn('http', `[BLUEBOX] Unhandled command: ${cmdName} (room ${roomId}) - payload keys: ${rawCmd ? Object.keys(rawCmd).join(',') : 'n/a'}`);
            }

            // Post-flush: push any deferred responses back to the queue so they are picked up by the next poll!
            if (deferredResponse && session) {
              session.queue.push(deferredResponse);
              recordFreezeTimelineEvent(session, 'deferredResponse.queued', 'server', {
                packetType: getPacketType(deferredResponse)
              }, 'A deferred packet was queued for a later poll.');
            }
            logger.info('http', `[BLUEBOX] Command for session ${extractedSessionId} payload="${payload}" -> ${responseText.trim()}`);
          } else {
            responseText = 'ok\n';
            logger.info('http', `[BLUEBOX] Non-SFS command payload="${payload}" -> ok\\n`);
          }
        }
      }

      // Construct request record
      const entry: CapturedRequest = {
        timestamp: new Date().toISOString(),
        method: request.method,
        url: request.url,
        headers: { ...request.headers },
        contentType,
        rawBody,
        truncated,
        parsedParams,
        sfsHttp,
        sessionId: extractedSessionId,
        responseBody: responseText
      };

      capturedRequests.push(entry);
      if (capturedRequests.length > 100) {
        capturedRequests.shift(); // Keep only the latest 100 entries
      }

      const isPoll = sfsHttp && (sfsHttp.endsWith('poll') || sfsHttp === 'poll');
      (request as any).isBlueBoxPoll = Boolean(isPoll);
      if (!isPoll) {
        capturedNonPollRequests.push(entry);
        if (capturedNonPollRequests.length > 50) {
          capturedNonPollRequests.shift();
        }
      }

      // Log details. Polls are still captured internally, but their verbose body logs are opt-in.
      if (!isPoll || config.verboseBlueboxPolls) {
        logger.info('http', `[BLUEBOX] Received HttpBox.do`);
        logger.info('http', `[BLUEBOX] content-type: ${contentType}`);
        logger.info('http', `[BLUEBOX] raw body: ${loggedBodyPreview}`);
        if (parsedParams) {
          logger.info('http', `[BLUEBOX] parsed params if urlencoded: ${JSON.stringify(parsedParams)}`);
        }
        if (sfsHttp) {
          logger.info('http', `[BLUEBOX] sfsHttp value if present: ${sfsHttp}`);
        }
      }

      reply.type('text/plain; charset=utf-8');
      (request as any).deliveryMode = 'fallback';
      (request as any).byteSize = Buffer.byteLength(responseText);
      
      return reply.send(responseText);
    });
  }

  // Register the debug report endpoint
  fastify.get('/debug/bluebox-report', async (request, reply) => {
    const jsonStr = JSON.stringify(capturedRequests, null, 2);
    (request as any).deliveryMode = 'fallback';
    (request as any).byteSize = Buffer.byteLength(jsonStr);
    
    reply.type('application/json; charset=utf-8');
    return reply.send(jsonStr);
  });

    // Register the debug summary endpoint
  fastify.get('/debug/bluebox-summary', async (request, reply) => {
    // Find the latest session
    let latestSession: BlueBoxSession | undefined = undefined;
    for (const session of activeSessions.values()) {
      if (!latestSession || session.created > latestSession.created) {
        latestSession = session;
      }
    }

    const connectSeen = capturedNonPollRequests.some(r => r.sfsHttp === 'connect');
    const verChkSeen = capturedNonPollRequests.some(r => r.rawBody?.includes("action='verChk'") || r.rawBody?.includes('action="verChk"') || r.sfsHttp?.includes('action="verChk"') || r.sfsHttp?.includes("action='verChk'"));
    const loginSeen = capturedNonPollRequests.some(r => r.rawBody?.includes("action='login'") || r.rawBody?.includes('action="login"') || r.sfsHttp?.includes('action="login"') || r.sfsHttp?.includes("action='login'"));
    const getRmListSeen = capturedNonPollRequests.some(r => r.rawBody?.includes("action='getRmList'") || r.rawBody?.includes('action="getRmList"') || r.sfsHttp?.includes('action="getRmList"') || r.sfsHttp?.includes('action="getRmList"'));
    const getStaticRoomListSeen = capturedNonPollRequests.some(r => r.rawBody?.includes('rooms__getStaticRoomList') || r.sfsHttp?.includes('rooms__getStaticRoomList'));
    const joinFirstRoomSeen = capturedNonPollRequests.some(r => r.rawBody?.includes('rooms__joinFirstRoom') || r.rawBody?.includes('user__joinFirstRoom') || r.sfsHttp?.includes('rooms__joinFirstRoom') || r.sfsHttp?.includes('user__joinFirstRoom'));
    const joinRoomSeen = capturedNonPollRequests.some(r => r.rawBody?.includes("action='joinRoom'") || r.rawBody?.includes('action="joinRoom"') || r.sfsHttp?.includes('action="joinRoom"') || r.sfsHttp?.includes("action='joinRoom'"));
    const wallGetUserMessagesSeen = capturedNonPollRequests.some(r => r.rawBody?.includes('wall__getUserMessages') || r.sfsHttp?.includes('wall__getUserMessages'));
    const userGetUserTOSeen = capturedNonPollRequests.some(r => r.rawBody?.includes('user__getUserTO') || r.sfsHttp?.includes('user__getUserTO'));
    const userGetUserDataSeen = capturedNonPollRequests.some(r => r.rawBody?.includes('user__getUserData') || r.rawBody?.includes('user__getUserDetail') || r.rawBody?.includes('user__getUserCardInfo') || r.rawBody?.includes('user__getUserCard') || r.rawBody?.includes('user__getUserTO') || r.sfsHttp?.includes('user__getUserData') || r.sfsHttp?.includes('user__getUserDetail') || r.sfsHttp?.includes('user__getUserCardInfo') || r.sfsHttp?.includes('user__getUserCard') || r.sfsHttp?.includes('user__getUserTO'));
    const wallGetNumUnreadMessagesSeen = capturedNonPollRequests.some(r => r.rawBody?.includes('wall__getNumUnReadMessages') || r.sfsHttp?.includes('wall__getNumUnReadMessages'));
    const worldAdventureDetailsSeen = capturedNonPollRequests.some(r => r.rawBody?.includes('worldAdven__getAdventureDetails') || r.sfsHttp?.includes('worldAdven__getAdventureDetails'));
    const buddyListGetUserBuddiesSeen = capturedNonPollRequests.some(r => r.rawBody?.includes('buddyList__getUserBuddies') || r.sfsHttp?.includes('buddyList__getUserBuddies'));
    const rewardSystemSeen = capturedNonPollRequests.some(r => r.rawBody?.includes('rewardSystem__') || r.sfsHttp?.includes('rewardSystem__'));

    const latestTimeline = timelineManager.getLatestSession();
    const sessionMilestones = latestTimeline?.milestones || [];
    const hasMilestone = (name: string) => sessionMilestones.some((m: any) => m.name === name);

    const langCalls = ruffleDiagnosticsManager.getLanguageSetCalls();
    const defaultLanguage = config.defaultLanguage;
    const languageDiagnostics = {
      languageSetCalls: langCalls,
      languageChangedToZero: langCalls.includes('0'),
      languageChangedToDefault: langCalls.includes(String(defaultLanguage)),
      firstLanguageValue: langCalls[0] || null,
      finalLanguageValue: langCalls[langCalls.length - 1] || null,
      defaultLanguage
    };

    const lastNonPoll = capturedNonPollRequests[capturedNonPollRequests.length - 1] || null;

    const room20AssetLoadedMilestone = latestTimeline?.milestones?.find((m: any) => m.name === 'room20AssetLoaded');
    const room20AssetLoadedAt = room20AssetLoadedMilestone ? room20AssetLoadedMilestone.timestamp : null;

    const room20TxtServedMilestone = latestTimeline?.milestones?.find((m: any) => m.name === 'room20TxtServed');
    const room20TxtServedAt = room20TxtServedMilestone ? room20TxtServedMilestone.timestamp : null;

    const roomAssetToUListMs = (room20AssetLoadedAt && latestSession?.userListSentAt)
      ? (latestSession.userListSentAt - room20AssetLoadedAt)
      : null;
    const canvasTextDiagnostics = ruffleDiagnosticsManager.getCanvasTextDiagnosticsReport();
    const socketDiagnostics = ruffleDiagnosticsManager.getSocketDiagnostics();
    const externalInterfaceTimingDiagnostics = ruffleDiagnosticsManager.getExternalInterfaceTimingDiagnostics();
    const roomAssetDiagnostics = ruffleDiagnosticsManager.getRoomAssetDiagnosticsReport() as any;
    if (latestSession?.roomTransitionTargetRoomName) {
      latestSession.roomTransitionRoomAssetRequested = (roomAssetDiagnostics.roomSwfRequestedNames || []).includes(latestSession.roomTransitionTargetRoomName);
      latestSession.roomTransitionRoomTxtRequested = (roomAssetDiagnostics.roomTxtRequestedNames || []).includes(latestSession.roomTransitionTargetRoomName);
      latestSession.lastRoomLoaded = roomAssetDiagnostics.lastRoomLoaded || latestSession.lastRoomLoaded || null;
      latestSession.roomTransitionCompleted = latestSession.roomTransitionRoomAssetRequested === true;
      latestSession.roomLoaderVersionDetected = roomAssetDiagnostics.roomLoaderVersionDetected || 'unknown';
      latestSession.roomLoaderExpectedTxt = roomAssetDiagnostics.roomLoaderExpectedTxt ?? null;
      latestSession.roomLoaderMetadataSource = roomAssetDiagnostics.roomLoaderMetadataSource || 'unknown';
      latestSession.roomTransitionLoaderVersion = latestSession.roomTransitionRoomTxtRequested
        ? 'old-swf-plus-txt'
        : (latestSession.roomTransitionRoomAssetRequested ? 'unknown' : null);
      latestSession.lastRoomLoadedLoaderVersion = roomAssetDiagnostics.lastRoomLoadedLoaderVersion || null;
    }
    const freezeTimeline = latestSession?.freezeTimeline || [];
    const freezeDiagnostics = latestSession ? {
      firstPollAfterLoginAt: latestSession.firstPollAfterLoginAt ?? null,
      firstNonPollAfterLoginAt: latestSession.firstNonPollAfterLoginAt ?? null,
      firstNonPollAfterLoginCommand: latestSession.firstNonPollAfterLoginCommand ?? null,
      verChkRequestAt: latestSession.verChkRequestAt ?? null,
      apiOKResponseAt: latestSession.apiOKResponseAt ?? null,
      blueboxApiOkDelayMs: config.blueboxApiOkDelayMs ?? 0,
      apiOkDelayAppliedAt: latestSession.apiOkDelayAppliedAt ?? null,
      apiOkDelayReleasedAt: latestSession.apiOkDelayReleasedAt ?? null,
      apiOkDelayActualMs: latestSession.apiOkDelayActualMs ?? null,
      blueboxConnectToVerChkMs: (latestSession.sessionStartedAt && latestSession.verChkRequestAt)
        ? latestSession.verChkRequestAt - latestSession.sessionStartedAt
        : null,
      verChkToApiOKMs: (latestSession.verChkRequestAt && latestSession.apiOKResponseAt)
        ? latestSession.apiOKResponseAt - latestSession.verChkRequestAt
        : null,
      apiOKToLoginRequestMs: (latestSession.apiOKResponseAt && latestSession.loginRequestAt)
        ? latestSession.loginRequestAt - latestSession.apiOKResponseAt
        : null,
      blueboxConnectToLoginRequestMs: (latestSession.sessionStartedAt && latestSession.loginRequestAt)
        ? latestSession.loginRequestAt - latestSession.sessionStartedAt
        : null,
      loginResponseToFirstPollMs: (latestSession.loginResponseAt && latestSession.firstPollAfterLoginAt)
        ? latestSession.firstPollAfterLoginAt - latestSession.loginResponseAt
        : null,
      loginResponseToFirstNonPollMs: (latestSession.loginResponseAt && latestSession.firstNonPollAfterLoginAt)
        ? latestSession.firstNonPollAfterLoginAt - latestSession.loginResponseAt
        : null,
      xtLoginToFirstPollMs: (latestSession.xtLoginSentAt && latestSession.firstPollAfterLoginAt)
        ? latestSession.firstPollAfterLoginAt - latestSession.xtLoginSentAt
        : null,
      xtLoginToFirstNonPollMs: (latestSession.xtLoginSentAt && latestSession.firstNonPollAfterLoginAt)
        ? latestSession.firstNonPollAfterLoginAt - latestSession.xtLoginSentAt
        : null,
      firstPollToStaticRoomListRequestMs: (latestSession.firstPollAfterLoginAt && latestSession.roomsGetStaticRoomListRequestAt)
        ? latestSession.roomsGetStaticRoomListRequestAt - latestSession.firstPollAfterLoginAt
        : null,
      firstNonPollToStaticRoomListRequestMs: (latestSession.firstNonPollAfterLoginAt && latestSession.roomsGetStaticRoomListRequestAt)
        ? latestSession.roomsGetStaticRoomListRequestAt - latestSession.firstNonPollAfterLoginAt
        : null,
      loginResponseToStaticRoomListRequestMs: (latestSession.loginResponseAt && latestSession.roomsGetStaticRoomListRequestAt)
        ? latestSession.roomsGetStaticRoomListRequestAt - latestSession.loginResponseAt
        : null,
      xtLoginToStaticRoomListRequestMs: (latestSession.xtLoginSentAt && latestSession.roomsGetStaticRoomListRequestAt)
        ? latestSession.roomsGetStaticRoomListRequestAt - latestSession.xtLoginSentAt
        : null,
      staticRoomListRequestToResponseMs: (latestSession.roomsGetStaticRoomListRequestAt && latestSession.roomsGetStaticRoomListResponseAt)
        ? latestSession.roomsGetStaticRoomListResponseAt - latestSession.roomsGetStaticRoomListRequestAt
        : null,
      staticRoomListResponseToJoinFirstRoomRequestMs: (latestSession.roomsGetStaticRoomListResponseAt && latestSession.userJoinFirstRoomRequestAt)
        ? latestSession.userJoinFirstRoomRequestAt - latestSession.roomsGetStaticRoomListResponseAt
        : null,
      loginDeliveryMode: latestSession.blueboxLoginDeliveryMode || null
    } : null;

    const summary = {
      connectSeen,
      verChkSeen,
      loginSeen,
      getRmListSeen,
      getStaticRoomListSeen,
      joinFirstRoomSeen,
      joinRoomSeen,
      wallGetUserMessagesSeen,
      userGetUserTOSeen: latestSession ? (latestSession.userGetUserTOSeen === true) : userGetUserTOSeen,
      userGetUserDataSeen: latestSession ? (latestSession.userGetUserDataSeen === true) : userGetUserDataSeen,
      userGetUserCardInfoSeen: latestSession ? (latestSession.userGetUserCardInfoSeen === true) : false,
      userGetUserCardSeen: latestSession ? (latestSession.userGetUserCardSeen === true) : false,
      userGetUserDetailSeen: latestSession ? (latestSession.userGetUserDetailSeen === true) : false,
      profileCommandResponseTypes: latestSession ? (latestSession.profileCommandResponseTypes || {}) : {},
      userMoveSeen: latestSession ? (latestSession.userMoveSeen === true) : false,
      userMoveResponseType: latestSession ? (latestSession.userMoveResponseType || []) : [],
      lastUserMoveDecodedPd: latestSession ? (latestSession.lastUserMoveDecodedPd || null) : null,
      setUvarsSeen: latestSession ? (latestSession.setUvarsSeen === true) : false,
      setUvarsVars: latestSession ? (latestSession.setUvarsVars || []) : [],
      pubMsgSeen: latestSession ? (latestSession.pubMsgSeen === true) : false,
      lastPubMsg: latestSession ? (latestSession.lastPubMsg || null) : null,
      roomsJumpToRoomSeen: latestSession ? (latestSession.roomsJumpToRoomSeen === true) : false,
      roomsJumpToRoomDecodedPd: latestSession ? (latestSession.roomsJumpToRoomDecodedPd || null) : null,
      jumpToRoomResponseShape: latestSession ? (latestSession.jumpToRoomResponseShape || null) : null,
      changeRoomResponseShape: latestSession ? (latestSession.changeRoomResponseShape || null) : null,
      roomTransitionExpectedClientCommand: latestSession ? (latestSession.roomTransitionExpectedClientCommand || null) : null,
      roomTransitionXtResponseSent: latestSession ? (latestSession.roomTransitionXtResponseSent === true) : false,
      roomTransitionSysJoinOkSent: latestSession ? (latestSession.roomTransitionSysJoinOkSent === true) : false,
      mapTargetRoomId: latestSession ? (latestSession.mapTargetRoomId ?? null) : null,
      doorGateId: latestSession ? (latestSession.doorGateId ?? null) : null,
      gCId: latestSession ? (latestSession.gCId ?? null) : null,
      doorGateTargetRoomId: latestSession ? (latestSession.doorGateTargetRoomId ?? null) : null,
      doorGateBlockedReason: latestSession ? (latestSession.doorGateBlockedReason ?? null) : null,
      roomLoaderVersionDetected: latestSession ? (latestSession.roomLoaderVersionDetected || roomAssetDiagnostics.roomLoaderVersionDetected || 'unknown') : (roomAssetDiagnostics.roomLoaderVersionDetected || 'unknown'),
      roomLoaderExpectedTxt: latestSession ? (latestSession.roomLoaderExpectedTxt ?? roomAssetDiagnostics.roomLoaderExpectedTxt ?? null) : (roomAssetDiagnostics.roomLoaderExpectedTxt ?? null),
      roomLoaderMetadataSource: latestSession ? (latestSession.roomLoaderMetadataSource || roomAssetDiagnostics.roomLoaderMetadataSource || 'unknown') : (roomAssetDiagnostics.roomLoaderMetadataSource || 'unknown'),
      roomLoaderSwfActuallyRequested: roomAssetDiagnostics.roomLoaderSwfActuallyRequested === true,
      roomLoaderTxtActuallyRequested: roomAssetDiagnostics.roomLoaderTxtActuallyRequested === true,
      roomTransitionLoaderVersion: latestSession ? (latestSession.roomTransitionLoaderVersion || null) : null,
      lastRoomLoadedLoaderVersion: latestSession ? (latestSession.lastRoomLoadedLoaderVersion || roomAssetDiagnostics.lastRoomLoadedLoaderVersion || null) : (roomAssetDiagnostics.lastRoomLoadedLoaderVersion || null),
      roomTransitionRequestedFromRoom: latestSession ? (latestSession.roomTransitionRequestedFromRoom ?? null) : null,
      roomTransitionTargetRoomId: latestSession ? (latestSession.roomTransitionTargetRoomId ?? null) : null,
      roomTransitionTargetRoomName: latestSession ? (latestSession.roomTransitionTargetRoomName ?? null) : null,
      roomTransitionResponsePackets: latestSession ? (latestSession.roomTransitionResponsePackets || []) : [],
      roomTransitionJoinOkSent: latestSession ? (latestSession.roomTransitionJoinOkSent === true) : false,
      roomTransitionUserListSent: latestSession ? (latestSession.roomTransitionUserListSent === true) : false,
      roomTransitionRoomAssetRequested: latestSession ? (latestSession.roomTransitionRoomAssetRequested === true) : false,
      roomTransitionRoomTxtRequested: latestSession ? (latestSession.roomTransitionRoomTxtRequested === true) : false,
      roomTransitionCompleted: latestSession ? (latestSession.roomTransitionCompleted === true) : false,
      roomTransitionErrorSeen: latestSession ? (latestSession.roomTransitionErrorSeen === true) : false,
      lastRoomLoaded: latestSession ? (latestSession.lastRoomLoaded || roomAssetDiagnostics.lastRoomLoaded || null) : (roomAssetDiagnostics.lastRoomLoaded || null),
      currentRoomId: latestSession ? (latestSession.currentRoomId ?? null) : null,
      wallGetNumUnreadMessagesSeen,
      controlStatePayloadDecoded: latestSession ? (latestSession.controlStatePayloadDecoded || null) : null,
      controlStatePayloadValueTypes: latestSession ? (latestSession.controlStatePayloadValueTypes || null) : null,
      controlStatePetMagicsValue: latestSession ? (latestSession.controlStatePetMagicsValue ?? null) : null,
      controlStatePetMagicsType: latestSession ? (latestSession.controlStatePetMagicsType || null) : null,
      controlStateAdminChatValue: latestSession ? (latestSession.controlStateAdminChatValue ?? null) : null,
      controlStateAdminChatType: latestSession ? (latestSession.controlStateAdminChatType || null) : null,
      controlPanelOnServerControlStateEntered: wallGetNumUnreadMessagesSeen,
      controlPanelOnServerControlStateArgsPreview: latestSession ? (latestSession.controlStatePayloadDecoded || null) : null,
      controlPanelOnServerControlStateEventClass: wallGetNumUnreadMessagesSeen ? 'AvatarEvent (inferred from RequestHandler)' : null,
      controlPanelOnServerControlStateDataKeys: latestSession?.controlStatePayloadDecoded ? Object.keys(latestSession.controlStatePayloadDecoded) : [],
      controlPanelOnServerControlStateFailStep: latestSession ? (latestSession.controlPanelOnServerControlStateFailStep || null) : null,
      controlPanelOnServerControlStateFailProperty: latestSession ? (latestSession.controlPanelOnServerControlStateFailProperty || null) : null,
      controlPanelOnServerControlStateExceptionMessage: latestSession ? (latestSession.controlPanelOnServerControlStateExceptionMessage || null) : null,
      worldAdventureDetailsSeen,
      buddyListGetUserBuddiesSeen,
      rewardSystemSeen,
      embeddedUserListInJoinOK: latestSession ? (latestSession.embeddedUserListInJoinOK ?? null) : null,
      separateUListSent: latestSession ? (latestSession.separateUListSent ?? null) : null,
      userListXmlFormat: latestSession ? (latestSession.userListXmlFormat ?? null) : null,
      originalFlowReachedServerList: hasMilestone('originalFlowReachedServerList'),
      originalFlowServerSelected: hasMilestone('originalFlowServerSelected'),
      room20Reached: hasMilestone('room20Reached'),
      unhandledCommandCounts,
      lastUnhandledCommands,
      languageDiagnostics,
      verboseBlueboxPolls: config.verboseBlueboxPolls === true,
      blueboxLoginDeliveryMode: latestSession ? (latestSession.blueboxLoginDeliveryMode || null) : null,
      loginResponsePackets: latestSession ? (latestSession.loginResponsePackets || []) : [],
      firstPollAfterLoginResponsePackets: latestSession ? (latestSession.firstPollAfterLoginResponsePackets || []) : [],
      xtLoginSentAt: latestSession ? (latestSession.xtLoginSentAt || null) : null,
      xtLoginEffectObservedAt: latestSession ? (latestSession.roomsGetStaticRoomListRequestAt || null) : null,
      xtLoginToEffectMs: latestSession ? (
        (latestSession.roomsGetStaticRoomListRequestAt && latestSession.xtLoginSentAt)
          ? (latestSession.roomsGetStaticRoomListRequestAt - latestSession.xtLoginSentAt)
          : null
      ) : null,
      blueboxJoinMode: latestSession ? (latestSession.blueboxJoinMode || null) : null,
      joinResponsePackets: latestSession ? (latestSession.joinResponsePackets || []) : [],
      firstPollAfterJoinResponsePackets: latestSession ? (latestSession.firstPollAfterJoinResponsePackets || []) : [],
      userListSentAt: latestSession ? (latestSession.userListSentAt || null) : null,
      pendingUListQueuedAt: latestSession ? (latestSession.pendingUListQueuedAt || null) : null,
      pendingUListReleasedAt: latestSession ? (latestSession.pendingUListReleasedAt || null) : null,
      pendingUListReleaseReason: latestSession ? (latestSession.pendingUListReleaseReason || null) : null,
      room20AssetLoadedAt,
      room20TxtServedAt,
      roomAssetToUListMs,
      room20TxtRequested: ruffleDiagnosticsManager.getRoom20TxtReport().room20TxtRequested,
      room20TxtServed: ruffleDiagnosticsManager.getRoom20TxtReport().room20TxtServed,
      room20TxtSizeBytes: ruffleDiagnosticsManager.getRoom20TxtReport().room20TxtSizeBytes,
      room20TxtJsonValid: ruffleDiagnosticsManager.getRoom20TxtReport().room20TxtJsonValid,
      room20TxtTopLevelKeys: ruffleDiagnosticsManager.getRoom20TxtReport().room20TxtTopLevelKeys,
      room20TxtParseError: ruffleDiagnosticsManager.getRoom20TxtReport().room20TxtParseError,
        ...roomAssetDiagnostics,
        ...ruffleDiagnosticsManager.getControlPanelAssetDiagnostics(),
        mogoWallSwfRequested: ruffleDiagnosticsManager.getMogoWallReport().mogoWallSwfRequested,
      mogoWallSwfServed: ruffleDiagnosticsManager.getMogoWallReport().mogoWallSwfServed,
      mogoWallTxtRequested: ruffleDiagnosticsManager.getMogoWallReport().mogoWallTxtRequested,
      mogoWallTxtServed: ruffleDiagnosticsManager.getMogoWallReport().mogoWallTxtServed,
      mogoWallTxtJsonValid: ruffleDiagnosticsManager.getMogoWallReport().mogoWallTxtJsonValid,
      mogoWallConfigKeys: ruffleDiagnosticsManager.getMogoWallReport().mogoWallConfigKeys,
      flowTimestamps: latestTimeline?.flowTimestamps || null,
      flowDurations: latestTimeline?.flowDurations || null,
      freezeDiagnostics,
      externalInterfaceTimingDiagnostics,
      freezeTimeline,
      blueboxApiOkDelayMs: config.blueboxApiOkDelayMs ?? 0,
      apiOkDelayAppliedAt: latestSession ? (latestSession.apiOkDelayAppliedAt ?? null) : null,
      apiOkDelayReleasedAt: latestSession ? (latestSession.apiOkDelayReleasedAt ?? null) : null,
      apiOkDelayActualMs: latestSession ? (latestSession.apiOkDelayActualMs ?? null) : null,
      investigationMarkers: {
        controlPanelAssetLoaded: hasMilestone('controlPanelAssetLoaded'),
        avatarsGrAssetLoaded: hasMilestone('avatarsGrAssetLoaded'),
        room20AssetLoaded: hasMilestone('room20AssetLoaded'),
        userListSent: hasMilestone('userListSent'),
        joinOkSent: hasMilestone('joinOkSent'),
        uListHasVars: latestSession ? (latestSession.uListHasVars === true) : false,
        room20PageViewSeen: ruffleDiagnosticsManager.isRoom20PageViewSeen(),
        controlPanelVisible: ruffleDiagnosticsManager.isControlPanelVisible(),
        controlPanelInitialized: ruffleDiagnosticsManager.isControlPanelInitialized(),
        ...ruffleDiagnosticsManager.getControlPanelAssetDiagnostics(),
        controlStatePayloadDecoded: latestSession ? (latestSession.controlStatePayloadDecoded || null) : null,
        controlStatePetMagicsValue: latestSession ? (latestSession.controlStatePetMagicsValue ?? null) : null,
        controlStatePetMagicsType: latestSession ? (latestSession.controlStatePetMagicsType || null) : null,
        controlStateAdminChatValue: latestSession ? (latestSession.controlStateAdminChatValue ?? null) : null,
        controlStateAdminChatType: latestSession ? (latestSession.controlStateAdminChatType || null) : null,
        controlPanelOnServerControlStateEntered: wallGetNumUnreadMessagesSeen,
        controlPanelOnServerControlStateFailStep: latestSession ? (latestSession.controlPanelOnServerControlStateFailStep || null) : null,
        controlPanelOnServerControlStateFailProperty: latestSession ? (latestSession.controlPanelOnServerControlStateFailProperty || null) : null,
        controlPanelOnServerControlStateExceptionMessage: latestSession ? (latestSession.controlPanelOnServerControlStateExceptionMessage || null) : null,
        avatarCreated: ruffleDiagnosticsManager.isAvatarCreated(),
        localUserCreated: ruffleDiagnosticsManager.isLocalUserCreated(),
        loadingScreenHidden: ruffleDiagnosticsManager.isLoadingScreenHidden(),
        lastPopupClassName: ruffleDiagnosticsManager.getLastPopupClassName(),
        mcSpecialEffectHolderWarningSeen: ruffleDiagnosticsManager.isMcSpecialEffectHolderWarningSeen(),
        missingAssetCounts: ruffleDiagnosticsManager.getMissingAssetCounts(),
        missingMp3Requests: ruffleDiagnosticsManager.getMissingMp3Requests(),
        ...ruffleDiagnosticsManager.getSoundDiagnostics(),
        popupOpened: ruffleDiagnosticsManager.getPopupOpened(),
        soundLoadErrorSeen: ruffleDiagnosticsManager.isSoundLoadErrorSeen(),
        soundLoadSuccessSeen: ruffleDiagnosticsManager.isSoundLoadSuccessSeen(),
        avatarCreationErrorSeen: ruffleDiagnosticsManager.isAvatarCreationErrorSeen(),
        controlPanelInitErrorSeen: ruffleDiagnosticsManager.isControlPanelInitErrorSeen(),
        roomChangeEventSeen: ruffleDiagnosticsManager.isRoomChangeEventSeen(),
        userAddedEventSeen: ruffleDiagnosticsManager.isUserAddedEventSeen(),
        avatarEventTraces: ruffleDiagnosticsManager.getAvatarEventTraces(),
        socketDiagnostics,
        externalInterfaceTimingDiagnostics,
        blueboxJoinMode: latestSession ? (latestSession.blueboxJoinMode || null) : null,
        joinResponsePackets: latestSession ? (latestSession.joinResponsePackets || []) : [],
        firstPollAfterJoinResponsePackets: latestSession ? (latestSession.firstPollAfterJoinResponsePackets || []) : [],
        firstPollAfterLoginAt: latestSession ? (latestSession.firstPollAfterLoginAt || null) : null,
        firstNonPollAfterLoginAt: latestSession ? (latestSession.firstNonPollAfterLoginAt || null) : null,
        firstNonPollAfterLoginCommand: latestSession ? (latestSession.firstNonPollAfterLoginCommand || null) : null,
        userListSentAt: latestSession ? (latestSession.userListSentAt || null) : null,
        pendingUListQueuedAt: latestSession ? (latestSession.pendingUListQueuedAt || null) : null,
        pendingUListReleasedAt: latestSession ? (latestSession.pendingUListReleasedAt || null) : null,
        pendingUListReleaseReason: latestSession ? (latestSession.pendingUListReleaseReason || null) : null,
        room20AssetLoadedAt,
        room20TxtServedAt,
        roomAssetToUListMs,
        rewardSystemSeen: latestSession ? (latestSession.rewardSystemSeen === true) : false,
        embeddedUserListInJoinOK: latestSession ? (latestSession.embeddedUserListInJoinOK === true) : false,
        separateUListSent: latestSession ? (latestSession.separateUListSent === true) : false,
        userListXmlFormat: latestSession ? (latestSession.userListXmlFormat || null) : null,
        canvasTextInterceptorActive: canvasTextDiagnostics.canvasTextInterceptorActive,
        canvasHebrewTextDrawCount: canvasTextDiagnostics.canvasHebrewTextDrawCount
      },
      lastNonPollPayload: lastNonPoll ? lastNonPoll.rawBody : null,
      lastNonPollResponse: lastNonPoll ? lastNonPoll.responseBody : null,
      pollCount: latestSession ? (latestSession.pollCount || 0) : 0,
      sessionId: latestSession ? latestSession.sessionId : null,
      userId: latestSession ? (latestSession.userId || null) : null,
      loginResponseTypes: latestSession ? (latestSession.loginResponseTypes || []) : [],
      loginMode: latestSession ? (latestSession.loginMode || null) : null,
      getStaticRoomListResponseType: latestSession ? (latestSession.getStaticRoomListResponseType || null) : null,
      getStaticRoomListDecodedPd: latestSession ? (latestSession.getStaticRoomListDecodedPd || null) : null,
      buddyListGetUserBuddiesResponseType: latestSession ? (latestSession.buddyListGetUserBuddiesResponseType || null) : null,
      buddyListGetUserBuddiesDecodedPd: latestSession ? (latestSession.buddyListGetUserBuddiesDecodedPd || null) : null,
      buddyListCommandCounts: latestSession ? (latestSession.buddyListCommandCounts || {}) : {},
      buddyListDecodedPdByCommand: latestSession ? (latestSession.buddyListDecodedPdByCommand || {}) : {},
      lastBuddyListRequestedShowPage: latestSession ? (latestSession.lastBuddyListRequestedShowPage ?? null) : null,
      lastBuddyListReturnedShowPage: latestSession ? (latestSession.lastBuddyListReturnedShowPage ?? null) : null,
      buddyListShowPageEchoMatchesRequest: latestSession ? (latestSession.buddyListShowPageEchoMatchesRequest ?? false) : false,
      rewardSystemCommandCounts: latestSession ? (latestSession.rewardSystemCommandCounts || {}) : {},
      rewardSystemResponseTypes: latestSession ? (latestSession.rewardSystemResponseTypes || {}) : {},
      rewardSystemDecodedPdByCommand: latestSession ? (latestSession.rewardSystemDecodedPdByCommand || {}) : {},
      nonPollCommandCounts: latestSession ? (latestSession.nonPollCommandCounts || {}) : {},
      userCardCommandCounts: latestSession ? (latestSession.userCardCommandCounts || {}) : {},
      userCardResponseTypes: latestSession ? (latestSession.userCardResponseTypes || {}) : {},
      userCardDecodedPdByCommand: latestSession ? (latestSession.userCardDecodedPdByCommand || {}) : {},
      lastUserCardResponseShapeKeys: latestSession ? (latestSession.lastUserCardResponseShapeKeys || {}) : {},
      lastUserCardResolvedUser: latestSession ? (latestSession.lastUserCardResolvedUser || null) : null,
      lastUserCardInfoRequestedUserName: latestSession ? (latestSession.lastUserCardInfoRequestedUserName ?? null) : null,
      lastUserCardInfoReturnedUserName: latestSession ? (latestSession.lastUserCardInfoReturnedUserName ?? null) : null,
      userCardInfoEchoMatchesRequest: latestSession ? (latestSession.userCardInfoEchoMatchesRequest ?? false) : false,
      xtResponsesMissingCmd: latestSession ? (latestSession.xtResponsesMissingCmd || []) : [],
      xtResponsesMissingCmdCount: latestSession ? (latestSession.xtResponsesMissingCmdCount || 0) : 0,
      lastXtResponseMissingCmd: latestSession ? (latestSession.lastXtResponseMissingCmd ?? null) : null,
      extensionResponseCmdCoverage: latestSession ? (latestSession.extensionResponseCmdCoverage || {}) : {},
      // Per-session BlueBox timestamps
      blueboxTiming: latestSession ? {
        sessionStartedAt: latestSession.sessionStartedAt ?? null,
        loginRequestAt: latestSession.loginRequestAt ?? null,
        loginResponseAt: latestSession.loginResponseAt ?? null,
        verChkRequestAt: latestSession.verChkRequestAt ?? null,
        apiOKResponseAt: latestSession.apiOKResponseAt ?? null,
        apiOkDelayAppliedAt: latestSession.apiOkDelayAppliedAt ?? null,
        apiOkDelayReleasedAt: latestSession.apiOkDelayReleasedAt ?? null,
        apiOkDelayActualMs: latestSession.apiOkDelayActualMs ?? null,
        xtLoginSentAt: latestSession.xtLoginSentAt ?? null,
        firstPollAfterLoginAt: latestSession.firstPollAfterLoginAt ?? null,
        firstNonPollAfterLoginAt: latestSession.firstNonPollAfterLoginAt ?? null,
        firstNonPollAfterLoginCommand: latestSession.firstNonPollAfterLoginCommand ?? null,
        roomsGetStaticRoomListRequestAt: latestSession.roomsGetStaticRoomListRequestAt ?? null,
        roomsGetStaticRoomListResponseAt: latestSession.roomsGetStaticRoomListResponseAt ?? null,
        userJoinFirstRoomRequestAt: latestSession.userJoinFirstRoomRequestAt ?? null,
        userJoinFirstRoomResponseAt: latestSession.userJoinFirstRoomResponseAt ?? null,
        room20ReachedAt: latestSession.room20ReachedAt ?? null,
        // Derived durations (ms)
        durations: (() => {
          const t = latestSession;
          return {
            loginRequestToResponse: (t.loginRequestAt && t.loginResponseAt) ? t.loginResponseAt - t.loginRequestAt : null,
            blueboxConnectToVerChk: (t.sessionStartedAt && t.verChkRequestAt) ? t.verChkRequestAt - t.sessionStartedAt : null,
            verChkToApiOK: (t.verChkRequestAt && t.apiOKResponseAt) ? t.apiOKResponseAt - t.verChkRequestAt : null,
            apiOKToLoginRequest: (t.apiOKResponseAt && t.loginRequestAt) ? t.loginRequestAt - t.apiOKResponseAt : null,
            blueboxConnectToLoginRequest: (t.sessionStartedAt && t.loginRequestAt) ? t.loginRequestAt - t.sessionStartedAt : null,
            loginResponseToXtLogin: (t.loginResponseAt && t.xtLoginSentAt) ? t.xtLoginSentAt - t.loginResponseAt : null,
            loginResponseToFirstPoll: (t.loginResponseAt && t.firstPollAfterLoginAt) ? t.firstPollAfterLoginAt - t.loginResponseAt : null,
            loginResponseToFirstNonPoll: (t.loginResponseAt && t.firstNonPollAfterLoginAt) ? t.firstNonPollAfterLoginAt - t.loginResponseAt : null,
            xtLoginToStaticRoomListRequest: (t.xtLoginSentAt && t.roomsGetStaticRoomListRequestAt) ? t.roomsGetStaticRoomListRequestAt - t.xtLoginSentAt : null,
            staticRoomListRequestToResponse: (t.roomsGetStaticRoomListRequestAt && t.roomsGetStaticRoomListResponseAt) ? t.roomsGetStaticRoomListResponseAt - t.roomsGetStaticRoomListRequestAt : null,
            staticRoomListResponseToJoinRequest: (t.roomsGetStaticRoomListResponseAt && t.userJoinFirstRoomRequestAt) ? t.userJoinFirstRoomRequestAt - t.roomsGetStaticRoomListResponseAt : null,
            joinRequestToResponse: (t.userJoinFirstRoomRequestAt && t.userJoinFirstRoomResponseAt) ? t.userJoinFirstRoomResponseAt - t.userJoinFirstRoomRequestAt : null,
            totalLoginToJoin: (t.loginRequestAt && t.userJoinFirstRoomResponseAt) ? t.userJoinFirstRoomResponseAt - t.loginRequestAt : null,
          };
        })()
      } : null,
      last50NonPollRequests: capturedNonPollRequests.map(r => ({
        rawBody: r.rawBody,
        responseBody: r.responseBody
      }))
    };

    const jsonStr = JSON.stringify(summary, null, 2);
    (request as any).deliveryMode = 'fallback';
    (request as any).byteSize = Buffer.byteLength(jsonStr);
    
    reply.type('application/json; charset=utf-8');
    return reply.send(jsonStr);
  });
}
