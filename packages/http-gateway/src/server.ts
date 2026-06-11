import fastify, { FastifyInstance } from 'fastify';
import { ServerConfig, logger } from '@flash-socket-server/core';
import { registerPlayHtmlRoute } from './routes/playHtml';
import { registerPlayRuffleRoutes } from './routes/playRuffle';
import { registerLegacyEndpoints } from './routes/legacyEndpoints';
import { registerDebugRoutes } from './routes/debug';
import { registerAssetsRoute } from './routes/assets';
import { registerBlueBoxRoute } from './routes/blueBox';

let serverInstance: FastifyInstance | null = null;

export async function startHttpServer(config: ServerConfig): Promise<FastifyInstance> {
  if (serverInstance) {
    return serverInstance;
  }

  const app = fastify({
    logger: false, // Use our custom core logger instead
    disableRequestLogging: true,
    bodyLimit: 10 * 1024 * 1024
  });

  // Middleware: Strip conditional cache headers & set strict no-cache policies to prevent Flash client crashes
  app.addHook('onRequest', async (request, reply) => {
    // Normalize consecutive slashes in request URL path to prevent routing/parsing issues (e.g. //Swf -> /Swf)
    const rawUrl = request.raw.url || '';
    const qIndex = rawUrl.indexOf('?');
    const pathPart = qIndex >= 0 ? rawUrl.substring(0, qIndex) : rawUrl;
    const queryPart = qIndex >= 0 ? rawUrl.substring(qIndex) : '';
    
    const normalizedPath = pathPart.replace(/\/+/g, '/');
    if (normalizedPath !== pathPart) {
      const newUrl = normalizedPath + queryPart;
      logger.info('http', `[onRequest Hook] Normalizing URL path: "${rawUrl}" -> "${newUrl}"`);
      request.raw.url = newUrl;
    }

    delete request.headers['if-none-match'];
    delete request.headers['if-modified-since'];
    
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '-1');
  });

  // Middleware: Log internal server errors
  app.addHook('onError', async (request, reply, error) => {
    logger.error('http', `Fastify internal error on ${request.raw.method} ${request.raw.url}: ${error.message}`, error);
  });

  // Middleware: Request Logger
  app.addHook('onResponse', async (request, reply) => {
    const duration = reply.getResponseTime();
    const method = request.method;
    const rawUrl = request.raw.url || '';
    let decodedUrl = rawUrl;
    try {
      decodedUrl = decodeURIComponent(rawUrl);
    } catch (_) {}
    const status = reply.statusCode;
    
    const deliveryMode = (request as any).deliveryMode || 'missing';
    const contentType = reply.getHeader('content-type') || 'unknown';
    const byteSize = (request as any).byteSize ?? 0;
    const timestamp = new Date().toISOString();

    const suppressVerboseBlueBoxPoll =
      (request as any).isBlueBoxPoll === true && config.verboseBlueboxPolls !== true;
    const suppressVerboseRuffleEvent =
      (request as any).isRuffleEvent === true && config.verboseRuffleEvents !== true;

    if (config.verboseHttp) {
      if (suppressVerboseBlueBoxPoll || suppressVerboseRuffleEvent) {
        return;
      }
      logger.info(
        'http',
        `[VERBOSE] Timestamp: ${timestamp} | Method: ${method} | Raw URL: ${rawUrl} | Decoded URL: ${decodedUrl} | Status: ${status} | Delivery: ${deliveryMode} | Content-Type: ${contentType} | Size: ${byteSize} bytes (${duration.toFixed(1)}ms)`
      );
    } else {
      let color = '\x1b[32m'; // Green for 2xx
      if (status >= 400) color = '\x1b[31m'; // Red
      else if (status >= 300) color = '\x1b[33m'; // Yellow

      logger.info('http', `${color}${method} ${rawUrl} -> Status: ${status} (${duration.toFixed(1)}ms)\x1b[0m`);
    }
  });

  // Register Routes (order matters: specific routes first, wildcard last)
  registerPlayHtmlRoute(app, config);
  registerPlayRuffleRoutes(app, config);
  registerLegacyEndpoints(app, config);
  registerDebugRoutes(app, config);
  registerBlueBoxRoute(app, config);
  registerAssetsRoute(app, config);

  try {
    await app.listen({ port: config.httpPort, host: '0.0.0.0' });
    logger.success('http', `HTTP Server successfully running on http://localhost:${config.httpPort}`);
    serverInstance = app;
    return app;
  } catch (err: any) {
    logger.error('http', `Failed to start HTTP server on port ${config.httpPort}: ${err.message}`, err);
    throw err;
  }
}

export async function stopHttpServer(): Promise<void> {
  if (serverInstance) {
    logger.info('http', 'Stopping HTTP server...');
    await serverInstance.close();
    serverInstance = null;
    logger.success('http', 'HTTP Server stopped.');
  }
}
