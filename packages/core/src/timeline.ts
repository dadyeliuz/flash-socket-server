import { logger } from './logger';

export interface TimelineMilestone {
  name: string;
  timestamp: number;
}

export interface TimelineSession {
  id: string;
  ip: string;
  userAgent: string;
  created: number;
  lastActive: number;
  milestones: TimelineMilestone[];
  serversServedAt?: number;
  tcpObservedAt?: number;
  tcpMissingWarningFired: boolean;
  timer?: NodeJS.Timeout;
  loadingScreenRequestedAt?: number;
  loadingScreenMissingWarningFired: boolean;
  mainServedAt?: number;
  loadingTimer?: NodeJS.Timeout;
}

export class TimelineManager {
  private sessions: TimelineSession[] = [];
  private maxSessions = 50;
  private sessionCounter = 0;

  private normalizeIp(ip?: string): string {
    if (!ip) return 'unknown';
    let cleaned = ip.trim();
    if (cleaned.startsWith('::ffff:')) {
      cleaned = cleaned.substring(7);
    }
    if (cleaned === '::1') {
      cleaned = '127.0.0.1';
    }
    return cleaned;
  }

  private clearSessionTimers(session: TimelineSession) {
    if (session.timer) {
      clearTimeout(session.timer);
      delete session.timer;
    }
    if (session.loadingTimer) {
      clearTimeout(session.loadingTimer);
      delete session.loadingTimer;
    }
  }

  public recordMilestone(ip: string, userAgent: string | null, milestoneName: string): void {
    const normIp = this.normalizeIp(ip);
    const ua = userAgent || 'unknown';
    
    let session: TimelineSession | undefined;

    if (milestoneName === 'Mogo.swf served') {
      // Always create a new session on Mogo.swf to refresh the timeline
      // First, evict/clear any existing session with the exact same ip and userAgent
      const oldSessionIdx = this.sessions.findIndex(s => s.ip === normIp && s.userAgent === ua);
      if (oldSessionIdx !== -1) {
        this.clearSessionTimers(this.sessions[oldSessionIdx]);
        this.sessions.splice(oldSessionIdx, 1);
      }
      
      session = {
        id: `${normIp}-${ua}-${Date.now()}-${this.sessionCounter++}`,
        ip: normIp,
        userAgent: ua,
        created: Date.now(),
        lastActive: Date.now(),
        milestones: [],
        tcpMissingWarningFired: false,
        loadingScreenMissingWarningFired: false
      };
      this.sessions.push(session);
    } else {
      if (userAgent !== null) {
        // HTTP: Match exact IP + UserAgent
        // Find the latest active session (active in last 15 minutes)
        session = this.sessions
          .slice()
          .reverse()
          .find(s => s.ip === normIp && s.userAgent === ua && (Date.now() - s.lastActive < 15 * 60 * 1000));
      } else {
        // TCP: Match the latest active session from the same normalized IP
        session = this.sessions
          .slice()
          .reverse()
          .find(s => s.ip === normIp && (Date.now() - s.lastActive < 15 * 60 * 1000));
      }

      // If no session found and it's not Mogo.swf, fallback to creating one
      if (!session) {
        session = {
          id: `${normIp}-${ua}-${Date.now()}-${this.sessionCounter++}`,
          ip: normIp,
          userAgent: ua,
          created: Date.now(),
          lastActive: Date.now(),
          milestones: [],
          tcpMissingWarningFired: false,
          loadingScreenMissingWarningFired: false
        };
        this.sessions.push(session);
      }
    }

    // Check if we exceed maxSessions, if so evict the oldest one
    if (this.sessions.length > this.maxSessions) {
      const evicted = this.sessions.shift();
      if (evicted) {
        this.clearSessionTimers(evicted);
      }
    }

    // Record the milestone
    session.milestones.push({
      name: milestoneName,
      timestamp: Date.now()
    });
    session.lastActive = Date.now();

    // Specific milestone logic
    if (milestoneName === 'Servers.aspx served' || milestoneName === 'originalFlowReachedServerList') {
      session.serversServedAt = Date.now();
      this.clearSessionTimers(session);

      console.log(`[RUNTIME] Servers.aspx / originalFlowReachedServerList served; waiting up to 10s for TCP connection...`);

      // Start the 10-second timer
      const currentSession = session;
      currentSession.timer = setTimeout(() => {
        currentSession.tcpMissingWarningFired = true;
        console.log(`[RUNTIME] Servers.aspx / originalFlowReachedServerList served but no TCP connection observed within 10s.`);
        console.log(`[RUNTIME] Likely client halted after server selection before SmartFox connect.`);
        console.log(`[RUNTIME] Check Flash runtime / Main.initApp / ScreenManager / model.init path.`);
      }, 10000);
      
      if (currentSession.timer.unref) {
        currentSession.timer.unref();
      }
    }
    
    // Auto-record originalFlowServerSelected when connection is established
    if (milestoneName === 'first TCP connection' || milestoneName === 'blueboxConnect') {
      const reachedServerList = session.milestones.some(m => m.name === 'originalFlowReachedServerList' || m.name === 'Servers.aspx served');
      const alreadySelected = session.milestones.some(m => m.name === 'originalFlowServerSelected');
      if (reachedServerList && !alreadySelected) {
        session.milestones.push({
          name: 'originalFlowServerSelected',
          timestamp: Date.now()
        });
      }
    }

    if (milestoneName === 'first TCP connection') {
      if (session.serversServedAt && !session.tcpObservedAt) {
        session.tcpObservedAt = Date.now();
        this.clearSessionTimers(session);
        const elapsed = session.tcpObservedAt - session.serversServedAt;
        console.log(`[RUNTIME] TCP connection observed after Servers.aspx in ${elapsed}ms.`);
      }
    } else if (milestoneName === 'Main.swf served') {
      session.mainServedAt = Date.now();
      this.clearSessionTimers(session);

      // Start the 5-second diagnostic timer
      const currentSession = session;
      currentSession.loadingTimer = setTimeout(() => {
        currentSession.loadingScreenMissingWarningFired = true;
        console.log(`[RUNTIME] Main.swf served but LoadingScreen_1.swf was not requested within 5s.`);
        console.log(`[RUNTIME] Likely halt before MogoLoadingScreen construction.`);
        console.log(`[RUNTIME] Check AppConfig.FirstLoadingScreens parsing/static sharing.`);
      }, 5000);

      if (currentSession.loadingTimer.unref) {
        currentSession.loadingTimer.unref();
      }
    } else if (milestoneName === 'LoadingScreen_1.swf served' || milestoneName === 'loadingScreenRequested') {
      session.loadingScreenRequestedAt = Date.now();
      this.clearSessionTimers(session);
    }
  }

  public getLatestSession(): any {
    if (this.sessions.length === 0) {
      return null;
    }
    const session = this.sessions[this.sessions.length - 1];
    
    const getTs = (name: string) => session.milestones.find(m => m.name === name)?.timestamp;

    const showServersListTs = getTs('originalFlowReachedServerList') || getTs('Servers.aspx served');
    const selectServerTs = getTs('originalFlowServerSelected');
    const bbConnectTs = getTs('blueboxConnect');
    const apiOkTs = getTs('apiOK');
    const logOkTs = getTs('sysLogOK');
    const xtLoginDeliveredTs = getTs('xtLoginDelivered');
    const getRmListTs = getTs('getRmList');
    const getStaticRoomListTs = getTs('roomsGetStaticRoomList');
    const joinFirstRoomTs = getTs('userJoinFirstRoom');
    const room20ReachedTs = getTs('room20Reached');
    const loadingScreenRequestedTs = getTs('LoadingScreen_1.swf served') || getTs('loadingScreenRequested');

    const flowTimestamps = {
      originalFlowReachedServerList: showServersListTs || null,
      originalFlowServerSelected: selectServerTs || null,
      blueboxConnect: bbConnectTs || null,
      apiOK: apiOkTs || null,
      sysLogOK: logOkTs || null,
      xtLoginDelivered: xtLoginDeliveredTs || null,
      getRmList: getRmListTs || null,
      roomsGetStaticRoomList: getStaticRoomListTs || null,
      userJoinFirstRoom: joinFirstRoomTs || null,
      room20Reached: room20ReachedTs || null,
      loadingScreenRequested: loadingScreenRequestedTs || null
    };

    const flowDurations = {
      serverSelectToBlueBoxConnectMs: (selectServerTs && bbConnectTs) ? (bbConnectTs - selectServerTs) : null,
      blueBoxConnectToLoginMs: (bbConnectTs && logOkTs) ? (logOkTs - bbConnectTs) : null,
      loginToStaticRoomsMs: (logOkTs && getStaticRoomListTs) ? (getStaticRoomListTs - logOkTs) : null,
      staticRoomsToJoinMs: (getStaticRoomListTs && joinFirstRoomTs) ? (joinFirstRoomTs - getStaticRoomListTs) : null,
      joinToRoom20Ms: (joinFirstRoomTs && room20ReachedTs) ? (room20ReachedTs - joinFirstRoomTs) : null
    };

    // Return output shape excluding timer and calculating elapsedMs
    const elapsedMs = (session.tcpObservedAt && session.serversServedAt)
      ? (session.tcpObservedAt - session.serversServedAt)
      : undefined;

    return {
      id: session.id,
      ip: session.ip,
      userAgent: session.userAgent,
      created: session.created,
      lastActive: session.lastActive,
      milestones: session.milestones,
      flowTimestamps,
      flowDurations,
      serversServedAt: session.serversServedAt,
      tcpObservedAt: session.tcpObservedAt,
      tcpMissingWarningFired: session.tcpMissingWarningFired,
      elapsedMs,
      loadingScreenRequestedAt: session.loadingScreenRequestedAt,
      loadingScreenMissingWarningFired: session.loadingScreenMissingWarningFired
    };
  }

  public clearAll(): void {
    for (const session of this.sessions) {
      this.clearSessionTimers(session);
    }
    this.sessions = [];
  }
}

export const timelineManager = new TimelineManager();
