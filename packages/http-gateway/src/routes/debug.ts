import { FastifyInstance } from 'fastify';
import { ServerConfig, resolveSafePath, ruffleDiagnosticsManager, safeFileExists, timelineManager } from '@flash-socket-server/core';
import * as fs from 'fs';
import * as path from 'path';
import { buildLocalFlashVars, isLocalRequest } from './playHtml';

export function registerDebugRoutes(fastify: FastifyInstance, config: ServerConfig) {
  
  // Route: /debug/flash-smoke.swf
  fastify.get('/debug/flash-smoke.swf', async (request, reply) => {
    const smokePath = path.join(config.debugAssetsPath, 'flash-smoke.swf');
    
    if (fs.existsSync(smokePath)) {
      (request as any).deliveryMode = 'asset-backed';
      const buffer = fs.readFileSync(smokePath);
      (request as any).byteSize = buffer.length;
      reply.type('application/x-shockwave-flash');
      return reply.send(buffer);
    }
    
    (request as any).deliveryMode = 'missing';
    (request as any).byteSize = 0;
    reply.status(404).type('text/plain; charset=utf-8');
    return reply.send(
      `Smoke test SWF not found.\n` +
      `Please place a tiny legal smoke-test SWF file at "${smokePath}" to verify your projector runtime.`
    );
  });

  // Route: /debug/runtime-info
  fastify.get('/debug/runtime-info', async (request, reply) => {
    const resolvedEntryPath = resolveSafePath(config.assetsPath, `Swf/${config.entrySwf}`) || 
                              resolveSafePath(config.assetsPath, config.entrySwf);
    const entrySwfExists = resolvedEntryPath ? safeFileExists(resolvedEntryPath) : false;
    
    const host = config.publicHost;
    const socketPort = config.socketPort;
    const httpPort = config.httpPort;

    // Helper to generate URLs and commands
    const makeUrl = (swfName: string, debugVal: boolean) => 
      `http://${host}:${httpPort}/Swf/${swfName}?httpPort=${socketPort}&mainDomain=${host}:${httpPort}&mediaURL=http://${host}:${httpPort}/&debug=${debugVal}&Lang=4&serverList=${config.serverList ? 'true' : 'false'}`;

    const makeCmd = (exeName: string, swfName: string, debugVal: boolean) =>
      `C:\\PROJ\\sfs-emu\\Adobe\\${exeName} "${makeUrl(swfName, debugVal)}"`;

    const info = {
      assetsPath: config.assetsPath,
      debugAssetsPath: config.debugAssetsPath,
      entrySwfResolvedPath: resolvedEntryPath || 'Not Found',
      entrySwfExists: entrySwfExists,
      generatedLaunchUrls: {
        containerHtml: `http://${host}:${httpPort}/play.html`,
        ruffleHtml: `http://${host}:${httpPort}/play-ruffle.html`,
        mogoSwfUrlDebugEnabled: makeUrl('Mogo.swf', true),
        mogoSwfUrlDebugDisabled: makeUrl('Mogo.swf', false),
        loginSwfUrlDebugEnabled: makeUrl('Login.swf', true),
        loginSwfUrlDebugDisabled: makeUrl('Login.swf', false),
        flashSmokeSwf: `http://${host}:${httpPort}/debug/flash-smoke.swf`
      },
      ruffleFlashVars: buildLocalFlashVars(config),
      recommendedProjectorCommands: {
        mogoSwf: {
          debugEnabled: makeCmd('flashplayer_32_sa_debug.exe', 'Mogo.swf', true),
          debugDisabled: makeCmd('flashplayer_32_sa.exe', 'Mogo.swf', false)
        },
        loginSwf: {
          debugEnabled: makeCmd('flashplayer_32_sa_debug.exe', 'Login.swf', true),
          debugDisabled: makeCmd('flashplayer_32_sa.exe', 'Login.swf', false)
        }
      }
    };

    (request as any).deliveryMode = 'fallback';
    const jsonStr = JSON.stringify(info, null, 2);
    (request as any).byteSize = Buffer.byteLength(jsonStr);
    
    reply.type('application/json; charset=utf-8');
    return reply.send(jsonStr);
  });

  // Route: /debug/runtime-timeline
  fastify.get('/debug/runtime-timeline', async (request, reply) => {
    const latestSession = timelineManager.getLatestSession();
    (request as any).deliveryMode = 'fallback';
    
    if (!latestSession) {
      const response = { status: 'no_session_recorded' };
      const jsonStr = JSON.stringify(response, null, 2);
      (request as any).byteSize = Buffer.byteLength(jsonStr);
      reply.type('application/json; charset=utf-8');
      return reply.send(jsonStr);
    }

    const jsonStr = JSON.stringify(latestSession, null, 2);
    (request as any).byteSize = Buffer.byteLength(jsonStr);
    reply.type('application/json; charset=utf-8');
    return reply.send(jsonStr);
  });

  fastify.post('/debug/ruffle-event', async (request, reply) => {
    (request as any).isRuffleEvent = true;
    if (!isLocalRequest(request)) {
      return reply.status(403).send({ ok: false, error: 'ruffle-local is restricted to localhost' });
    }

    const body = (request.body || {}) as any;
    ruffleDiagnosticsManager.record(String(body.type || 'unknown'), {
      level: body.level === 'warn' || body.level === 'error' ? body.level : 'info',
      message: typeof body.message === 'string' ? body.message : undefined,
      details: body.details && typeof body.details === 'object' ? body.details : undefined
    });

    // setLanguage hook
    if (body.type === 'external-interface' && body.message === 'setLanguage' && body.details?.args?.[0]) {
      ruffleDiagnosticsManager.recordLanguageCall(String(body.details.args[0]));
    }

    // onTrackEvent hook — record to trackEvents list
    if (body.type === 'external-interface' && body.message === 'onTrackEvent' && body.details?.category) {
      ruffleDiagnosticsManager.recordTrackEvent(
        String(body.details.category || ''),
        String(body.details.action || '')
      );
    }

    // room-milestone hook — record visual milestones (room20PageViewSeen etc.)
    if (body.type === 'room-milestone' && body.message) {
      ruffleDiagnosticsManager.recordRoomMilestone(String(body.message), body.details || {});
    }

    // flash-alert hook — record Flash AppConfig.Alert / sendLog messages
    if ((body.type === 'flash-alert' || body.type === 'external-interface') && body.details?.msg) {
      ruffleDiagnosticsManager.recordFlashAlert(String(body.details.msg));
    }

    if (body.type === 'browser-audio-event' && typeof body.message === 'string') {
      if (body.message === 'buffer-source-start' || body.message === 'buffer-source-stop' || body.message === 'html-media-play') {
        ruffleDiagnosticsManager.recordRoomBackSoundAudioEvent({
          type: body.message === 'buffer-source-start'
            ? 'buffer-source-start'
            : body.message === 'buffer-source-stop'
              ? 'buffer-source-stop'
              : 'html-media-play',
          recentMp3Urls: Array.isArray(body.details?.recentMp3Urls) ? body.details.recentMp3Urls.map(String) : [],
          volume: typeof body.details?.volume === 'number' ? body.details.volume : null,
          contextState: typeof body.details?.contextState === 'string' ? body.details.contextState : null
        });
      }
    }

    (request as any).deliveryMode = 'fallback';
    (request as any).byteSize = 11;
    return reply.type('application/json; charset=utf-8').send({ ok: true });
  });

  fastify.post('/debug/ruffle-canvas-text', async (request, reply) => {
    if (!isLocalRequest(request)) {
      return reply.status(403).send({ ok: false, error: 'ruffle-local is restricted to localhost' });
    }

    const body = (request.body || {}) as any;
    ruffleDiagnosticsManager.recordCanvasTextDiagnostics({
      interceptorActive: body.interceptorActive === true,
      totalDrawCount: typeof body.totalDrawCount === 'number' ? body.totalDrawCount : undefined,
      hebrewTextDrawCount: typeof body.hebrewTextDrawCount === 'number' ? body.hebrewTextDrawCount : undefined,
      fontsSeen: body.fontsSeen && typeof body.fontsSeen === 'object' ? body.fontsSeen : undefined,
      methodCounts: body.methodCounts && typeof body.methodCounts === 'object' ? body.methodCounts : undefined,
      samples: Array.isArray(body.samples) ? body.samples : undefined
    });

    (request as any).deliveryMode = 'fallback';
    (request as any).byteSize = 11;
    return reply.type('application/json; charset=utf-8').send({ ok: true });
  });

  fastify.get('/debug/ruffle-report', async (request, reply) => {
    if (!isLocalRequest(request)) {
      return reply.status(403).send({ ok: false, error: 'ruffle-local is restricted to localhost' });
    }

    const report = ruffleDiagnosticsManager.getReport(timelineManager.getLatestSession(), config);
    const jsonStr = JSON.stringify(report, null, 2);
    (request as any).deliveryMode = 'fallback';
    (request as any).byteSize = Buffer.byteLength(jsonStr);
    reply.type('application/json; charset=utf-8');
    return reply.send(jsonStr);
  });
}
