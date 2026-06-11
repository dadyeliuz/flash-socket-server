import { FastifyInstance } from 'fastify';
import {
  ServerConfig,
  logger,
  resolveSafePath,
  resolveRuffleRuntimeDir,
  ruffleDiagnosticsManager,
  safeFileExists
} from '@flash-socket-server/core';
import * as fs from 'fs';
import * as path from 'path';
import { buildLocalFlashVars, isLocalRequest } from './playHtml';
import { extractDisplayPlainTextFromTlf, decodeXmlAttributeValue } from './assets';

const RUFFLE_ENTRY_SWF = '/Swf/Mogo.swf';
const EXTERNAL_INTERFACE_HOOKS = [
  'onSetVar',
  'onTrackEvent',
  'onPageView',
  'setLanguage',
  'reloadPage',
  'clientTrace',
  'sendLog',
  'trace',
  'openWindow',
  'openUrl',
  'closeWindow',
  'setTitle',
  'onFlashReady',
  'onFlashAlert',
  'alert',
  'beMember',
  'giftCard',
  'cardCode',
  'logData',
  'openRegistWindow',
  'onGemiusPageView',
  'openMogobuzz',
  'onOpenWebWindow',
  'eval',
  'addToLog',
  'setLangAndReload'
];

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.wasm') return 'application/wasm';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.map') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function buildHooksScript(): string {
  return `
    window.__fssOriginalAlert = window.alert;
    window.__fssOriginalEval = window.eval;
    window.__fssExternalInterfaceHookTimings = [];
    window.__fssRecordExternalInterfaceHookTiming = function(hook, startedAt, args, msg) {
      var endedAt = performance.now();
      var durationMs = endedAt - startedAt;
      var sample = {
        hook: hook,
        durationMs: durationMs,
        ts: Date.now(),
        args: Array.from(args || []).map(String),
        msg: msg || ''
      };
      window.__fssExternalInterfaceHookTimings.push(sample);
      if (window.__fssExternalInterfaceHookTimings.length > 100) {
        window.__fssExternalInterfaceHookTimings.shift();
      }
      console.warn('[fss-external-interface-timing]', hook, durationMs.toFixed(3) + 'ms', sample.msg);
      report('external-interface-timing', hook, sample);
    };
  ` + EXTERNAL_INTERFACE_HOOKS.map((name) => {
    if (name === 'setTitle') {
      return `window.${name} = function(value) { report('external-interface', '${name}', { value: String(value ?? '') }); document.title = String(value ?? document.title); return 'ok'; };`;
    }
    if (name === 'reloadPage') {
      return `window.${name} = function() { report('external-interface', '${name}'); return 'blocked'; };`;
    }
    if (name === 'alert') {
      return `window.alert = function(msg) {
  var str = String(msg ?? '');
  report('flash-alert', str, { msg: str }, 'warn');
  console.warn('[flash-alert]', str);
  return 'ok';
};`;
    }
    if (name === 'eval') {
      return `window.eval = function(code) {
  var strCode = String(code ?? '');
  report('external-interface', 'eval', { code: strCode });
  try {
    return window.__fssOriginalEval(strCode);
  } catch (e) {
    report('external-interface-error', 'eval-failed', { code: strCode, error: e.message }, 'error');
    return null;
  }
};`;
    }
    if (name === 'onPageView') {
      return `window.${name} = function() {
  var __fssStartedAt = performance.now();
  var args = Array.from(arguments).map(String);
  report('external-interface', '${name}', { args: args });
  var pageName = args[0] || '';
  window.__fssLastPageView = pageName;
  if (pageName && pageName.toLowerCase().indexOf('room_20') !== -1) {
    window.__fssRoom20PageViewSeen = true;
    report('room-milestone', 'room20PageViewSeen', { pageName: pageName });
  }
  if (pageName && pageName.toLowerCase().indexOf('room') !== -1) {
    report('room-milestone', 'roomPageViewSeen', { pageName: pageName });
  }
  window.__fssRecordExternalInterfaceHookTiming('${name}', __fssStartedAt, arguments, pageName);
  return 'ok';
};`;
    }
    if (name === 'onTrackEvent') {
      return `window.${name} = function() {
  var __fssStartedAt = performance.now();
  var args = Array.from(arguments).map(String);
  var category = args[0] || '';
  var action = args[1] || '';
  report('external-interface', '${name}', { args: args, category: category, action: action });
  window.__fssLastTrackEvent = { category: category, action: action, ts: Date.now() };
  if (!window.__fssTrackEvents) window.__fssTrackEvents = [];
  window.__fssTrackEvents.push({ category: category, action: action, ts: Date.now() });
  window.__fssRecordExternalInterfaceHookTiming('${name}', __fssStartedAt, arguments, category + ':' + action);
  return 'ok';
};`;
    }
    if (name === 'sendLog' || name === 'clientTrace' || name === 'trace' || name === 'logData' || name === 'addToLog') {
      return `window.${name} = function() {
  var __fssStartedAt = performance.now();
  var args = Array.from(arguments).map(String);
  var msg = args.join(' ');
  report('flash-log', msg, { args: args, msg: msg, hook: '${name}' });
  if (!window.__fssFlashLogs) window.__fssFlashLogs = [];
  window.__fssFlashLogs.push({ hook: '${name}', msg: msg, ts: Date.now() });
  if (msg.indexOf('mcSpecialEffectHolder') !== -1) {
    window.__fssMcSpecialEffectHolderWarningSeen = true;
    report('flash-alert', 'mcSpecialEffectHolderWarningSeen', { msg: msg }, 'warn');
  }
  window.__fssRecordExternalInterfaceHookTiming('${name}', __fssStartedAt, arguments, msg);
  return 'ok';
};`;
    }
    if (name === 'onFlashAlert') {
      return `window.${name} = function() {
  var args = Array.from(arguments).map(String);
  var msg = args.join(' ');
  report('flash-alert', msg, { args: args, msg: msg }, 'warn');
  if (!window.__fssFlashAlerts) window.__fssFlashAlerts = [];
  window.__fssFlashAlerts.push({ msg: msg, ts: Date.now() });
  if (msg.indexOf('mcSpecialEffectHolder') !== -1) {
    window.__fssMcSpecialEffectHolderWarningSeen = true;
    report('flash-alert', 'mcSpecialEffectHolderWarningSeen', { msg: msg }, 'warn');
  }
  if (msg.indexOf('SwfParams is null') !== -1) {
    window.__fssSwfParamsNullSeen = true;
    report('flash-alert', 'swfParamsNullSeen', { msg: msg }, 'warn');
  }
  return 'ok';
};`;
    }
    return `window.${name} = function() { report('external-interface', '${name}', { args: Array.from(arguments).map(String) }); return 'ok'; };`;
  }).join('\n');
}

function buildCanvasTextDiagnosticsScript(enabled: boolean): string {
  if (!enabled) return '';

  return `
    (function installFssCanvasTextDiagnostics() {
      if (window.__fssCanvasTextDiagnosticsInstalled) return;
      window.__fssCanvasTextDiagnosticsInstalled = true;

      const HEBREW_RE = /[\\u0590-\\u05FF]/;
      const SAMPLE_LIMIT = 100;
      const state = {
        interceptorActive: true,
        totalDrawCount: 0,
        hebrewTextDrawCount: 0,
        fontsSeen: Object.create(null),
        methodCounts: Object.create(null),
        samples: []
      };
      let flushTimer = null;
      let lastReportedSampleCount = 0;

      function increment(map, key) {
        const normalized = key || 'unknown';
        map[normalized] = (map[normalized] || 0) + 1;
      }

      function canvasSize(ctx) {
        const canvas = ctx && ctx.canvas;
        return {
          canvasWidth: canvas && typeof canvas.width === 'number' ? canvas.width : null,
          canvasHeight: canvas && typeof canvas.height === 'number' ? canvas.height : null
        };
      }

      function scheduleFlush(force) {
        if (flushTimer) return;
        if (!force && state.totalDrawCount % 250 !== 0 && state.samples.length === lastReportedSampleCount) return;
        flushTimer = window.setTimeout(flushCanvasTextDiagnostics, force ? 0 : 250);
      }

      function flushCanvasTextDiagnostics() {
        flushTimer = null;
        lastReportedSampleCount = state.samples.length;
        try {
          fetch('/debug/ruffle-canvas-text', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              interceptorActive: state.interceptorActive,
              totalDrawCount: state.totalDrawCount,
              hebrewTextDrawCount: state.hebrewTextDrawCount,
              fontsSeen: state.fontsSeen,
              methodCounts: state.methodCounts,
              samples: state.samples
            }),
            keepalive: true
          }).catch(function (error) {
            if (window.__fssRecordDiagnosticReportFailure) window.__fssRecordDiagnosticReportFailure(error);
          });
        } catch (error) {
          if (window.__fssRecordDiagnosticReportFailure) window.__fssRecordDiagnosticReportFailure(error);
        }
      }

      function wrapContext(proto, method) {
        if (!proto || typeof proto[method] !== 'function') return;
        const original = proto[method];
        if (original.__fssCanvasTextDiagnosticsWrapped) return;
        const wrapped = function () {
          const text = arguments.length > 0 ? arguments[0] : undefined;
          state.totalDrawCount += 1;
          increment(state.methodCounts, method);
          if (typeof text === 'string' && HEBREW_RE.test(text)) {
            const font = typeof this.font === 'string' ? this.font : 'unknown';
            const size = canvasSize(this);
            state.hebrewTextDrawCount += 1;
            increment(state.fontsSeen, font);
            state.samples.push({
              method: method,
              text: text,
              font: font,
              direction: typeof this.direction === 'string' ? this.direction : undefined,
              textAlign: typeof this.textAlign === 'string' ? this.textAlign : undefined,
              x: typeof arguments[1] === 'number' ? arguments[1] : String(arguments[1] ?? ''),
              y: typeof arguments[2] === 'number' ? arguments[2] : String(arguments[2] ?? ''),
              canvasWidth: size.canvasWidth,
              canvasHeight: size.canvasHeight,
              timestamp: Date.now(),
              length: text.length
            });
            if (state.samples.length > SAMPLE_LIMIT) {
              state.samples.splice(0, state.samples.length - SAMPLE_LIMIT);
            }
            scheduleFlush(true);
          } else {
            scheduleFlush(false);
          }
          return original.apply(this, arguments);
        };
        wrapped.__fssCanvasTextDiagnosticsWrapped = true;
        proto[method] = wrapped;
      }

      wrapContext(window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype, 'fillText');
      wrapContext(window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype, 'strokeText');
      wrapContext(window.OffscreenCanvasRenderingContext2D && window.OffscreenCanvasRenderingContext2D.prototype, 'fillText');
      wrapContext(window.OffscreenCanvasRenderingContext2D && window.OffscreenCanvasRenderingContext2D.prototype, 'strokeText');

      window.__fssCanvasTextDiagnostics = state;
      flushCanvasTextDiagnostics();
      report('canvas-text-diagnostics-installed', 'Canvas text diagnostics interceptor installed');
    })();
  `;
}

function buildAudioDiagnosticsScript(): string {
  return `
    (function installFssAudioDiagnostics() {
      if (window.__fssAudioDiagnosticsInstalled) return;
      window.__fssAudioDiagnosticsInstalled = true;

      const recentMp3Fetches = [];
      const RECENT_WINDOW_MS = 5000;
      const MAX_RECENT_FETCHES = 20;

      function normalizeUrl(url) {
        if (typeof url !== 'string') return '';
        return url.replace(window.location.origin, '');
      }

      function pushRecentMp3(url) {
        const normalized = normalizeUrl(url);
        if (!normalized) return;
        recentMp3Fetches.push({ url: normalized, ts: Date.now() });
        if (recentMp3Fetches.length > MAX_RECENT_FETCHES) {
          recentMp3Fetches.shift();
        }
      }

      function recentMp3Urls() {
        const now = Date.now();
        return recentMp3Fetches
          .filter((entry) => now - entry.ts <= RECENT_WINDOW_MS)
          .map((entry) => entry.url);
      }

      function sendAudioEvent(message, details) {
        sendDiagnosticEvent({
          type: 'browser-audio-event',
          message: message,
          details: details || {}
        });
      }

      const originalFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
      if (originalFetch) {
        window.fetch = function(input, init) {
          try {
            const url = typeof input === 'string' ? input : (input && input.url) ? input.url : '';
            if (/\\.mp3(?:[?#]|$)/i.test(url)) {
              pushRecentMp3(url);
              sendAudioEvent('mp3-fetch', { url: normalizeUrl(url) });
            }
          } catch (_) {}
          return originalFetch(input, init);
        };
      }

      if (window.XMLHttpRequest && window.XMLHttpRequest.prototype.open && window.XMLHttpRequest.prototype.send) {
        const originalOpen = window.XMLHttpRequest.prototype.open;
        const originalSend = window.XMLHttpRequest.prototype.send;
        window.XMLHttpRequest.prototype.open = function(method, url) {
          try {
            this.__fssRequestUrl = typeof url === 'string' ? url : '';
          } catch (_) {}
          return originalOpen.apply(this, arguments);
        };
        window.XMLHttpRequest.prototype.send = function(body) {
          try {
            const url = typeof this.__fssRequestUrl === 'string' ? this.__fssRequestUrl : '';
            if (/\\.mp3(?:[?#]|$)/i.test(url)) {
              pushRecentMp3(url);
              sendAudioEvent('mp3-xhr', { url: normalizeUrl(url) });
            }
          } catch (_) {}
          return originalSend.apply(this, arguments);
        };
      }

      if (window.AudioBufferSourceNode && window.AudioBufferSourceNode.prototype.start) {
        const originalStart = window.AudioBufferSourceNode.prototype.start;
        window.AudioBufferSourceNode.prototype.start = function() {
          try {
            sendAudioEvent('buffer-source-start', {
              recentMp3Urls: recentMp3Urls(),
              contextState: this.context && this.context.state ? this.context.state : null
            });
          } catch (_) {}
          return originalStart.apply(this, arguments);
        };
      }

      if (window.AudioBufferSourceNode && window.AudioBufferSourceNode.prototype.stop) {
        const originalStop = window.AudioBufferSourceNode.prototype.stop;
        window.AudioBufferSourceNode.prototype.stop = function() {
          try {
            sendAudioEvent('buffer-source-stop', {
              recentMp3Urls: recentMp3Urls(),
              contextState: this.context && this.context.state ? this.context.state : null
            });
          } catch (_) {}
          return originalStop.apply(this, arguments);
        };
      }

      if (window.HTMLMediaElement && window.HTMLMediaElement.prototype.play) {
        const originalPlay = window.HTMLMediaElement.prototype.play;
        window.HTMLMediaElement.prototype.play = function() {
          try {
            sendAudioEvent('html-media-play', {
              src: normalizeUrl(this.currentSrc || this.src || ''),
              volume: typeof this.volume === 'number' ? this.volume : null,
              muted: Boolean(this.muted),
              recentMp3Urls: recentMp3Urls()
            });
          } catch (_) {}
          return originalPlay.apply(this, arguments);
        };
      }
    })();
  `;
}

export function registerPlayRuffleRoutes(fastify: FastifyInstance, config: ServerConfig) {
  const runtimeDir = resolveRuffleRuntimeDir(config);
  logger.info('ruffle', `Serving local runtime from ${runtimeDir} at /ruffle/`);

  fastify.get('/play-ruffle.html', async (request, reply) => {
    if (!isLocalRequest(request)) {
      ruffleDiagnosticsManager.record('blocked-non-localhost', {
        level: 'warn',
        message: 'Rejected non-localhost Ruffle page request.',
        details: { host: request.headers.host || '' }
      });
      (request as any).deliveryMode = 'missing';
      (request as any).byteSize = 0;
      return reply.status(403).type('text/plain; charset=utf-8').send('ruffle-local is restricted to localhost.');
    }

    const hostHeader = request.headers.host || '';
    const cleanHost = hostHeader.replace(/^\[|\]$/g, '');
    const parts = cleanHost.split(':');
    const reqHost = parts[0] || config.publicHost;
    const reqPort = parts[1] ? parseInt(parts[1], 10) : config.httpPort;

    const useDynamic = (reqHost === 'localhost' || reqHost === '127.0.0.1') &&
                        (reqPort === config.httpPort || (parts.length > 1 && parts[1] !== '80'));

    const flashVars = buildLocalFlashVars(
      config,
      useDynamic ? reqHost : config.publicHost,
      useDynamic ? reqPort : config.httpPort
    );
    const flashVarsJson = JSON.stringify(flashVars);
    const hooksScript = buildHooksScript();
    const canvasTextDiagnosticsScript = buildCanvasTextDiagnosticsScript(config.canvasTextDiagnostics === true);
    const audioDiagnosticsScript = buildAudioDiagnosticsScript();

    // Dynamically build the LoadingScreen fallback envelope
    let loadingScreenPayload: { source: string; candidates: string[] } | null = null;
    const report = ruffleDiagnosticsManager.getReport({});
    
    // First, try from previously extracted diagnostic message
    if (report.loadingScreenCompatResolvedMessage) {
      const candidates = (report.loadingScreenCompatResolvedMessage as string)
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      if (candidates.length > 0) {
        loadingScreenPayload = { source: 'extracted-local', candidates };
      }
    } else if (report.compatLoadingScreenExtractedPlainText) {
      const candidates = (report.compatLoadingScreenExtractedPlainText as string)
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      if (candidates.length > 0) {
        loadingScreenPayload = { source: 'extracted-local', candidates };
      }
    }
    
    // If not found in diagnostics (e.g. first page load), read lang.aspx proactively
    if (!loadingScreenPayload) {
      try {
        const langPath = resolveSafePath(config.assetsPath, `Servises/lang.aspx%3flang%3d${config.defaultLanguage}`);
        if (langPath && fs.existsSync(langPath)) {
          const content = fs.readFileSync(langPath, 'utf8');
          const sectionMatch = content.match(/<Section\s+name=["']LoadingScreen["']>([\s\S]*?)<\/Section>/i);
          if (sectionMatch) {
            const mTags = Array.from(sectionMatch[1].matchAll(/<M\s+[^>]*msg=["']([^"']*)["']/gi));
            const candidates: string[] = [];
            for (const mMatch of mTags) {
              const msg = decodeXmlAttributeValue(mMatch[1]);
              if (/(?:&lt;|<)\s*(?:\?xml|flow:TextFlow|TextFlow)/i.test(msg)) {
                const plainText = extractDisplayPlainTextFromTlf(mMatch[1]);
                const lines = plainText.split('\n').map(s => s.trim()).filter(s => s.length > 0);
                candidates.push(...lines);
              } else {
                const plainText = msg.trim();
                if (plainText.length > 0) {
                  candidates.push(plainText);
                }
              }
            }
            if (candidates.length > 0) {
              loadingScreenPayload = { source: 'extracted-local', candidates };
            }
          }
        }
      } catch (e: any) {
        logger.warn('http', `[http-gateway] Failed to proactively extract LoadingScreen text: ${e?.message || String(e)}`);
      }
    }
    
    if (!loadingScreenPayload) {
      loadingScreenPayload = { source: 'neutral-fallback', candidates: ['Loading...'] };
    }
    
    const loadingScreenEnvelope = `[LS_TEXT_V1]${Buffer.from(JSON.stringify(loadingScreenPayload)).toString('base64')}`;
    const loadingScreenTextCompatShimConfigured =
      config.ruffleLoadingScreenTextCompatShim === true || config.compatLoadingScreenTextMode !== 'off';
    ruffleDiagnosticsManager.recordLoadingScreenTextEnvelope({
      built: true,
      source: loadingScreenPayload.source,
      candidateCount: loadingScreenPayload.candidates.length,
      previewSafe: loadingScreenPayload.candidates[0]?.slice(0, 160) || null,
      shimConfigured: loadingScreenTextCompatShimConfigured,
      fallbackTextLength: loadingScreenEnvelope.length
    });

    // Hebrew font workaround: build CSS and preload HTML snippets controlled by config flag
    const hebrewWorkaroundEnabled = config.ruffleHebrewFontWorkaround === true;
    const rendererPreference = config.ruffleRendererPreference || 'auto';

    // CSS injected into <head> when workaround is on:
    // Maps the Hebrew Unicode block (U+0590-05FF) to the system Arial font.
    // Ruffle's canvas renderer reads CSS font definitions for device-font text;
    // this @font-face lets it locate Hebrew glyphs that the embedded SWF font lacks.
    const hebrewFontCss = hebrewWorkaroundEnabled ? `
  /* Hebrew font workaround: map Hebrew Unicode range to system Arial */
  @font-face {
    font-family: 'Arial';
    src: local('Arial'), local('Arial Unicode MS');
    unicode-range: U+0590-05FF, U+FB1D-FB4F;
    font-display: block;
  }
  @font-face {
    font-family: 'David';
    src: local('David'), local('David CLM');
    unicode-range: U+0590-05FF, U+FB1D-FB4F;
    font-display: block;
  }
  /* Ensure Hebrew text fields use a system font that has Hebrew glyphs */
  ruffle-player {
    --font-family-hebrew: Arial, 'David', 'Noto Sans Hebrew', sans-serif;
  }` : '';

    // Preload for Noto Sans Hebrew from Google Fonts (requires internet; graceful fallback if offline)
    const hebrewFontPreload = hebrewWorkaroundEnabled
      ? `  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@400;700&display=block" rel="stylesheet">`
      : '';

    ruffleDiagnosticsManager.record('page-served', {
      message: 'Served /play-ruffle.html'
    });
    ruffleDiagnosticsManager.recordRufflePageConfig({
      hebrewFontWorkaroundEnabled: hebrewWorkaroundEnabled,
      rendererPreference
    });
    ruffleDiagnosticsManager.recordRuffleFontConfig(
      config.ruffleFontSources || [],
      config.ruffleDefaultFonts || {},
      config.ruffleDeviceFontRenderer || null
    );
    ruffleDiagnosticsManager.recordRtlTextWorkaroundConfig(
      config.rtlTextWorkaround === true,
      config.rtlWrapMode || 'RLE'
    );

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mogobe Preservation - Ruffle Experiment</title>
${hebrewFontPreload}
  <style>
${hebrewFontCss}
    :root {
      --bg: #08141b;
      --panel: #11242d;
      --panel-alt: #173541;
      --accent: #f5b14c;
      --accent-2: #7ae7ff;
      --text: #ecf7fb;
      --muted: #9ab7c1;
      --error: #ff8f8f;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Consolas, 'Courier New', monospace;
      color: var(--text);
      background:
        radial-gradient(circle at top, rgba(122, 231, 255, 0.12), transparent 35%),
        linear-gradient(160deg, #050b10, var(--bg) 50%, #061019);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 24px;
    }

    .frame, .log {
      width: min(100%, 980px);
      border: 1px solid rgba(245, 177, 76, 0.35);
      border-radius: 14px;
      background: rgba(17, 36, 45, 0.92);
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
    }

    .frame {
      padding: 18px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }

    .header h1 {
      font-size: 18px;
      margin: 0;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent);
    }

    .header p {
      margin: 6px 0 0;
      color: var(--muted);
      max-width: 700px;
      line-height: 1.5;
    }

    .status {
      color: var(--accent-2);
      font-size: 13px;
      white-space: nowrap;
    }

    #player-shell {
      width: 100%;
      aspect-ratio: 16 / 10;
      min-height: 480px;
      background: #000;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid rgba(122, 231, 255, 0.22);
    }

    #player-shell > * {
      width: 100%;
      height: 100%;
      display: block;
    }

    .log {
      padding: 14px 16px;
    }

    .log h2 {
      margin: 0 0 10px;
      font-size: 13px;
      letter-spacing: 0.08em;
      color: var(--accent-2);
      text-transform: uppercase;
    }

    #log-console {
      display: grid;
      gap: 6px;
      max-height: 260px;
      overflow: auto;
      font-size: 12px;
      line-height: 1.45;
    }

    .row {
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      padding-bottom: 6px;
      color: var(--muted);
      word-break: break-word;
    }

    .row strong {
      color: var(--accent);
      margin-right: 8px;
    }

    .row.error { color: var(--error); }

    @media (max-width: 720px) {
      body { padding: 12px; }
      #player-shell { min-height: 360px; }
    }
  </style>
</head>
<body>
  <section class="frame">
    <div class="header">
      <div>
        <h1>Ruffle Local Experiment</h1>
        <p>Experimental localhost-only adapter. No SWF patches, no Flash Player binary, no projector fallback. This page is only for checking whether modern Ruffle can survive the current login and SmartFox flow.</p>
        <p id="room-loader-status">Room loader: unknown</p>
      </div>
      <div class="status" id="status-line">Booting Ruffle runtime...</div>
    </div>
    <div id="player-shell" aria-label="Ruffle player container"></div>
  </section>
  <section class="log">
    <h2>Runtime Diagnostics</h2>
    <div id="log-console"></div>
  </section>

  <script>
    const flashVars = ${flashVarsJson};
    const statusLine = document.getElementById('status-line');
    const roomLoaderStatus = document.getElementById('room-loader-status');
    const logConsole = document.getElementById('log-console');
    const playerShell = document.getElementById('player-shell');
    const diagnosticTransport = {
      diagnosticReportFailedCount: 0,
      lastDiagnosticReportFailedAt: null,
      lastDiagnosticReportFailureMessage: null,
      lastFailureLogAt: 0,
      failureLogThrottleMs: 5000
    };
    window.__fssDiagnosticTransport = diagnosticTransport;

    function appendRow(level, label, payload) {
      const row = document.createElement('div');
      row.className = 'row' + (level === 'error' ? ' error' : '');
      row.innerHTML = '<strong>[' + label + ']</strong>' + String(payload);
      logConsole.appendChild(row);
      logConsole.scrollTop = logConsole.scrollHeight;
      const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
      console[method]('[ruffle-local]', label, payload);
    }

    function recordDiagnosticReportFailure(error) {
      const now = Date.now();
      const message = error && error.message ? error.message : String(error || 'unknown diagnostic report failure');
      diagnosticTransport.diagnosticReportFailedCount += 1;
      diagnosticTransport.lastDiagnosticReportFailedAt = now;
      diagnosticTransport.lastDiagnosticReportFailureMessage = message;
      if (now - diagnosticTransport.lastFailureLogAt >= diagnosticTransport.failureLogThrottleMs) {
        diagnosticTransport.lastFailureLogAt = now;
        appendRow('warn', 'report-failed', message + ' (count=' + diagnosticTransport.diagnosticReportFailedCount + ')');
      }
    }
    window.__fssRecordDiagnosticReportFailure = recordDiagnosticReportFailure;

    function sendDiagnosticEvent(payload) {
      try {
        return fetch('/debug/ruffle-event', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true
        }).catch(recordDiagnosticReportFailure);
      } catch (error) {
        recordDiagnosticReportFailure(error);
        return Promise.resolve();
      }
    }

    function report(type, message, details, level) {
      appendRow(level || 'info', type, message || JSON.stringify(details || {}));
      const mergedDetails = Object.assign({}, details || {});
      if (diagnosticTransport.diagnosticReportFailedCount > 0 && type !== 'diagnostic-report-failure') {
        mergedDetails.diagnosticReportFailedCount = diagnosticTransport.diagnosticReportFailedCount;
        mergedDetails.lastDiagnosticReportFailedAt = diagnosticTransport.lastDiagnosticReportFailedAt;
        mergedDetails.lastDiagnosticReportFailureMessage = diagnosticTransport.lastDiagnosticReportFailureMessage;
      }
      sendDiagnosticEvent({ type, message, details: mergedDetails, level: level || 'info' });
    }

    function installFreezeConsoleDiagnostics() {
      const originalConsole = {
        log: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console)
      };
      const freezePattern = /prelogin_call_trace|mogo_wall_trace|magic_trace|user_experience_ctor_shim|button_data_grid_clear_shim|loading_screen_text_compat|long script|script.*timeout|execution.*timeout|terminated script|15\\s*(s|sec|seconds)|stalled|blocked|websocket|socket|socket proxy|missing websocket proxy|bluebox/i;
      const reportConsoleSignal = (level, args) => {
        const message = args.map((arg) => {
          if (typeof arg === 'string') return arg;
          try {
            return JSON.stringify(arg);
          } catch (_) {
            return String(arg);
          }
        }).join(' ');
        if (!freezePattern.test(message)) return;
        sendDiagnosticEvent({
          type: 'browser-console-freeze-signal',
          message,
          level,
          details: {
            performanceNow: performance.now(),
            source: 'console.' + level,
            diagnosticReportFailedCount: diagnosticTransport.diagnosticReportFailedCount,
            lastDiagnosticReportFailedAt: diagnosticTransport.lastDiagnosticReportFailedAt,
            lastDiagnosticReportFailureMessage: diagnosticTransport.lastDiagnosticReportFailureMessage
          }
        });
      };
      for (const level of ['log', 'warn', 'error']) {
        console[level] = (...args) => {
          originalConsole[level](...args);
          reportConsoleSignal(level === 'log' ? 'info' : level, args);
        };
      }
    }

    installFreezeConsoleDiagnostics();

    function setStatus(message) {
      statusLine.textContent = message;
    }

    function formatRoomLoader(summary) {
      const version = summary && (summary.roomLoaderVersionDetected || summary.lastRoomLoadedLoaderVersion);
      if (version === 'old-swf-plus-txt') return 'SWF + TXT';
      if (version === 'swf-only') return 'SWF-only';
      if (summary && summary.roomLoaderSwfActuallyRequested && !summary.roomLoaderTxtActuallyRequested) return 'SWF-only';
      return 'unknown';
    }

    function refreshRoomLoaderStatus() {
      fetch('/debug/bluebox-summary', { cache: 'no-store' })
        .then((response) => response.ok ? response.json() : null)
        .then((summary) => {
          if (!summary || !roomLoaderStatus) return;
          const loader = formatRoomLoader(summary);
          const room = summary.lastRoomLoaded || (summary.currentRoomId ? 'room_' + summary.currentRoomId : 'unknown room');
          const source = summary.roomLoaderMetadataSource || 'unknown';
          roomLoaderStatus.textContent = 'Room loader: ' + loader + ' | last room: ' + room + ' | metadata: ' + source;
        })
        .catch(recordDiagnosticReportFailure);
    }

    window.addEventListener('error', (event) => {
      report('window-error', event.message, {
        filename: event.filename,
        line: event.lineno,
        column: event.colno
      }, 'error');
    });

    window.addEventListener('unhandledrejection', (event) => {
      report('unhandled-rejection', String(event.reason), {}, 'error');
    });

    ${hooksScript}
    ${canvasTextDiagnosticsScript}
    ${audioDiagnosticsScript}

    (async () => {
      window.setInterval(refreshRoomLoaderStatus, 2000);
      refreshRoomLoaderStatus();
      report('page-boot', 'play-ruffle.html boot sequence started', { flashVars });
      setStatus('Loading local Ruffle package...');

      if (!['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        setStatus('Blocked: ruffle-local is localhost-only.');
        report('blocked-non-localhost', window.location.hostname, {}, 'warn');
        return;
      }

      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = '/ruffle/ruffle.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error('Failed to load /ruffle/ruffle.js'));
          document.head.appendChild(script);
        });

        report('ruffle-runtime-loaded', 'Local Ruffle script loaded');
        setStatus('Creating Ruffle player...');

        if (!window.RufflePlayer || !window.RufflePlayer.newest) {
          throw new Error('window.RufflePlayer.newest() was not registered by the local package.');
        }

        const ruffle = window.RufflePlayer.newest();
        const player = ruffle.createPlayer();
        const fssRuffleConfig = {
          allowScriptAccess: true,
          autoplay: 'on',
          warnOnUnsupportedContent: true,
          splashScreen: false,
          logLevel: 'warn',
          quality: 'best',
          fontSources: ${JSON.stringify(config.ruffleFontSources || [])},
          ${config.ruffleDefaultFonts ? `defaultFonts: ${JSON.stringify(config.ruffleDefaultFonts)},` : ''}
          ${config.ruffleDeviceFontRenderer ? `deviceFontRenderer: ${JSON.stringify(config.ruffleDeviceFontRenderer)},` : ''}
          ${config.ruffleHebrewRtlWorkaround ? 'hebrewRtlWorkaround: true,' : ''}
          ${config.ruffleRtlLayoutDiagnostics ? 'rtlLayoutDiagnostics: true,' : ''}
          ${config.ruffleFastFailSocketWithoutProxy ? 'fastFailSocketWithoutProxy: true,' : ''}
          ${config.rufflePreloginCallTrace ? 'preloginCallTrace: true,' : ''}
          ${config.ruffleUserExperienceCtorShim ? 'userExperienceCtorShim: true,' : ''}
          ${config.ruffleTextFlowEditorCtorShim ? 'textFlowEditorCtorShim: true,' : ''}
          ${config.ruffleMagicControlPanelShim ? 'magicControlPanelShim: true,' : ''}
          ${config.ruffleButtonGridClearShim ? 'buttonGridClearShim: true,' : ''}
          ${loadingScreenTextCompatShimConfigured ? 'loadingScreenTextCompatShim: true,' : ''}
          ${loadingScreenTextCompatShimConfigured ? `loadingScreenTextCompatFallbackText: ${JSON.stringify(config.ruffleLoadingScreenTextCompatFallbackText || loadingScreenEnvelope)},` : ''}
        };
        // Ruffle 0.2.0 player config.
        // NOTE: fontSources and defaultFontFaces are NOT supported by this Ruffle version
        // (0.2.0) and are silently ignored. Font workarounds are applied at the CSS level
        // instead (see @font-face in <head> when ruffleHebrewFontWorkaround is enabled).
        // rendererPreference hint: ${rendererPreference}
        // hebrewFontWorkaround: ${hebrewWorkaroundEnabled}
        // hebrewRtlWorkaround: ${config.ruffleHebrewRtlWorkaround === true}
        // rtlLayoutDiagnostics: ${config.ruffleRtlLayoutDiagnostics === true}
        // fastFailSocketWithoutProxy: ${config.ruffleFastFailSocketWithoutProxy === true}
        // preloginCallTrace: ${config.rufflePreloginCallTrace === true}
        // userExperienceCtorShim: ${config.ruffleUserExperienceCtorShim === true}
        // textFlowEditorCtorShim: ${config.ruffleTextFlowEditorCtorShim === true}
        // magicControlPanelShim: ${config.ruffleMagicControlPanelShim === true}
        // buttonGridClearShim: ${config.ruffleButtonGridClearShim === true}
        player.config = fssRuffleConfig;
        console.warn('[fss-ruffle-config]', 'player.config.hebrewRtlWorkaround =', player.config && player.config.hebrewRtlWorkaround);
        console.warn('[fss-ruffle-config]', 'player.config.rtlLayoutDiagnostics =', player.config && player.config.rtlLayoutDiagnostics);
        console.warn('[fss-ruffle-config]', 'player.config.fastFailSocketWithoutProxy =', player.config && player.config.fastFailSocketWithoutProxy);
        console.warn('[fss-ruffle-config]', 'player.config.preloginCallTrace =', player.config && player.config.preloginCallTrace);
        console.warn('[fss-ruffle-config]', 'player.config.userExperienceCtorShim =', player.config && player.config.userExperienceCtorShim);
        console.warn('[fss-ruffle-config]', 'player.config.textFlowEditorCtorShim =', player.config && player.config.textFlowEditorCtorShim);
        console.warn('[fss-ruffle-config]', 'player.config.magicControlPanelShim =', player.config && player.config.magicControlPanelShim);
        console.warn('[fss-ruffle-config]', 'player.config.buttonGridClearShim =', player.config && player.config.buttonGridClearShim);
        console.warn('[fss-ruffle-config]', 'player.config.loadingScreenTextCompatShim =', player.config && player.config.loadingScreenTextCompatShim);
        report('ruffle-hebrew-rtl-config-js', 'Ruffle Hebrew RTL config set on player.config', {
          playerConfigHebrewRtlWorkaround: Boolean(player.config && player.config.hebrewRtlWorkaround),
          generatedHebrewRtlWorkaround: ${config.ruffleHebrewRtlWorkaround === true},
          playerConfigRtlLayoutDiagnostics: Boolean(player.config && player.config.rtlLayoutDiagnostics),
          generatedRtlLayoutDiagnostics: ${config.ruffleRtlLayoutDiagnostics === true},
          playerConfigFastFailSocketWithoutProxy: Boolean(player.config && player.config.fastFailSocketWithoutProxy),
          generatedFastFailSocketWithoutProxy: ${config.ruffleFastFailSocketWithoutProxy === true},
          playerConfigPreloginCallTrace: Boolean(player.config && player.config.preloginCallTrace),
          generatedPreloginCallTrace: ${config.rufflePreloginCallTrace === true},
          playerConfigUserExperienceCtorShim: Boolean(player.config && player.config.userExperienceCtorShim),
          generatedUserExperienceCtorShim: ${config.ruffleUserExperienceCtorShim === true},
          playerConfigTextFlowEditorCtorShim: Boolean(player.config && player.config.textFlowEditorCtorShim),
          generatedTextFlowEditorCtorShim: ${config.ruffleTextFlowEditorCtorShim === true},
          playerConfigMagicControlPanelShim: Boolean(player.config && player.config.magicControlPanelShim),
          generatedMagicControlPanelShim: ${config.ruffleMagicControlPanelShim === true},
          playerConfigButtonGridClearShim: Boolean(player.config && player.config.buttonGridClearShim),
          generatedButtonGridClearShim: ${config.ruffleButtonGridClearShim === true},
          playerConfigLoadingScreenTextCompatShim: Boolean(player.config && player.config.loadingScreenTextCompatShim),
          generatedLoadingScreenTextCompatShim: ${loadingScreenTextCompatShimConfigured}
        }, 'warn');
        // Report active font config to diagnostics
        report('ruffle-font-config', 'Font config applied', {
          hebrewFontWorkaroundEnabled: ${hebrewWorkaroundEnabled},
          rendererPreference: '${rendererPreference}',
          ruffleVersion: '0.2.0',
          fontSources: ${JSON.stringify(config.ruffleFontSources || [])},
          defaultFonts: ${config.ruffleDefaultFonts ? JSON.stringify(config.ruffleDefaultFonts) : 'null'},
          deviceFontRenderer: ${JSON.stringify(config.ruffleDeviceFontRenderer || null)},
          hebrewRtlWorkaround: ${config.ruffleHebrewRtlWorkaround === true},
          rtlLayoutDiagnostics: ${config.ruffleRtlLayoutDiagnostics === true},
          fastFailSocketWithoutProxy: ${config.ruffleFastFailSocketWithoutProxy === true},
          preloginCallTrace: ${config.rufflePreloginCallTrace === true},
          userExperienceCtorShim: ${config.ruffleUserExperienceCtorShim === true},
          textFlowEditorCtorShim: ${config.ruffleTextFlowEditorCtorShim === true},
          magicControlPanelShim: ${config.ruffleMagicControlPanelShim === true},
          buttonGridClearShim: ${config.ruffleButtonGridClearShim === true},
          loadingScreenTextCompatShim: ${loadingScreenTextCompatShimConfigured}
        });
        player.traceObserver = (message) => report('ruffle-trace', message);
        playerShell.appendChild(player);

        report('ruffle-player-created', 'Ruffle player element created');
        report('swf-embed-started', '${RUFFLE_ENTRY_SWF}', { flashVars });
        setStatus('Loading /Swf/Mogo.swf ...');

        await player.load({
          url: '${RUFFLE_ENTRY_SWF}',
          allowScriptAccess: true,
          parameters: flashVars,
          autoplay: 'on',
          splashScreen: false,
          warnOnUnsupportedContent: true,
          logLevel: 'warn',
          ${config.ruffleHebrewRtlWorkaround ? 'hebrewRtlWorkaround: true,' : ''}
          ${config.ruffleRtlLayoutDiagnostics ? 'rtlLayoutDiagnostics: true,' : ''}
          ${config.ruffleFastFailSocketWithoutProxy ? 'fastFailSocketWithoutProxy: true,' : ''}
          ${config.rufflePreloginCallTrace ? 'preloginCallTrace: true,' : ''}
          ${config.ruffleUserExperienceCtorShim ? 'userExperienceCtorShim: true,' : ''}
          ${config.ruffleTextFlowEditorCtorShim ? 'textFlowEditorCtorShim: true,' : ''}
          ${config.ruffleMagicControlPanelShim ? 'magicControlPanelShim: true,' : ''}
          ${config.ruffleButtonGridClearShim ? 'buttonGridClearShim: true,' : ''}
          ${loadingScreenTextCompatShimConfigured ? 'loadingScreenTextCompatShim: true,' : ''}
          ${loadingScreenTextCompatShimConfigured ? `loadingScreenTextCompatFallbackText: ${JSON.stringify(config.ruffleLoadingScreenTextCompatFallbackText || loadingScreenEnvelope)},` : ''}
        });

        report('swf-load-dispatched', '${RUFFLE_ENTRY_SWF}', { flashVars });
        setStatus('Ruffle loaded /Swf/Mogo.swf. Watch diagnostics and /debug/ruffle-report.');
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        setStatus('Ruffle experiment failed. Check diagnostics below.');
        report('ruffle-failure', message, {}, 'error');
      }
    })();
  </script>
</body>
</html>`;

    (request as any).deliveryMode = 'fallback';
    (request as any).byteSize = Buffer.byteLength(html);
    return reply.type('text/html; charset=utf-8').send(html);
  });

  fastify.get('/ruffle/*', async (request, reply) => {
    if (!isLocalRequest(request)) {
      (request as any).deliveryMode = 'missing';
      (request as any).byteSize = 0;
      return reply.status(403).type('text/plain; charset=utf-8').send('ruffle-local is restricted to localhost.');
    }

    const relativePath = (request.params as Record<string, string>)['*'];
    const resolvedPath = resolveSafePath(runtimeDir, relativePath);
    if (!resolvedPath || !safeFileExists(resolvedPath)) {
      logger.warn('adapter', `[ruffle-local] Missing runtime asset: ${relativePath}`);
      (request as any).deliveryMode = 'missing';
      (request as any).byteSize = 0;
      return reply.status(404).send('Missing Ruffle runtime file');
    }

    const buffer = fs.readFileSync(resolvedPath);
    (request as any).deliveryMode = 'asset-backed';
    (request as any).byteSize = buffer.length;
    reply.type(getMimeType(resolvedPath));
    return reply.send(buffer);
  });
}
