import { FastifyInstance, FastifyRequest } from 'fastify';
import { ServerConfig } from '@flash-socket-server/core';

export function buildLocalFlashVars(config: ServerConfig, overrideHost?: string, overridePort?: number): Record<string, string> {
  const host = overrideHost || config.publicHost;
  const httpPort = overridePort !== undefined ? overridePort : config.httpPort;

  return {
    cb: 'local-preservation',
    httpPort: String(config.socketPort),
    mainDomain: `${host}:${httpPort}`,
    mediaURL: `http://${host}:${httpPort}/`,
    debug: config.flashDebug ? 'true' : 'false',
    Lang: String(config.defaultLanguage),
    serverList: config.serverList ? 'true' : 'false'
  };
}

export function serializeFlashVars(flashVars: Record<string, string>): string {
  return Object.entries(flashVars)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

export function isLocalRequest(request: FastifyRequest): boolean {
  const hostHeader = request.headers.host || '';
  const host = hostHeader.replace(/^\[|\]$/g, '').split(':')[0].toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export function registerPlayHtmlRoute(fastify: FastifyInstance, config: ServerConfig) {
  fastify.get('/play.html', async (request, reply) => {
    reply.type('text/html; charset=utf-8');

    const entrySwf = config.entrySwf;
    const socketPort = config.socketPort;

    const html = `<!DOCTYPE html>
<html lang="he">
<head>
    <meta charset="UTF-8">
    <title>Mogobe Preservation - Play Container</title>
    <style>
        html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            background-color: #0b0c10;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            overflow: hidden;
            color: #ffffff;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }

        #game-container {
            width: 768px;
            height: 480px;
            background-color: #000000;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            border: 2px solid #1f2833;
            border-radius: 8px;
            position: relative;
        }

        #flashContent {
            width: 100%;
            height: 100%;
        }

        #debug-bar {
            width: 768px;
            margin-top: 10px;
            background-color: #1f2833;
            border-radius: 6px;
            padding: 10px 15px;
            box-sizing: border-box;
            font-size: 13px;
            border: 1px solid #c5a059;
            max-height: 150px;
            overflow-y: auto;
        }

        .log-line {
            border-bottom: 1px solid #0b0c10;
            padding: 3px 0;
            font-family: monospace;
            white-space: pre-wrap;
        }

        .log-tag {
            color: #c5a059;
            font-weight: bold;
        }
    </style>
</head>
<body>

    <h2 style="margin: 0 0 15px 0; color: #c5a059;">שער שימור משחקי פלאש - Clean-Room Container</h2>

    <div id="game-container">
        <object classid="clsid:d27cdb6e-ae6d-11cf-96b8-444553540000"
                codebase="http://fpdownload.macromedia.com/pub/shockwave/cabs/flash/swflash.cab#version=10,0,0,0"
                width="768"
                height="480"
                id="flashContent"
                align="middle">
            <param name="allowScriptAccess" value="always" />
            <param name="allowNetworking" value="all" />
            <param name="movie" value="${entrySwf}" />
            <param name="quality" value="high" />
            <param name="wmode" value="direct" />
            <param name="bgcolor" value="#000000" />

            <embed src="${entrySwf}"
                   quality="high"
                   bgcolor="#000000"
                   width="768"
                   height="480"
                   name="flashContent"
                   align="middle"
                   play="true"
                   loop="false"
                   quality="high"
                   allowScriptAccess="always"
                   allowNetworking="all"
                   wmode="direct"
                   type="application/x-shockwave-flash"
                   pluginspage="http://www.macromedia.com/go/getflashplayer">
            </embed>
        </object>
    </div>

    <div id="debug-bar">
        <div style="font-weight: bold; color: #45f3ff; margin-bottom: 5px;">פלט סביבת ריצה (ExternalInterface Log):</div>
        <div id="log-console">
            <div class="log-line"><span class="log-tag">[SYSTEM]</span> Container initialized. Configured entry: <span style="color: #66fcf1;">${entrySwf}</span>, target socket port: <span style="color: #66fcf1;">${socketPort}</span></div>
        </div>
    </div>

    <script type="text/javascript">
        const consoleEl = document.getElementById('log-console');

        function appendLog(tag, args) {
            const row = document.createElement('div');
            row.className = 'log-line';

            const tagSpan = document.createElement('span');
            tagSpan.className = 'log-tag';
            tagSpan.innerText = '[' + tag + '] ';

            row.appendChild(tagSpan);

            const argText = Array.from(args).map(arg => {
                if (typeof arg === 'object') return JSON.stringify(arg);
                return String(arg);
            }).join(', ');

            row.appendChild(document.createTextNode(argText));
            consoleEl.appendChild(row);
            consoleEl.scrollTop = consoleEl.scrollHeight;

            console.log('%c[' + tag + ']', 'color: #c5a059; font-weight: bold;', argText);
        }

        window.clientTrace = function(...args) {
            appendLog('CLIENT-TRACE', args);
            return "ok";
        };

        window.sendLog = function(...args) {
            appendLog('SEND-LOG', args);
            return "ok";
        };

        window.trace = function(...args) {
            appendLog('TRACE', args);
            return "ok";
        };

        window.openWindow = function(url, target) {
            appendLog('OPEN-WINDOW', [url, target]);
            console.warn("Blocked window popup for: " + url);
            return "blocked";
        };

        window.openUrl = function(url) {
            appendLog('OPEN-URL', [url]);
            console.warn("Blocked redirection for: " + url);
            return "blocked";
        };

        window.closeWindow = function() {
            appendLog('CLOSE-WINDOW', []);
            return "ok";
        };

        window.setTitle = function(title) {
            appendLog('SET-TITLE', [title]);
            document.title = title;
            return "ok";
        };

        window.onFlashReady = function() {
            appendLog('SYSTEM-READY', ["Flash is fully initialized."]);
            return true;
        };
    </script>
</body>
</html>`;

    (request as any).deliveryMode = 'fallback';
    (request as any).byteSize = Buffer.byteLength(html);
    return reply.send(html);
  });
}
