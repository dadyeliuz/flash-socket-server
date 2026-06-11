import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ServerConfig, logger, resolveSafePath, safeFileExists, timelineManager } from '@flash-socket-server/core';
import * as fs from 'fs';
import * as crypto from 'crypto';

export function registerLegacyEndpoints(fastify: FastifyInstance, config: ServerConfig) {
  
  const loginRoutes = ['/Login.aspx', '/Servises/Login.aspx', '/Services/Login.aspx'];
  const serverRoutes = ['/Servers.aspx', '/Servises/Servers.aspx', '/Services/Servers.aspx'];
  const loginURoutes = [
    '/LoginU.aspx', '/loginu.aspx',
    '/Servises/LoginU.aspx', '/servises/loginu.aspx', '/Servises/loginu.aspx', '/servises/LoginU.aspx',
    '/Services/LoginU.aspx', '/services/loginu.aspx', '/Services/loginu.aspx', '/services/LoginU.aspx'
  ];

  // Register all Login.aspx route variations
  for (const route of loginRoutes) {
    fastify.all(route, async (request, reply) => {
      timelineManager.recordMilestone(request.ip, request.headers['user-agent'] || '', 'Login.aspx served');
      reply.type('text/xml; charset=utf-8');
      
      // Check multiple potential locations in the assets directory
      const candidates = ['Login.aspx', 'Servises/Login.aspx', 'services/Login.aspx'];
      let filePath: string | null = null;
      
      for (const relPath of candidates) {
        const potential = resolveSafePath(config.assetsPath, relPath);
        if (potential && safeFileExists(potential)) {
          filePath = potential;
          break;
        }
      }
      
      if (filePath) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          logger.info('http', `Asset-backed legacy endpoint: ${request.url} (file: ${filePath})`);
          (request as any).deliveryMode = 'asset-backed';
          (request as any).byteSize = Buffer.byteLength(content);
          return reply.send(content);
        } catch (err: any) {
          logger.error('http', `Error reading asset Login.aspx: ${err.message}`);
        }
      }
      
      // Fallback Generated XML if missing
      const firstLoadingScreensXml = config.compatLoginFirstLoadingScreensMode === 'repeated-wrapper'
        ? `    <FirstLoadingScreens>
      <Screen i="1" t="1"></Screen>
    </FirstLoadingScreens>
    <FirstLoadingScreens>
      <Screen i="1" t="1"></Screen>
    </FirstLoadingScreens>`
        : `    <FirstLoadingScreens>
      <Screen i="1" t="1"></Screen>
    </FirstLoadingScreens>`;

      const fallbackXml = `<?xml version="1.0" encoding="utf-8"?>
<Root>
  <Login status="1" allow="True" isMember="True">
    <status>1</status>
${firstLoadingScreensXml}
  </Login>
</Root>`;

      logger.info('http', `Generated fallback legacy endpoint: ${request.url}`);
      if (config.verboseHttp) {
        logger.info('http', `[VERBOSE] Generated Login.aspx XML:\n${fallbackXml}`);
      }

      (request as any).deliveryMode = 'fallback';
      (request as any).byteSize = Buffer.byteLength(fallbackXml);
      return reply.send(fallbackXml);
    });
  }

  // Register all Servers.aspx route variations
  for (const route of serverRoutes) {
    fastify.all(route, async (request, reply) => {
      timelineManager.recordMilestone(request.ip, request.headers['user-agent'] || '', 'Servers.aspx served');
      reply.type('text/xml; charset=utf-8');
      
      const candidates = ['Servers.aspx', 'Servises/Servers.aspx', 'services/Servers.aspx'];
      let filePath: string | null = null;
      
      for (const relPath of candidates) {
        const potential = resolveSafePath(config.assetsPath, relPath);
        if (potential && safeFileExists(potential)) {
          filePath = potential;
          break;
        }
      }
      
      if (filePath) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          logger.info('http', `Asset-backed legacy endpoint: ${request.url} (file: ${filePath})`);
          (request as any).deliveryMode = 'asset-backed';
          (request as any).byteSize = Buffer.byteLength(content);
          return reply.send(content);
        } catch (err: any) {
          logger.error('http', `Error reading asset Servers.aspx: ${err.message}`);
        }
      }
      
      // Fallback Generated XML using dynamically parsed host and port from headers
      const hostHeader = request.headers.host || '';
      const cleanHost = hostHeader.replace(/^\[|\]$/g, '');
      const parts = cleanHost.split(':');
      const requestHost = parts[0] || config.publicHost;
      const requestPort = parts[1] ? parseInt(parts[1], 10) : config.httpPort;

      const useDynamic = (requestHost === 'localhost' || requestHost === '127.0.0.1') &&
                          (requestPort === config.httpPort || (parts.length > 1 && parts[1] !== '80'));

      const host = useDynamic ? requestHost : config.publicHost;
      const socketPort = config.socketPort;
      const httpPort = useDynamic ? requestPort : config.httpPort;
      
      const fallbackXml = `<?xml version="1.0" encoding="utf-8"?>
<Root>
  <Servers>
    <S id="1" ip="${host}" port="${socketPort}" webPort="${httpPort}" name="שרת שימור מקומי" percentage="0" status="1" chatMode="true" friends="0" />
  </Servers>
</Root>`;

      logger.info('http', `[HTTP] Generated Servers.aspx target: ${host}:${socketPort} webPort=${httpPort}`);
      if (config.verboseHttp) {
        logger.info('http', `[VERBOSE] Generated Servers.aspx XML:\n${fallbackXml}`);
      }

      (request as any).deliveryMode = 'fallback';
      (request as any).byteSize = Buffer.byteLength(fallbackXml);
      return reply.send(fallbackXml);
    });
  }

  // Register all LoginU.aspx route variations
  for (const route of loginURoutes) {
    fastify.all(route, async (request, reply) => {
      return handleLoginU(request, reply, config);
    });
  }
}

export async function handleLoginU(request: FastifyRequest, reply: FastifyReply, config: ServerConfig) {
  timelineManager.recordMilestone(request.ip, request.headers['user-agent'] || '', 'LoginU.aspx served');
  const query = request.query as any;
  const rawUrl = request.raw.url || '';
  const rawUrlLower = rawUrl.toLowerCase();

  const hasMog = (query && (query.mog !== undefined || query.md !== undefined)) ||
                 rawUrlLower.includes('mog=') ||
                 rawUrlLower.includes('md=') ||
                 rawUrlLower.includes('mog%3d') ||
                 rawUrlLower.includes('md%3d');

  if (!hasMog) {
    // Fallback: check multiple potential locations in the assets directory
    const candidates = ['LoginU.aspx', 'Servises/LoginU.aspx', 'services/LoginU.aspx'];
    let filePath: string | null = null;
    
    for (const relPath of candidates) {
      const potential = resolveSafePath(config.assetsPath, relPath);
      if (potential && safeFileExists(potential)) {
        filePath = potential;
        break;
      }
    }
    
    if (filePath) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        logger.info('http', `Asset-backed legacy endpoint: ${request.url} (file: ${filePath})`);
        (request as any).deliveryMode = 'asset-backed';
        (request as any).byteSize = Buffer.byteLength(content);
        reply.type('application/octet-stream');
        return reply.send(content);
      } catch (err: any) {
        logger.error('http', `Error reading asset LoginU.aspx: ${err.message}`);
      }
    }
    
    return reply.status(404).send('Not Found');
  }

  // Dynamic fallback handling
  let rawMog = query.mog || '';
  let rawMd = query.md || '';

  // Extract from raw URL if not parsed in query (e.g. due to double slashes)
  if (!rawMog || !rawMd) {
    const qIndex = rawUrl.indexOf('?');
    if (qIndex >= 0) {
      const queryString = rawUrl.substring(qIndex + 1);
      const params = new URLSearchParams(queryString);
      for (const [key, value] of params.entries()) {
        const lowerKey = key.toLowerCase();
        if (lowerKey === 'mog') {
          rawMog = value;
        } else if (lowerKey === 'md') {
          rawMd = value;
        }
      }
    }
  }

  // Validate signature if possible
  const salt = '1qscvhui9';
  const expectedMd = crypto.createHash('md5')
    .update(salt + 'mogo123' + rawMog + '123mogo' + salt)
    .digest('hex');

  if (expectedMd.toLowerCase() !== rawMd.toLowerCase()) {
    logger.warn('http', `[HTTP] LoginU.aspx request signature mismatch: expected ${expectedMd}, got ${rawMd}`);
  }

  // Decode mog query string
  let cmd = '';
  let name = '';
  let pass = '';
  let t = '';

  try {
    const decodedQuery = Buffer.from(rawMog, 'base64').toString('utf8');
    const params = new URLSearchParams(decodedQuery);
    for (const [key, value] of params.entries()) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'cmd') {
        cmd = value;
      } else if (lowerKey === 'name') {
        name = value;
      } else if (lowerKey === 'pass') {
        pass = value;
      } else if (lowerKey === 't') {
        t = value;
      }
    }
  } catch (err: any) {
    logger.error('http', `Failed to decode mog payload: ${err.message}`);
  }

  logger.info('http', `[HTTP] Generated dynamic LoginU.aspx cmd=${cmd}`);

  let innerXml = '';

  if (cmd === 'Login') {
    innerXml = `<?xml version="1.0" encoding="utf-8"?>
<Root cmd="Login" t="${t}">
  <Login status="1" allow="true" isMember="true">
    <FirstLoadingScreens>
      <Screen i="1" t="1" />
    </FirstLoadingScreens>
  </Login>
</Root>`;
  } else if (cmd === 'Servers') {
    const hostHeader = request.headers.host || '';
    const cleanHost = hostHeader.replace(/^\[|\]$/g, '');
    const parts = cleanHost.split(':');
    const requestHost = parts[0] || config.publicHost;
    const requestPort = parts[1] ? parseInt(parts[1], 10) : config.httpPort;

    const useDynamic = (requestHost === 'localhost' || requestHost === '127.0.0.1') &&
                        (requestPort === config.httpPort || (parts.length > 1 && parts[1] !== '80'));

    const host = useDynamic ? requestHost : config.publicHost;
    const socketPort = config.socketPort;
    const httpPort = useDynamic ? requestPort : config.httpPort;

    timelineManager.recordMilestone(request.ip, request.headers['user-agent'] || '', 'originalFlowReachedServerList');

    innerXml = `<?xml version="1.0" encoding="utf-8"?>
<Root cmd="Servers" t="${t}">
  <Servers>
    <Server id="1" ip="${host}" port="${socketPort}" webPort="${httpPort}" name="שרת שימור מקומי" percentage="0" status="1" chatMode="true" friends="0" />
  </Servers>
</Root>`;
  } else {
    innerXml = `<?xml version="1.0" encoding="utf-8"?>
<Root cmd="${cmd}" t="${t}" status="4"></Root>`;
  }

  if (config.verboseHttp) {
    logger.info('http', `[VERBOSE] Generated LoginU.aspx Inner XML:\n${innerXml}`);
  }

  const responseMog = Buffer.from(innerXml, 'utf8').toString('base64');
  const responseMd = crypto.createHash('md5')
    .update(salt + 'mogo123' + responseMog + '123mogo' + salt)
    .digest('hex');

  const responseXml = `<?xml version="1.0" encoding="utf-8"?>
<mogobe>
  <mog>${responseMog}</mog>
  <md>${responseMd}</md>
</mogobe>`;

  if (config.verboseHttp) {
    logger.info('http', `[VERBOSE] LoginU.aspx Response MD5: ${responseMd}`);
  }

  reply.type('text/xml; charset=utf-8');
  (request as any).deliveryMode = 'fallback';
  (request as any).byteSize = Buffer.byteLength(responseXml);
  return reply.send(responseXml);
}
