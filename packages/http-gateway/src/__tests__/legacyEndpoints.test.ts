import { describe, it, expect } from 'vitest';
import fastify from 'fastify';
import { ServerConfig } from '@flash-socket-server/core';
import { registerLegacyEndpoints } from '../routes/legacyEndpoints';
import { registerAssetsRoute } from '../routes/assets';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

describe('HTTP Gateway Legacy Endpoints', () => {
  const dummyConfig: ServerConfig = {
    httpPort: 8080,
    socketPort: 9339,
    policyPort: 843,
    assetsPath: './non_existent_folder_xyz', // Force generated fallback
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
    const app = fastify();
    registerLegacyEndpoints(app, dummyConfig);
    return app;
  };

  it('should return generated fallback XML for /Login.aspx', async () => {
    const app = createTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/Login.aspx'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/xml');
    
    const body = response.body;
    expect(body).toContain('<Login status="1" allow="True" isMember="True">');
    expect(body).toContain('<status>1</status>');
    expect(body).toContain('<Screen i="1" t="1"></Screen>');
    expect(body).toContain('</Login>');
    
    // Ensure exactly one FirstLoadingScreens wrapper is present
    const firstLoadingScreensCount = (body.match(/<FirstLoadingScreens>/g) || []).length;
    expect(firstLoadingScreensCount).toBe(1);
  });

  it('should support variations of Login.aspx like /Servises/Login.aspx', async () => {
    const app = createTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/Servises/Login.aspx'
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<Login status="1" allow="True" isMember="True">');
    expect(response.body).toContain('<status>1</status>');
    expect(response.body).toContain('<Screen i="1" t="1"></Screen>');
    
    const firstLoadingScreensCount = (response.body.match(/<FirstLoadingScreens>/g) || []).length;
    expect(firstLoadingScreensCount).toBe(1);
  });

  it('should return repeated FirstLoadingScreens wrappers when compatLoginFirstLoadingScreensMode is repeated-wrapper', async () => {
    const repeatedConfig: ServerConfig = {
      ...dummyConfig,
      compatLoginFirstLoadingScreensMode: 'repeated-wrapper'
    };
    const app = fastify();
    registerLegacyEndpoints(app, repeatedConfig);

    const response = await app.inject({
      method: 'GET',
      url: '/Login.aspx'
    });

    expect(response.statusCode).toBe(200);
    const body = response.body;
    expect(body).toContain('<Login status="1" allow="True" isMember="True">');
    expect(body).toContain('<status>1</status>');

    const firstLoadingScreensCount = (body.match(/<FirstLoadingScreens>/g) || []).length;
    expect(firstLoadingScreensCount).toBe(2);

    const cleanBody = body.replace(/\r\n/g, '\n');
    expect(cleanBody).toContain('<FirstLoadingScreens>\n      <Screen i="1" t="1"></Screen>\n    </FirstLoadingScreens>\n    <FirstLoadingScreens>\n      <Screen i="1" t="1"></Screen>\n    </FirstLoadingScreens>');
  });

  it('should return generated fallback XML for /Servers.aspx using config variables', async () => {
    const app = createTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/Servers.aspx'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/xml');
    
    const body = response.body;
    // Check that we have exactly <S> node with expected values including the compatibility attributes
    expect(body).toContain('<S id="1" ip="127.0.0.1" port="9339" webPort="8080" name="שרת שימור מקומי" percentage="0" status="1" chatMode="true" friends="0" />');
    // Ensure it does NOT use S0
    expect(body).not.toContain('<S0 ');
    expect(body).toContain('<Servers>');
  });

  it('should support variations of Servers.aspx like /Services/Servers.aspx', async () => {
    const app = createTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/Services/Servers.aspx'
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<S id="1" ip="127.0.0.1" port="9339" webPort="8080" name="שרת שימור מקומי" percentage="0" status="1" chatMode="true" friends="0" />');
  });

  describe('LoginU.aspx dynamic compatibility tests', () => {
    const salt = '1qscvhui9';

    it('should return valid outer XML and dynamic Login success inner XML for cmd=Login', async () => {
      const app = createTestApp();
      const query = 'cmd=Login&name=admin&pass=admin&t=0.987654';
      const mog = Buffer.from(query).toString('base64');
      const md = crypto.createHash('md5')
        .update(salt + 'mogo123' + mog + '123mogo' + salt)
        .digest('hex');

      const response = await app.inject({
        method: 'GET',
        url: `/Servises/LoginU.aspx?mog=${encodeURIComponent(mog)}&md=${md}`
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/xml');

      const match = response.body.match(/<mog>([\s\S]*?)<\/mog>/);
      expect(match).not.toBeNull();
      const responseMog = match ? match[1].trim() : '';
      const decodedInner = Buffer.from(responseMog, 'base64').toString('utf8');

      expect(decodedInner).toContain('cmd="Login"');
      expect(decodedInner).toContain('t="0.987654"');
      expect(decodedInner).toContain('<Login status="1" allow="true" isMember="true">');
      expect(decodedInner).toContain('<Screen i="1" t="1" />');

      const expectedResponseMd = crypto.createHash('md5')
        .update(salt + 'mogo123' + responseMog + '123mogo' + salt)
        .digest('hex');
      expect(response.body).toContain(`<md>${expectedResponseMd}</md>`);
    });

    it('should return valid server list inner XML for cmd=Servers', async () => {
      const app = createTestApp();
      const query = 'cmd=Servers&name=admin&pass=admin&t=0.123456';
      const mog = Buffer.from(query).toString('base64');
      const md = crypto.createHash('md5')
        .update(salt + 'mogo123' + mog + '123mogo' + salt)
        .digest('hex');

      const response = await app.inject({
        method: 'GET',
        url: `/Servises/LoginU.aspx?mog=${encodeURIComponent(mog)}&md=${md}`
      });

      expect(response.statusCode).toBe(200);

      const match = response.body.match(/<mog>([\s\S]*?)<\/mog>/);
      expect(match).not.toBeNull();
      const responseMog = match ? match[1].trim() : '';
      const decodedInner = Buffer.from(responseMog, 'base64').toString('utf8');

      expect(decodedInner).toContain('cmd="Servers"');
      expect(decodedInner).toContain('t="0.123456"');
      expect(decodedInner).toContain('<Server id="1" ip="127.0.0.1" port="9339" webPort="8080" name="שרת שימור מקומי" percentage="0" status="1" chatMode="true" friends="0" />');
    });

    it('should fall back to serving static file when query does not contain mog or md, and dynamic route should override it when present', async () => {
      const tempAssetsPath = path.join(__dirname, 'temp_test_assets_loginu');
      if (!fs.existsSync(tempAssetsPath)) {
        fs.mkdirSync(tempAssetsPath, { recursive: true });
      }
      const servicesDir = path.join(tempAssetsPath, 'Servises');
      if (!fs.existsSync(servicesDir)) {
        fs.mkdirSync(servicesDir, { recursive: true });
      }

      const staticFilePath = path.join(servicesDir, 'LoginU.aspx');
      const staticFileContent = '<mogobe><mog>PFJvb3Qgc3RhdHVzPSI0Ij48L1Jvb3Q+</mog><md>3B58DB065BA17CEE32A6261D373F318A</md></mogobe>';
      fs.writeFileSync(staticFilePath, staticFileContent, 'utf8');

      const customConfig: ServerConfig = {
        ...dummyConfig,
        assetsPath: tempAssetsPath
      };

      const app = fastify();
      registerLegacyEndpoints(app, customConfig);
      registerAssetsRoute(app, customConfig);

      // 1. Without mog/md query -> should return static asset
      const responseStatic = await app.inject({
        method: 'GET',
        url: '/Servises/LoginU.aspx'
      });
      expect(responseStatic.statusCode).toBe(200);
      expect(responseStatic.body).toBe(staticFileContent);

      // 2. With mog/md query -> should bypass static asset and return dynamic XML
      const query = 'cmd=Login&name=admin&pass=admin&t=0.111111';
      const mog = Buffer.from(query).toString('base64');
      const md = crypto.createHash('md5')
        .update(salt + 'mogo123' + mog + '123mogo' + salt)
        .digest('hex');

      const responseDynamic = await app.inject({
        method: 'GET',
        url: `/Servises/LoginU.aspx?mog=${encodeURIComponent(mog)}&md=${md}`
      });
      expect(responseDynamic.statusCode).toBe(200);
      expect(responseDynamic.body).not.toBe(staticFileContent);
      expect(responseDynamic.body).toContain('<mogobe>');

      const match = responseDynamic.body.match(/<mog>([\s\S]*?)<\/mog>/);
      expect(match).not.toBeNull();
      const responseMog = match ? match[1].trim() : '';
      const decodedInner = Buffer.from(responseMog, 'base64').toString('utf8');
      expect(decodedInner).toContain('t="0.111111"');

      // Cleanup
      fs.unlinkSync(staticFilePath);
      fs.rmdirSync(servicesDir);
      fs.rmdirSync(tempAssetsPath);
    });

    it('should intercept double-slashed / normalized requests (e.g. //Servises/LoginU.aspx) with query parameters in assets route and return dynamic XML, bypassing static file', async () => {
      const tempAssetsPath = path.join(__dirname, 'temp_test_assets_loginu_double');
      if (!fs.existsSync(tempAssetsPath)) {
        fs.mkdirSync(tempAssetsPath, { recursive: true });
      }
      const servicesDir = path.join(tempAssetsPath, 'Servises');
      if (!fs.existsSync(servicesDir)) {
        fs.mkdirSync(servicesDir, { recursive: true });
      }

      const staticFilePath = path.join(servicesDir, 'LoginU.aspx');
      const staticFileContent = '<mogobe><mog>PFJvb3Qgc3RhdHVzPSI0Ij48L1Jvb3Q+</mog><md>3B58DB065BA17CEE32A6261D373F318A</md></mogobe>';
      fs.writeFileSync(staticFilePath, staticFileContent, 'utf8');

      const customConfig: ServerConfig = {
        ...dummyConfig,
        assetsPath: tempAssetsPath
      };

      const app = fastify();
      registerLegacyEndpoints(app, customConfig);
      registerAssetsRoute(app, customConfig);

      // 1. Verify dynamic handler wins for double slashed url with query parameters
      const query = 'cmd=Servers&name=admin&pass=admin&t=0.222222';
      const mog = Buffer.from(query).toString('base64');
      const md = crypto.createHash('md5')
        .update(salt + 'mogo123' + mog + '123mogo' + salt)
        .digest('hex');

      const responseDynamic = await app.inject({
        method: 'GET',
        url: `//Servises/LoginU.aspx?mog=${encodeURIComponent(mog)}&md=${md}`
      });

      expect(responseDynamic.statusCode).toBe(200);
      expect(responseDynamic.headers['content-type']).toContain('text/xml');
      expect(responseDynamic.body).not.toBe(staticFileContent);
      expect(responseDynamic.body).toContain('<mogobe>');

      const match = responseDynamic.body.match(/<mog>([\s\S]*?)<\/mog>/);
      expect(match).not.toBeNull();
      const responseMog = match ? match[1].trim() : '';
      const decodedInner = Buffer.from(responseMog, 'base64').toString('utf8');
      expect(decodedInner).toContain('cmd="Servers"');
      expect(decodedInner).toContain('t="0.222222"');

      // Cleanup
      fs.unlinkSync(staticFilePath);
      fs.rmdirSync(servicesDir);
      fs.rmdirSync(tempAssetsPath);
    });

    it('should parse host header localhost:8080 and produce ip="localhost" and webPort="8080" in Servers.aspx', async () => {
      const app = fastify();
      registerLegacyEndpoints(app, dummyConfig);

      const response = await app.inject({
        method: 'GET',
        url: '/Servers.aspx',
        headers: {
          host: 'localhost:8080'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('ip="localhost"');
      expect(response.body).toContain('webPort="8080"');
    });

    it('should parse host header 127.0.0.1:9090 and produce ip="127.0.0.1" and webPort="9090" in LoginU.aspx cmd=Servers', async () => {
      const app = fastify();
      registerLegacyEndpoints(app, dummyConfig);

      const query = 'cmd=Servers&name=admin&pass=admin&t=0.555555';
      const mog = Buffer.from(query).toString('base64');
      const md = crypto.createHash('md5')
        .update(salt + 'mogo123' + mog + '123mogo' + salt)
        .digest('hex');

      const response = await app.inject({
        method: 'GET',
        url: `/LoginU.aspx?mog=${encodeURIComponent(mog)}&md=${md}`,
        headers: {
          host: '127.0.0.1:9090'
        }
      });

      expect(response.statusCode).toBe(200);
      const match = response.body.match(/<mog>([\s\S]*?)<\/mog>/);
      expect(match).not.toBeNull();
      const responseMog = match ? match[1].trim() : '';
      const decodedInner = Buffer.from(responseMog, 'base64').toString('utf8');
      
      expect(decodedInner).toContain('ip="127.0.0.1"');
      expect(decodedInner).toContain('webPort="9090"');
    });

    it('returns the dynamic local server XML for localhost', async () => {
      const app = fastify();
      registerLegacyEndpoints(app, dummyConfig);

      const query = 'cmd=Servers&name=user&pass=pass&t=123';
      const mog = Buffer.from(query).toString('base64');
      const md = crypto.createHash('md5')
        .update(salt + 'mogo123' + mog + '123mogo' + salt)
        .digest('hex');

      const response = await app.inject({
        method: 'GET',
        url: `/LoginU.aspx?mog=${encodeURIComponent(mog)}&md=${md}`,
        headers: {
          host: 'localhost:8080'
        }
      });

      expect(response.statusCode).toBe(200);
      const match = response.body.match(/<mog>([\s\S]*?)<\/mog>/);
      expect(match).not.toBeNull();
      const responseMog = match ? match[1].trim() : '';
      const decodedInner = Buffer.from(responseMog, 'base64').toString('utf8');

      expect(decodedInner).toContain('<Server id="1" ip="localhost" port="9339" webPort="8080"');
    });
  });
});
