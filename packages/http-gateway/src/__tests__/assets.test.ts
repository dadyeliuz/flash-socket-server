import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fastify from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ServerConfig } from '@flash-socket-server/core';
import { registerAssetsRoute } from '../routes/assets';

describe('HTTP Gateway Assets Transform', () => {
  const testAssetsDir = path.resolve(__dirname, 'temp_test_assets');
  const langDir = path.join(testAssetsDir, 'Xmls', 'lang');
  
  const configWithTransform: ServerConfig = {
    httpPort: 8080,
    socketPort: 9339,
    policyPort: 843,
    assetsPath: testAssetsDir,
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

  const configWithoutTransform: ServerConfig = {
    ...configWithTransform,
    compatFixLanguageXml: false
  };

  beforeAll(() => {
    // Create folders
    fs.mkdirSync(langDir, { recursive: true });
    
    // Write test file in lang folder
    fs.writeFileSync(
      path.join(langDir, 'test_hebrew.xml'),
      '<?xml version="1.0" encoding="utf-8"?>\n<script src="bad"></script>\n<!-- END WAYBACK TOOLBAR INSERT --><Root>\n  <Msg>Hello <br> world <br > space <BR> upper <br/> test <br /> ending </br> check <br class="x"></Msg>\n</Root><!--',
      'utf8'
    );

    // Write test file outside lang folder (e.g. Swf folder)
    const swfDir = path.join(testAssetsDir, 'Swf');
    fs.mkdirSync(swfDir, { recursive: true });
    fs.writeFileSync(
      path.join(swfDir, 'test_outside.xml'),
      '<?xml version="1.0" encoding="utf-8"?>\n<script src="bad"></script>\n<!-- END WAYBACK TOOLBAR INSERT --><Root>\n  <Msg>Hello <br> world <br > space <BR> upper <br/> test <br /> ending </br> check <br class="x"></Msg>\n</Root><!--',
      'utf8'
    );

    // Write mock login graphic files for alias test
    const assetsSwfDir = path.join(swfDir, 'Assets');
    fs.mkdirSync(assetsSwfDir, { recursive: true });
    fs.writeFileSync(path.join(assetsSwfDir, 'loginGR.swf'), 'real loginGR');
    fs.writeFileSync(path.join(assetsSwfDir, 'BaseLoginGR.swf'), 'compat BaseLoginGR');
    fs.writeFileSync(path.join(assetsSwfDir, 'ControlPanel.swf'), Buffer.from('mock-controlpanel-swf'));
    fs.writeFileSync(path.join(assetsSwfDir, 'ControlPanel-old.swf'), Buffer.from('mock-controlpanel-old-swf'));
    fs.writeFileSync(path.join(assetsSwfDir, 'ControlPanelPetSM.swf'), Buffer.from('mock-controlpanel-petsm-swf'));

    // Write mock chat XMLs for fallback tests
    fs.writeFileSync(
      path.join(langDir, 'chat_4.xml'),
      '<?xml version="1.0" encoding="utf-8"?><Lang><chat><m id="1">English Chat</m></chat></Lang>',
      'utf8'
    );
    fs.writeFileSync(
      path.join(langDir, 'chat_1.xml'),
      '<?xml version="1.0" encoding="utf-8"?><Lang><chat><m id="1">Hebrew Chat</m></chat></Lang>',
      'utf8'
    );

    // Write mock lang files for fallback tests
    const servicesDir = path.join(testAssetsDir, 'Servises');
    fs.mkdirSync(servicesDir, { recursive: true });
    fs.writeFileSync(
      path.join(servicesDir, 'lang.aspx%3flang%3d4'),
      '<?xml version="1.0" encoding="utf-8"?><Root><Lang>English Lang</Lang></Root>',
      'utf8'
    );
    fs.writeFileSync(
      path.join(servicesDir, 'lang.aspx%3flang%3d1'),
      '<?xml version="1.0" encoding="utf-8"?><Lang><Sections><Section name="Buttons"><M id="1" msg="\u05d0ישור" /><M id="2" msg="\u05d1יטול" /></Section><Section name="Login"><M id="1" msg="\u05dbניסה" /></Section></Sections></Lang>',
      'utf8'
    );

    // Write mock sound files for Ruffle Sound.load compatibility tests.
    const soundMovesDir = path.join(testAssetsDir, 'Sound', 'moves');
    const soundTempoDir = path.join(testAssetsDir, 'Sound', 'Tempo');
    const roomsDir = path.join(testAssetsDir, 'Swf', 'AssetsClean', 'Rooms');
    const controlPanelDir = path.join(testAssetsDir, 'Swf', 'AssetsClean', 'ControlPanel');
    const controlPanelEffectsDir = path.join(controlPanelDir, 'Effects');
    fs.mkdirSync(soundMovesDir, { recursive: true });
    fs.mkdirSync(soundTempoDir, { recursive: true });
    fs.mkdirSync(roomsDir, { recursive: true });
    fs.mkdirSync(controlPanelEffectsDir, { recursive: true });
    fs.writeFileSync(path.join(soundMovesDir, 'Clap.mp3'), Buffer.from('mock-clap-mp3'));
    fs.writeFileSync(path.join(soundTempoDir, 'NesherMalt1.mp3'), Buffer.from('mock-tempo-mp3'));
    fs.writeFileSync(path.join(testAssetsDir, 'Sound', 'mcCabin.mp3'), Buffer.from('mock-cabin-mp3'));
    fs.writeFileSync(path.join(controlPanelDir, 'controlPanel.txt'), '{"effects":[{"name":"Hearts"}]}', 'utf8');
    fs.writeFileSync(path.join(controlPanelEffectsDir, 'btnHearts.swf'), Buffer.from('mock-btn-hearts'));
    fs.writeFileSync(
      path.join(roomsDir, 'room_60.txt'),
      JSON.stringify({ shopIcon: ['mcCabin'], movSound: ['mcCabin'], mov: ['mcDoor'] }),
      'utf8'
    );
  });

  afterAll(() => {
    // Cleanup files and folders
    if (fs.existsSync(testAssetsDir)) {
      fs.rmSync(testAssetsDir, { recursive: true, force: true });
    }
  });

  const createTestApp = (config: ServerConfig) => {
    const app = fastify();
    // Simulate our request normalization hook (onRequest)
    app.addHook('onRequest', async (request, reply) => {
      const rawUrl = request.raw.url || '';
      const qIndex = rawUrl.indexOf('?');
      const pathPart = qIndex >= 0 ? rawUrl.substring(0, qIndex) : rawUrl;
      const queryPart = qIndex >= 0 ? rawUrl.substring(qIndex) : '';
      
      const normalizedPath = pathPart.replace(/\/+/g, '/');
      if (normalizedPath !== pathPart) {
        request.raw.url = normalizedPath + queryPart;
      }
    });

    registerAssetsRoute(app, config);
    return app;
  };

  it('should transform <br>, <br >, <BR>, <br class="x"> inside Xmls/lang/ but preserve valid ones, close comments, and strip wayback toolbar', async () => {
    const app = createTestApp(configWithTransform);
    const response = await app.inject({
      method: 'GET',
      url: '/Xmls/lang/test_hebrew.xml'
    });

    expect(response.statusCode).toBe(200);
    const body = response.body;
    
    // Check wayback toolbar removed
    expect(body).not.toContain('<script src="bad">');
    expect(body).not.toContain('<!-- END WAYBACK TOOLBAR INSERT -->');
    expect(body.startsWith('<?xml')).toBe(true);

    // Check conversions
    expect(body).toContain('<br/> world'); // <br> should become <br/>
    expect(body).toContain('<br /> space'); // <br > should become <br />
    expect(body).toContain('<br/> upper'); // <BR> should become <br/>
    expect(body).toContain('<br class="x"/>'); // <br class="x"> should become <br class="x"/>
    
    // Preservations
    expect(body).toContain('<br/> test'); // original <br/> should stay unchanged
    expect(body).toContain('<br /> ending'); // original <br /> should stay unchanged
    expect(body).toContain('</br> check'); // original </br> should stay unchanged

    // Check closed comment
    expect(body.endsWith('-->')).toBe(true);
  });

  it('should NOT apply transform if compatFixLanguageXml is false', async () => {
    const app = createTestApp(configWithoutTransform);
    const response = await app.inject({
      method: 'GET',
      url: '/Xmls/lang/test_hebrew.xml'
    });

    expect(response.statusCode).toBe(200);
    const body = response.body;
    
    // Everything should remain untouched
    expect(body).toContain('<br> world');
    expect(body).toContain('<br class="x">');
    expect(body).toContain('<script src="bad">');
    expect(body).toContain('<!-- END WAYBACK TOOLBAR INSERT -->');
  });

  it('should NOT apply transform to files outside Xmls/lang/', async () => {
    const app = createTestApp(configWithTransform);
    const response = await app.inject({
      method: 'GET',
      url: '/Swf/test_outside.xml'
    });

    expect(response.statusCode).toBe(200);
    const body = response.body;
    
    // Outside files should remain untouched
    expect(body).toContain('<br> world');
    expect(body).toContain('<br class="x">');
    expect(body).toContain('<script src="bad">');
    expect(body).toContain('<!-- END WAYBACK TOOLBAR INSERT -->');
  });

  it('should handle request path with consecutive slashes successfully', async () => {
    const app = createTestApp(configWithTransform);
    const response = await app.inject({
      method: 'GET',
      url: '//Xmls/lang/test_hebrew.xml'
    });

    expect(response.statusCode).toBe(200);
    const body = response.body;
    expect(body).toContain('<br/>');
  });

  it('should serve real loginGR.swf when compatLoginGraphicsAlias is disabled', async () => {
    const app = createTestApp(configWithTransform);
    const response = await app.inject({
      method: 'GET',
      url: '/Swf/Assets/loginGR.swf'
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('real loginGR');
  });

  it('should serve BaseLoginGR.swf when compatLoginGraphicsAlias is enabled', async () => {
    const configWithAlias: ServerConfig = {
      ...configWithTransform,
      compatLoginGraphicsAlias: 'BaseLoginGR.swf'
    };
    const app = createTestApp(configWithAlias);
    const response = await app.inject({
      method: 'GET',
      url: '/Swf/Assets/loginGR.swf'
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('compat BaseLoginGR');
  });

  it('should refuse to apply unsafe compatibility alias with directory traversal', async () => {
    const configWithUnsafeAlias: ServerConfig = {
      ...configWithTransform,
      compatLoginGraphicsAlias: '../../package.json'
    };
    const app = createTestApp(configWithUnsafeAlias);
    const response = await app.inject({
      method: 'GET',
      url: '/Swf/Assets/loginGR.swf'
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('real loginGR');
  });

  describe('Language and Chat ID 0 Compatibility Fallback', () => {
    it('lang.aspx?lang=0 serves lang=4 asset when lang=0 is missing', async () => {
      const app = createTestApp(configWithTransform);
      const response = await app.inject({
        method: 'GET',
        url: '/Servises/lang.aspx?lang=0'
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/xml');
      expect(response.body).toContain('English Lang');
    });

    it('chat_0.xml serves chat_4.xml when chat_0 is missing', async () => {
      const app = createTestApp(configWithTransform);
      const response = await app.inject({
        method: 'GET',
        url: '/Xmls/lang/chat_0.xml'
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/xml');
      expect(response.body).toContain('English Chat');
    });

    it('if lang 4 is missing, fallback to lang 1', async () => {
      const lang4Path = path.join(testAssetsDir, 'Servises', 'lang.aspx%3flang%3d4');
      fs.renameSync(lang4Path, lang4Path + '.bak');

      try {
        const app = createTestApp(configWithTransform);
        const response = await app.inject({
          method: 'GET',
          url: '/Servises/lang.aspx?lang=0'
        });
        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toContain('text/xml');
        expect(response.body).toContain('name="Login"'); // lang=1 mock has Login section
      } finally {
        fs.renameSync(lang4Path + '.bak', lang4Path);
      }
    });

    it('if chat 4 is missing, fallback to chat 1', async () => {
      const chat4Path = path.join(langDir, 'chat_4.xml');
      fs.renameSync(chat4Path, chat4Path + '.bak');

      try {
        const app = createTestApp(configWithTransform);
        const response = await app.inject({
          method: 'GET',
          url: '/Xmls/lang/chat_0.xml'
        });
        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toContain('text/xml');
        expect(response.body).toContain('Hebrew Chat');
      } finally {
        fs.renameSync(chat4Path + '.bak', chat4Path);
      }
    });

    it('if all are missing, returns minimal XML for both instead of 404', async () => {
      const lang4Path = path.join(testAssetsDir, 'Servises', 'lang.aspx%3flang%3d4');
      const lang1Path = path.join(testAssetsDir, 'Servises', 'lang.aspx%3flang%3d1');
      const chat4Path = path.join(langDir, 'chat_4.xml');
      const chat1Path = path.join(langDir, 'chat_1.xml');

      fs.renameSync(lang4Path, lang4Path + '.bak');
      fs.renameSync(lang1Path, lang1Path + '.bak');
      fs.renameSync(chat4Path, chat4Path + '.bak');
      fs.renameSync(chat1Path, chat1Path + '.bak');

      try {
        const app = createTestApp(configWithTransform);
        const responseLang = await app.inject({
          method: 'GET',
          url: '/Servises/lang.aspx?lang=0'
        });
        expect(responseLang.statusCode).toBe(200);
        expect(responseLang.headers['content-type']).toContain('text/xml');
        expect(responseLang.body).toBe('<?xml version="1.0" encoding="utf-8"?><Root></Root>');

        const responseChat = await app.inject({
          method: 'GET',
          url: '/Xmls/lang/chat_0.xml'
        });
        expect(responseChat.statusCode).toBe(200);
        expect(responseChat.headers['content-type']).toContain('text/xml');
        expect(responseChat.body).toBe('<?xml version="1.0" encoding="utf-8"?><Lang><chat></chat></Lang>');
      } finally {
        fs.renameSync(lang4Path + '.bak', lang4Path);
        fs.renameSync(lang1Path + '.bak', lang1Path);
        fs.renameSync(chat4Path + '.bak', chat4Path);
        fs.renameSync(chat1Path + '.bak', chat1Path);
      }
    });

    it('should immediately alias lang=0 to defaultLanguage (4) even if physical lang=0 file exists', async () => {
      // Write a fake lang=0 file
      const servicesDir = path.join(testAssetsDir, 'Servises');
      const fakeLang0Path = path.join(servicesDir, 'lang.aspx%3flang%3d0');
      fs.writeFileSync(fakeLang0Path, '<?xml version="1.0" encoding="utf-8"?><Root><Lang>Fake Lang 0</Lang></Root>', 'utf8');

      try {
        const app = createTestApp(configWithTransform);
        // Request lang=0
        const response0 = await app.inject({
          method: 'GET',
          url: '/Servises/lang.aspx?lang=0'
        });
        
        // Request lang=4
        const response4 = await app.inject({
          method: 'GET',
          url: '/Servises/lang.aspx?lang=4'
        });

        expect(response0.statusCode).toBe(200);
        expect(response0.headers['content-type']).toBe(response4.headers['content-type']);
        expect(response0.body).toBe(response4.body);
        expect(response0.body).toContain('English Lang'); // should NOT be 'Fake Lang 0'
      } finally {
        if (fs.existsSync(fakeLang0Path)) {
          fs.unlinkSync(fakeLang0Path);
        }
      }
    });

    it('should immediately alias chat_0.xml to defaultLanguage (chat_4.xml) even if physical chat_0.xml exists', async () => {
      // Write a fake chat_0.xml file
      const fakeChat0Path = path.join(langDir, 'chat_0.xml');
      fs.writeFileSync(fakeChat0Path, '<?xml version="1.0" encoding="utf-8"?><Lang><chat>Fake Chat 0</chat></Lang>', 'utf8');

      try {
        const app = createTestApp(configWithTransform);
        // Request chat_0.xml
        const response0 = await app.inject({
          method: 'GET',
          url: '/Xmls/lang/chat_0.xml'
        });
        
        // Request chat_4.xml
        const response4 = await app.inject({
          method: 'GET',
          url: '/Xmls/lang/chat_4.xml'
        });

        expect(response0.statusCode).toBe(200);
        expect(response0.headers['content-type']).toBe(response4.headers['content-type']);
        expect(response0.body).toBe(response4.body);
        expect(response0.body).toContain('English Chat'); // should NOT be 'Fake Chat 0'
      } finally {
        if (fs.existsSync(fakeChat0Path)) {
          fs.unlinkSync(fakeChat0Path);
        }
      }
    });

    it('should immediately alias lang=0 to defaultLanguage (1) when configured with Hebrew default', async () => {
      const configHebrew = {
        ...configWithTransform,
        defaultLanguage: 1
      };
      const app = createTestApp(configHebrew);
      const response = await app.inject({
        method: 'GET',
        url: '/Servises/lang.aspx?lang=0'
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/xml');
      expect(response.body).toContain('name="Login"'); // lang=1 mock has Login section
    });

    it('should immediately alias chat_0.xml to defaultLanguage (chat_1.xml) when configured with Hebrew default', async () => {
      const configHebrew = {
        ...configWithTransform,
        defaultLanguage: 1
      };
      const app = createTestApp(configHebrew);
      const response = await app.inject({
        method: 'GET',
        url: '/Xmls/lang/chat_0.xml'
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/xml');
      expect(response.body).toContain('Hebrew Chat');
    });

    it('should serve lang.aspx?lang=1 as strict UTF-8 with correct content-type', async () => {
      const app = createTestApp(configWithTransform);
      const response = await app.inject({
        method: 'GET',
        url: '/Servises/lang.aspx?lang=1'
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/xml; charset=utf-8');
      expect(response.body).toContain('name="Login"'); // lang=1 mock has Login section
    });
  });

  describe('Buttuns alias injection (getButtonAlt typo fix)', () => {
    it('should inject a Buttuns section alias copied from Buttons when serving lang.aspx with Buttons present', async () => {
      // The mock lang.aspx%3flang%3d1 has <Section name="Buttons"> but no <Section name="Buttuns">
      // The server transform must inject a Buttuns alias so that SWF getButtonAlt() finds it
      const configHebrew = { ...configWithTransform, defaultLanguage: 1 };
      const app = createTestApp(configHebrew);
      const response = await app.inject({
        method: 'GET',
        url: '/Servises/lang.aspx?lang=1'
      });
      expect(response.statusCode).toBe(200);
      const body = response.body;

      // Buttuns alias should be injected
      expect(body).toContain('name="Buttuns"');
      // Original Buttons should still be there
      expect(body).toContain('name="Buttons"');
      // Buttuns should contain the same M entries as Buttons
      expect(body).toContain('<Section name="Buttuns">');
      // Both M id=1 and id=2 should appear under Buttuns
      const buttunsIdx = body.indexOf('<Section name="Buttuns">');
      const buttunsEnd = body.indexOf('</Section>', buttunsIdx);
      const buttunsContent = body.slice(buttunsIdx, buttunsEnd);
      expect(buttunsContent).toContain('id="1"');
      expect(buttunsContent).toContain('id="2"');
    });

    it('should NOT double-inject Buttuns if it already exists in the source', async () => {
      // Write a file that already has Buttuns
      const servicesDir = path.join(testAssetsDir, 'Servises');
      const alreadyHasButtuns = '<?xml version="1.0" encoding="utf-8"?><Lang><Sections>' +
        '<Section name="Buttons"><M id="1" msg="\u05d0ישור" /></Section>' +
        '<Section name="Buttuns"><M id="1" msg="already" /></Section>' +
        '</Sections></Lang>';
      fs.writeFileSync(path.join(servicesDir, 'lang.aspx%3flang%3d9'), alreadyHasButtuns, 'utf8');
      try {
        const app = createTestApp(configWithTransform);
        const response = await app.inject({
          method: 'GET',
          url: '/Servises/lang.aspx?lang=9'
        });
        expect(response.statusCode).toBe(200);
        const body = response.body;
        // Count occurrences of Buttuns - should be exactly 1
        const matches = (body.match(/name="Buttuns"/g) || []).length;
        expect(matches).toBe(1);
        // Existing Buttuns content preserved
        expect(body).toContain('msg="already"');
      } finally {
        fs.unlinkSync(path.join(servicesDir, 'lang.aspx%3flang%3d9'));
      }
    });

    it('should NOT inject Buttuns when Buttons section is absent', async () => {
      // Write a file that has no Buttons section
      const servicesDir = path.join(testAssetsDir, 'Servises');
      const noButtons = '<?xml version="1.0" encoding="utf-8"?><Lang><Sections>' +
        '<Section name="Login"><M id="1" msg="test" /></Section>' +
        '</Sections></Lang>';
      fs.writeFileSync(path.join(servicesDir, 'lang.aspx%3flang%3d8'), noButtons, 'utf8');
      try {
        const app = createTestApp(configWithTransform);
        const response = await app.inject({
          method: 'GET',
          url: '/Servises/lang.aspx?lang=8'
        });
        expect(response.statusCode).toBe(200);
        const body = response.body;
        expect(body).not.toContain('name="Buttuns"');
        expect(body).not.toContain('name="Buttons"');
      } finally {
        fs.unlinkSync(path.join(servicesDir, 'lang.aspx%3flang%3d8'));
      }
    });
  });

  describe('Sound asset compatibility', () => {
    it('records ControlPanel effect config and button SWF asset diagnostics', async () => {
      const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
      ruffleDiagnosticsManager.clear();

      const app = createTestApp(configWithTransform);
      const configResponse = await app.inject({
        method: 'GET',
        url: '/Swf/AssetsClean/ControlPanel/controlPanel.txt?123'
      });
      const buttonResponse = await app.inject({
        method: 'GET',
        url: '/Swf/AssetsClean/ControlPanel/Effects/btnHearts.swf?123'
      });

      expect(configResponse.statusCode).toBe(200);
      expect(buttonResponse.statusCode).toBe(200);

      const report = ruffleDiagnosticsManager.getReport({});
      expect(report.controlPanelAssetDiagnostics).toMatchObject({
        controlPanelEffectConfigRequested: true,
        controlPanelEffectConfigServed: true
      });
      const diagnostics = report.controlPanelAssetDiagnostics as any;
      expect(diagnostics.controlPanelEffectButtonRequests).toContain('/Swf/AssetsClean/ControlPanel/Effects/btnHearts.swf');
      expect(diagnostics.controlPanelEffectButtonServed).toContain('/Swf/AssetsClean/ControlPanel/Effects/btnHearts.swf');
      expect(diagnostics.controlPanelEffectButtonMissing).not.toContain('/Swf/AssetsClean/ControlPanel/Effects/btnHearts.swf');
      expect(diagnostics.controlPanelTxtParsed).toBe(true);
      expect(diagnostics.controlPanelTxtEffectNames).toEqual(['Hearts']);
      expect(diagnostics.controlPanelTxtExpectedButtonUrls).toContain('/Swf/AssetsClean/ControlPanel/Effects/btnHearts.swf');
      expect(diagnostics.controlPanelTxtExpectedLinkageNames).toContain('btnHearts');
      expect(diagnostics.controlPanelTxtMissingButtonFiles).toEqual([]);
      expect(diagnostics.controlPanelTxtFieldsSeen).toContain('effects');
    });

    it('records active ControlPanel SWF hash diagnostics and candidate hashes', async () => {
      const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
      ruffleDiagnosticsManager.clear();

      const app = createTestApp(configWithTransform);
      const response = await app.inject({
        method: 'GET',
        url: '/Swf/Assets/ControlPanel.swf'
      });

      expect(response.statusCode).toBe(200);
      const report = ruffleDiagnosticsManager.getReport({});
      const diagnostics = report.controlPanelAssetDiagnostics as any;
      const expectedHash = crypto.createHash('sha256').update(Buffer.from('mock-controlpanel-swf')).digest('hex');
      expect(diagnostics.controlPanelSwfRequestedUrl).toBe('/Swf/Assets/ControlPanel.swf');
      expect(diagnostics.controlPanelSwfResolvedPath.replace(/\\/g, '/')).toBe('Swf/Assets/ControlPanel.swf');
      expect(diagnostics.controlPanelSwfServed).toBe(true);
      expect(diagnostics.controlPanelSwfHash).toBe(expectedHash);
      expect(diagnostics.controlPanelSwfCandidateHashes['Swf/Assets/ControlPanel.swf']).toBe(expectedHash);
      expect(diagnostics.controlPanelSwfCandidateHashes['Swf/Assets/ControlPanel-old.swf']).toBeTruthy();
      expect(diagnostics.controlPanelSwfCandidateHashes['Swf/Assets/ControlPanelPetSM.swf']).toBeTruthy();
    });

    it('bridges mismatched ControlPanel config and effect button request families to AssetsClean files', async () => {
      const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
      ruffleDiagnosticsManager.clear();

      const app = createTestApp(configWithTransform);
      const configResponse = await app.inject({
        method: 'GET',
        url: '/Swf/Assets/ControlPanel/controlPanel.txt?cache=1'
      });
      const buttonResponse = await app.inject({
        method: 'GET',
        url: '/Swf/Assets/ControlPanel/Effects/btnHearts.swf?cache=1'
      });

      expect(configResponse.statusCode).toBe(200);
      expect(buttonResponse.statusCode).toBe(200);

      const report = ruffleDiagnosticsManager.getReport({});
      const diagnostics = report.controlPanelAssetDiagnostics as any;
      expect(diagnostics.controlPanelAssetBridgeApplied).toBe(true);
      expect(diagnostics.controlPanelAssetVersionMismatchLikely).toBe(true);
      expect(diagnostics.controlPanelEffectConfigRequested).toBe(true);
      expect(diagnostics.controlPanelEffectConfigServed).toBe(true);
      expect(diagnostics.controlPanelEffectConfigResolvedPath.replace(/\\/g, '/')).toBe('Swf/AssetsClean/ControlPanel/controlPanel.txt');
      expect(diagnostics.controlPanelEffectButtonRequests).toContain('/Swf/Assets/ControlPanel/Effects/btnHearts.swf');
      expect(diagnostics.controlPanelEffectButtonServed).toContain('/Swf/Assets/ControlPanel/Effects/btnHearts.swf');
      expect(diagnostics.controlPanelResolvedConfigPath).toBe('Swf/AssetsClean/ControlPanel/controlPanel.txt');
      expect(diagnostics.controlPanelResolvedEffectsDir).toBe('Swf/AssetsClean/ControlPanel/Effects');
    });

    it('serves duplicated Sound/Sound MP3 requests from the canonical Sound folder', async () => {
      const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
      ruffleDiagnosticsManager.clear();

      const app = createTestApp(configWithTransform);
      const response = await app.inject({
        method: 'GET',
        url: '/Sound/Sound/moves/Clap.mp3'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('audio/mpeg');
      expect(response.headers['accept-ranges']).toBe('bytes');
      expect(response.headers['content-length']).toBe(String(Buffer.byteLength('mock-clap-mp3')));

      const report = ruffleDiagnosticsManager.getReport({});
      const assetDiagnostics = report.visualDiagnostics as any;
      expect(assetDiagnostics.soundRequests).toContain('/Sound/Sound/moves/Clap.mp3');
      expect(assetDiagnostics.soundServed).toContain('/Sound/Sound/moves/Clap.mp3');
      expect(assetDiagnostics.soundResolvedPath['/Sound/Sound/moves/Clap.mp3'].replace(/\\/g, '/')).toBe('Sound/moves/Clap.mp3');
      expect(assetDiagnostics.soundContentType['/Sound/Sound/moves/Clap.mp3']).toBe('audio/mpeg');
      expect(assetDiagnostics.soundLoadSuccessSeen).toBe(true);
      expect(assetDiagnostics.missingMp3Requests).not.toContain('/Sound/Sound/moves/Clap.mp3');
    });

    it('resolves sound paths case-insensitively', async () => {
      const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
      ruffleDiagnosticsManager.clear();

      const app = createTestApp(configWithTransform);
      const response = await app.inject({
        method: 'GET',
        url: '/sound/sound/MOVES/clap.mp3'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('audio/mpeg');

      const report = ruffleDiagnosticsManager.getReport({});
      const assetDiagnostics = report.visualDiagnostics as any;
      expect(assetDiagnostics.soundResolvedPath['/sound/sound/MOVES/clap.mp3'].replace(/\\/g, '/')).toBe('Sound/moves/Clap.mp3');
    });

    it('supports byte ranges for MP3 requests', async () => {
      const app = createTestApp(configWithTransform);
      const response = await app.inject({
        method: 'GET',
        url: '/Sound/Sound/Tempo/NesherMalt1.mp3',
        headers: {
          range: 'bytes=0-3'
        }
      });

      expect(response.statusCode).toBe(206);
      expect(response.headers['content-type']).toContain('audio/mpeg');
      expect(response.headers['accept-ranges']).toBe('bytes');
      expect(response.headers['content-range']).toBe(`bytes 0-3/${Buffer.byteLength('mock-tempo-mp3')}`);
      expect(response.headers['content-length']).toBe('4');
      expect(response.rawPayload.toString()).toBe('mock');
    });

    it('aliases /Sound/Rooms/*.mp3 requests to existing /Sound/*.mp3 assets for room back-sound compatibility', async () => {
      const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
      ruffleDiagnosticsManager.clear();

      const app = createTestApp(configWithTransform);
      const response = await app.inject({
        method: 'GET',
        url: '/Sound/Rooms/mcCabin.mp3'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('audio/mpeg');

      const report = ruffleDiagnosticsManager.getReport({});
      const assetDiagnostics = report.visualDiagnostics as any;
      expect(assetDiagnostics.soundRequests).toContain('/Sound/Rooms/mcCabin.mp3');
      expect(assetDiagnostics.soundServed).toContain('/Sound/Rooms/mcCabin.mp3');
      expect(assetDiagnostics.soundResolvedPath['/Sound/Rooms/mcCabin.mp3'].replace(/\\/g, '/')).toBe('Sound/mcCabin.mp3');
    });

    it('records missing MP3 requests in sound diagnostics', async () => {
      const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
      ruffleDiagnosticsManager.clear();

      const app = createTestApp(configWithTransform);
      const response = await app.inject({
        method: 'GET',
        url: '/Sound/Sound/moves/Missing.mp3'
      });

      expect(response.statusCode).toBe(404);

      const report = ruffleDiagnosticsManager.getReport({});
      const assetDiagnostics = report.visualDiagnostics as any;
      expect(assetDiagnostics.soundRequests).toContain('/Sound/Sound/moves/Missing.mp3');
      expect(assetDiagnostics.soundMissing).toContain('/Sound/Sound/moves/Missing.mp3');
      expect(assetDiagnostics.missingMp3Requests).toContain('/Sound/Sound/moves/Missing.mp3');
      expect(assetDiagnostics.soundLoadErrorSeen).toBe(true);
    });

    it('records passive room movSound configuration and correlates the expected MP3 request', async () => {
      const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
      ruffleDiagnosticsManager.clear();

      const app = createTestApp(configWithTransform);
      const txtResponse = await app.inject({
        method: 'GET',
        url: '/Swf/AssetsClean/Rooms/room_60.txt'
      });
      expect(txtResponse.statusCode).toBe(200);

      const soundResponse = await app.inject({
        method: 'GET',
        url: '/Sound/mcCabin.mp3'
      });
      expect(soundResponse.statusCode).toBe(200);

      const report = ruffleDiagnosticsManager.getReport({});
      const assetDiagnostics = report.visualDiagnostics as any;
      expect(assetDiagnostics.roomSoundConfigField).toBe('movSound');
      expect(assetDiagnostics.roomSoundConfigValue).toEqual(['mcCabin']);
      expect(assetDiagnostics.roomSoundExpectedUrl).toBe('/Sound/mcCabin.mp3');
      expect(assetDiagnostics.roomSoundRequested).toBe(true);
      expect(assetDiagnostics.roomSoundServed).toBe(true);
      expect(assetDiagnostics.roomSoundLoadError).toBe(false);
      expect(assetDiagnostics.roomSoundLoopRequested).toBe(1);
      expect(assetDiagnostics.lastRoomSoundRoomName).toBe('room_60');
    });

    it('records configured room back-sound diagnostics separately from movSound', async () => {
      const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
      ruffleDiagnosticsManager.clear();
      ruffleDiagnosticsManager.recordRoomBackSoundVarSent(
        'room_60',
        'http://localhost:8080/Sound/mcCabin.mp3',
        'http://localhost:8080/Sound/mcCabin.mp3',
        '/Sound/mcCabin.mp3'
      );

      const app = createTestApp(configWithTransform);
      const soundResponse = await app.inject({
        method: 'GET',
        url: '/Sound/mcCabin.mp3'
      });
      expect(soundResponse.statusCode).toBe(200);

      const report = ruffleDiagnosticsManager.getReport({});
      const assetDiagnostics = report.visualDiagnostics as any;
      expect(assetDiagnostics.roomBackSoundVarSent).toBe(true);
      expect(assetDiagnostics.roomBackSoundVarValue).toBe('http://localhost:8080/Sound/mcCabin.mp3');
      expect(assetDiagnostics.roomBackSoundExpectedUrl).toBe('http://localhost:8080/Sound/mcCabin.mp3');
      expect(assetDiagnostics.roomBackSoundExpectedRequestUrl).toBe('/Sound/mcCabin.mp3');
      expect(assetDiagnostics.roomBackSoundRequested).toBe(true);
      expect(assetDiagnostics.roomBackSoundServed).toBe(true);
      expect(assetDiagnostics.roomBackSoundLoadError).toBe(false);
      expect(assetDiagnostics.roomBackSoundPlayAttemptSeen).toBe(false);
      expect(assetDiagnostics.roomBackSoundStarted).toBe(false);
      expect(assetDiagnostics.roomBackSoundRequestSeen).toBe(true);
      expect(assetDiagnostics.roomBackSoundActualRequestUrl).toBe('/Sound/mcCabin.mp3');
      expect(assetDiagnostics.roomBackSoundPlayCalled).toBe(false);
      expect(assetDiagnostics.roomBackSoundChannelNonNull).toBe(false);
      expect(assetDiagnostics.roomBackSoundAudibleLikely).toBe(false);
      expect(assetDiagnostics.roomBackSoundLoop).toBe(true);
      expect(assetDiagnostics.lastRoomBackSoundRoomName).toBe('room_60');
    });
  });

  describe('LoadingScreen TLF text compatibility transform', () => {
    const servicesDir = path.join(testAssetsDir, 'Servises');
    const lang1Path = path.join(servicesDir, 'lang.aspx%3flang%3d1');
    const tlfMsg = '&lt;?xml version=&quot;1.0&quot; encoding=&quot;utf-8&quot;?&gt;&#xD;&#xA;' +
      '&lt;flow:TextFlow whiteSpaceCollapse=&quot;preserve&quot; xmlns:flow=&quot;http://ns.adobe.com/textLayout/2008&quot;&gt;' +
      '&lt;flow:p direction=&quot;rtl&quot; textAlign=&quot;center&quot;&gt;' +
      '&lt;flow:span fontFamily=&quot;Arial&quot; fontSize=&quot;28&quot;&gt;Test loading message one&lt;/flow:span&gt;' +
      '&lt;/flow:p&gt;&lt;flow:p direction=&quot;rtl&quot; textAlign=&quot;center&quot;&gt;' +
      '&lt;flow:span fontFamily=&quot;Arial&quot; fontSize=&quot;28&quot;&gt;Test loading message two&lt;/flow:span&gt;' +
      '&lt;/flow:p&gt;&lt;flow:p direction=&quot;rtl&quot; textAlign=&quot;center&quot;&gt;' +
      '&lt;flow:span fontFamily=&quot;Arial&quot; fontSize=&quot;28&quot;&gt;Test loading message three&lt;/flow:span&gt;' +
      '&lt;/flow:p&gt;&lt;/flow:TextFlow&gt;';
    const langWithLoadingScreen = `<?xml version="1.0" encoding="utf-8"?><Lang><Sections><Section name="LoadingScreen"><M id="1" msg="${tlfMsg}" /><M id="2" msg="unchanged" /></Section><Section name="Buttons"><M id="1" msg="אישור" /></Section></Sections></Lang>`;

    async function withTemporaryLang1<T>(fn: () => Promise<T>): Promise<T> {
      const previous = fs.readFileSync(lang1Path, 'utf8');
      fs.writeFileSync(lang1Path, langWithLoadingScreen, 'utf8');
      try {
        return await fn();
      } finally {
        fs.writeFileSync(lang1Path, previous, 'utf8');
      }
    }

    it('plain mode strips TLF markup and preserves original loading-screen text', async () => {
      await withTemporaryLang1(async () => {
        const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
        ruffleDiagnosticsManager.clear();
        const app = createTestApp({
          ...configWithTransform,
          defaultLanguage: 1,
          compatLoadingScreenTextMode: 'plain'
        });
        const response = await app.inject({
          method: 'GET',
          url: '/Servises/lang.aspx?lang=1'
        });

        expect(response.statusCode).toBe(200);
        expect(response.body).toContain('msg="Test loading message one&#10;Test loading message two&#10;Test loading message three"');
        expect(response.body).not.toContain('flow:TextFlow');
        expect(response.body).toContain('<M id="2" msg="unchanged" />');

        const report = ruffleDiagnosticsManager.getReport({});
        expect(report.compatLoadingScreenTextMode).toBe('plain');
        expect(report.compatLoadingScreenTextApplied).toBe(true);
        expect(report.compatLoadingScreenOriginalWasTlf).toBe(true);
        expect(report.compatLoadingScreenOriginalLength).toBeGreaterThan(100);
        expect(report.compatLoadingScreenExtractedPlainText).toBe('Test loading message one Test loading message two Test loading message three');
        expect(report.compatLoadingScreenReplacementLength).toBeGreaterThan(0);
        expect(report.loadingScreenCompatResolvedMessage).toBe('Test loading message one\nTest loading message two\nTest loading message three');
        expect(report.loadingScreenCompatResolvedMessageLength).toBeGreaterThan(0);
        expect(report.loadingScreenCompatResolvedMessagePreview).toContain('Test loading message one');
        expect(report.fontClassCreateTextLayoutInputKind).toBe('plain');
        expect(report.fontClassCreateTextLayoutInputLength).toBe(report.compatLoadingScreenReplacementLength);
      });
    });

    it('simple mode replaces TLF markup with a short fallback string', async () => {
      await withTemporaryLang1(async () => {
        const app = createTestApp({
          ...configWithTransform,
          defaultLanguage: 1,
          compatLoadingScreenTextMode: 'simple'
        });
        const response = await app.inject({
          method: 'GET',
          url: '/Servises/lang.aspx?lang=1'
        });

        expect(response.statusCode).toBe(200);
        expect(response.body).toContain('msg="טוען..."');
        expect(response.body).not.toContain('flow:TextFlow');

        const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
        const report = ruffleDiagnosticsManager.getReport({});
        expect(report.loadingScreenCompatResolvedMessage).toBe('טוען...');
        expect(report.fontClassCreateTextLayoutInputKind).toBe('plain');
      });
    });

    it('minimal-tlf mode serves a lightweight TextFlow wrapper with original text', async () => {
      await withTemporaryLang1(async () => {
        const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
        ruffleDiagnosticsManager.clear();
        const app = createTestApp({
          ...configWithTransform,
          defaultLanguage: 1,
          compatLoadingScreenTextMode: 'minimal-tlf'
        });
        const response = await app.inject({
          method: 'GET',
          url: '/Servises/lang.aspx?lang=1'
        });

        expect(response.statusCode).toBe(200);
        expect(response.body).toContain('&lt;flow:TextFlow xmlns:flow=&quot;http://ns.adobe.com/textLayout/2008&quot;&gt;');
        expect(response.body).toContain('&lt;flow:p direction=&quot;rtl&quot; textAlign=&quot;center&quot;&gt;');
        expect(response.body).toContain('Test loading message one');
        expect(response.body).toContain('Test loading message two');
        expect(response.body).toContain('Test loading message three');
        expect(response.body).not.toContain('whiteSpaceCollapse=&quot;preserve&quot;');

        const report = ruffleDiagnosticsManager.getReport({});
        expect(report.compatLoadingScreenTextMode).toBe('minimal-tlf');
        expect(report.compatLoadingScreenTextApplied).toBe(true);
        expect(report.compatLoadingScreenOriginalWasTlf).toBe(true);
        expect(report.compatLoadingScreenExtractedPlainText).toBe('Test loading message one Test loading message two Test loading message three');
        expect(report.loadingScreenCompatResolvedMessage).toContain('<flow:TextFlow');
        expect(report.loadingScreenCompatResolvedMessage).toContain('Test loading message one');
        expect(Number(report.compatLoadingScreenReplacementLength)).toBeLessThan(Number(report.compatLoadingScreenOriginalLength));
        expect(report.fontClassCreateTextLayoutInputKind).toBe('tlf');
        expect(report.loadingScreenInputModeActuallyUsed).toBe('tlf');
      });
    });

    it('empty mode replaces TLF markup with an empty string', async () => {
      await withTemporaryLang1(async () => {
        const app = createTestApp({
          ...configWithTransform,
          defaultLanguage: 1,
          compatLoadingScreenTextMode: 'empty'
        });
        const response = await app.inject({
          method: 'GET',
          url: '/Servises/lang.aspx?lang=1'
        });

        expect(response.statusCode).toBe(200);
        expect(response.body).toContain('msg=""');
        expect(response.body).not.toContain('flow:TextFlow');

        const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
        const report = ruffleDiagnosticsManager.getReport({});
        expect(report.loadingScreenCompatResolvedMessage).toBe('');
        expect(report.fontClassCreateTextLayoutInputKind).toBe('empty');
      });
    });

    it('off mode leaves the TLF markup unchanged', async () => {
      await withTemporaryLang1(async () => {
        const app = createTestApp({
          ...configWithTransform,
          defaultLanguage: 1,
          compatLoadingScreenTextMode: 'off'
        });
        const response = await app.inject({
          method: 'GET',
          url: '/Servises/lang.aspx?lang=1'
        });

        expect(response.statusCode).toBe(200);
        expect(response.body).toContain('flow:TextFlow');
        expect(response.body).toContain('fontSize=&quot;28&quot;');
      });
    });
  });

  describe('Ruffle Font Asset Request Diagnostics', () => {
    it('should record font source requests and whether they were served successfully', async () => {
      // Setup app with both ruffleFontSources configured from start
      const fontConfig: ServerConfig = {
        ...configWithTransform,
        ruffleFontSources: ['/Fonts/Spacerblack.swf', '/Fonts/NonExistentFont.swf']
      };

      // Create a dummy font file in the test assets directory to serve it
      const fontsDir = path.join(testAssetsDir, 'Fonts');
      fs.mkdirSync(fontsDir, { recursive: true });
      fs.writeFileSync(path.join(fontsDir, 'Spacerblack.swf'), 'dummy swf font');

      try {
        const app = createTestApp(fontConfig);

        // Clear diagnostics first
        const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
        ruffleDiagnosticsManager.clear();
        ruffleDiagnosticsManager.recordRuffleFontConfig(fontConfig.ruffleFontSources || [], {}, null);

        // Request a missing font (not in configured sources)
        const resMissing = await app.inject({
          method: 'GET',
          url: '/Fonts/MissingFont.swf'
        });
        expect(resMissing.statusCode).toBe(404);

        // Request the configured font source (which exists)
        const resServed = await app.inject({
          method: 'GET',
          url: '/Fonts/Spacerblack.swf'
        });
        expect(resServed.statusCode).toBe(200);
        expect(resServed.body).toBe('dummy swf font');

        // Request a configured font source that does NOT exist
        const resServedMissing = await app.inject({
          method: 'GET',
          url: '/Fonts/NonExistentFont.swf'
        });
        expect(resServedMissing.statusCode).toBe(404);

        // Verify report contents
        const report = ruffleDiagnosticsManager.getReport({});
        expect(report.fontSourceRequests).toContain('/Fonts/Spacerblack.swf');
        expect(report.fontSourceServed).toContain('/Fonts/Spacerblack.swf');
        expect(report.fontSourceRequests).toContain('/Fonts/NonExistentFont.swf');
        expect(report.fontSourceMissing).toContain('/Fonts/NonExistentFont.swf');
        
        // The one that wasn't configured should NOT be in fontSourceRequests
        expect(report.fontSourceRequests).not.toContain('/Fonts/MissingFont.swf');
      } finally {
        if (fs.existsSync(path.join(fontsDir, 'Spacerblack.swf'))) {
          fs.unlinkSync(path.join(fontsDir, 'Spacerblack.swf'));
        }
      }
    });
  });

  describe('RTL Text Workaround', () => {
    it('should wrap Hebrew text with RLE controls when enabled with RLE wrap mode', async () => {
      const rtlConfig: ServerConfig = {
        ...configWithTransform,
        rtlTextWorkaround: true,
        rtlWrapMode: 'RLE',
        rtlTransformScope: 'all'
      };

      const app = createTestApp(rtlConfig);
      const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
      ruffleDiagnosticsManager.clear();

      // Mocks has: <Section name="Buttons"><M id="1" msg="אישור" /><M id="2" msg="ביטול" /></Section>
      const response = await app.inject({
        method: 'GET',
        url: '/Servises/lang.aspx?lang=1'
      });

      expect(response.statusCode).toBe(200);
      const body = response.body;

      // Check that Hebrew text is wrapped: \u202Bאישור\u202C and \u202Bביטול\u202C
      expect(body).toContain('\u202B\u05d0ישור\u202C');
      expect(body).toContain('\u202B\u05d1יטול\u202C');

      // Check diagnostics
      const report = ruffleDiagnosticsManager.getReport({});
      expect(report.rtlTextWorkaroundEnabled).toBe(true);
      expect(report.rtlWrapMode).toBe('RLE');
      expect(report.rtlWrappedStringCount).toBeGreaterThan(0);
      expect(report.sampleRtlWrappedKeys).toContain('Buttons.1');
      expect(report.sampleRtlWrappedKeys).toContain('Buttons.2');
    });

    it('should wrap Hebrew text with RLM controls when enabled with RLM wrap mode', async () => {
      const rtlConfig: ServerConfig = {
        ...configWithTransform,
        rtlTextWorkaround: true,
        rtlWrapMode: 'RLM',
        rtlTransformScope: 'all'
      };

      const app = createTestApp(rtlConfig);
      const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
      ruffleDiagnosticsManager.clear();

      const response = await app.inject({
        method: 'GET',
        url: '/Servises/lang.aspx?lang=1'
      });

      expect(response.statusCode).toBe(200);
      const body = response.body;

      expect(body).toContain('\u200F\u05d0ישור\u200F');
      expect(body).toContain('\u200F\u05d1יטול\u200F');

      const report = ruffleDiagnosticsManager.getReport({});
      expect(report.rtlTextWorkaroundEnabled).toBe(true);
      expect(report.rtlWrapMode).toBe('RLM');
    });

    it('should NOT wrap Hebrew text when disabled', async () => {
      const rtlConfig: ServerConfig = {
        ...configWithTransform,
        rtlTextWorkaround: false
      };

      const app = createTestApp(rtlConfig);
      const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
      ruffleDiagnosticsManager.clear();

      const response = await app.inject({
        method: 'GET',
        url: '/Servises/lang.aspx?lang=1'
      });

      expect(response.statusCode).toBe(200);
      const body = response.body;

      // Hebrew text should NOT be wrapped
      expect(body).toContain('msg="\u05d0ישור"');
      expect(body).not.toContain('\u202B');

      const report = ruffleDiagnosticsManager.getReport({});
      expect(report.rtlTextWorkaroundEnabled).toBe(false);
      expect(report.rtlWrappedStringCount).toBe(0);
    });

    it('should only wrap text nodes inside nested XML and preserve markup', async () => {
      const rtlConfig: ServerConfig = {
        ...configWithTransform,
        rtlTextWorkaround: true,
        rtlWrapMode: 'RLE',
        rtlTransformScope: 'all'
      };
      
      const app = createTestApp(rtlConfig);
      const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
      ruffleDiagnosticsManager.clear();

      // Write a temp file with nested XML tag
      const servicesDir = path.join(testAssetsDir, 'Servises');
      const testNestedPath = path.join(servicesDir, 'lang.aspx%3flang%3d15');
      fs.writeFileSync(
        testNestedPath,
        '<?xml version="1.0" encoding="utf-8"?><Lang><Sections><Section name="Buttons"><M id="3" msg="&lt;flow:span&gt;\u05e9\u05dc\u05d5\u05dd&lt;/flow:span&gt;" /></Section></Sections></Lang>',
        'utf8'
      );

      try {
        const response = await app.inject({
          method: 'GET',
          url: '/Servises/lang.aspx?lang=15'
        });

        expect(response.statusCode).toBe(200);
        const body = response.body;
        // The nested tag &lt;flow:span&gt; should NOT be wrapped, but the Hebrew word \u05e9\u05dc\u05d5\u05dd (שלום) should be!
        expect(body).toContain('&lt;flow:span&gt;\u202B\u05e9\u05dc\u05d5\u05dd\u202C&lt;/flow:span&gt;');
      } finally {
        if (fs.existsSync(testNestedPath)) {
          fs.unlinkSync(testNestedPath);
        }
      }
    });
    it('should visually reverse Hebrew text when enabled with VISUAL_REVERSE mode', async () => {
      const rtlConfig: ServerConfig = {
        ...configWithTransform,
        rtlTextWorkaround: true,
        rtlWrapMode: 'VISUAL_REVERSE',
        rtlTransformScope: 'all'
      };

      const app = createTestApp(rtlConfig);
      const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
      ruffleDiagnosticsManager.clear();

      const response = await app.inject({
        method: 'GET',
        url: '/Servises/lang.aspx?lang=1'
      });

      expect(response.statusCode).toBe(200);
      const body = response.body;

      // Check that Hebrew text is reversed: "אישור" -> "רושיא"
      expect(body).toContain('\u05e8\u05d5\u05e9\u05d9\u05d0'); // רושיא
      expect(body).toContain('\u05dc\u05d5\u05d8\u05d9\u05d1'); // ביטול reversed to לוטיב

      // Check diagnostics
      const report = ruffleDiagnosticsManager.getReport({});
      expect(report.rtlTextWorkaroundEnabled).toBe(true);
      expect(report.rtlWrapMode).toBe('VISUAL_REVERSE');
      expect(report.rtlTextMode).toBe('visual-reverse');
      expect(report.rtlVisualReverseCount).toBeGreaterThan(0);
      const samples = report.sampleVisualReverseBeforeAfter as any;
      expect(samples).toBeDefined();
      expect(samples.length).toBeGreaterThan(0);
      expect(samples[0].key).toBe('Buttons.1');
      expect(samples[0].before).toBe('\u05d0ישור');
      expect(samples[0].after).toBe('\u05e8\u05d5\u05e9\u05d9\u05d0');
    });

    it('should reverse the full text order for mostly-Hebrew strings but keep placeholders/brackets stable', async () => {
      const rtlConfig: ServerConfig = {
        ...configWithTransform,
        rtlTextWorkaround: true,
        rtlWrapMode: 'VISUAL_REVERSE',
        rtlTransformScope: 'all'
      };

      const app = createTestApp(rtlConfig);
      const servicesDir = path.join(testAssetsDir, 'Servises');
      const testFilePath = path.join(servicesDir, 'lang.aspx%3flang%3d16');

      fs.writeFileSync(
        testFilePath,
        '<?xml version="1.0" encoding="utf-8"?><Lang><Sections><Section name="General"><M id="1" msg="\u05e9\u05e8\u05ea \u05e9\u05d9\u05de\u05d5\u05e8 \u05de\u05e7\u05d5\u05de\u05d9 {0} (\u05e9\u05dc\u05d5\u05dd)!" /></Section></Sections></Lang>',
        'utf8'
      );

      try {
        const response = await app.inject({
          method: 'GET',
          url: '/Servises/lang.aspx?lang=16'
        });

        expect(response.statusCode).toBe(200);
        const body = response.body;
        expect(body).toContain('msg="!(\u05dd\u05d5\u05dc\u05e9) {0} \u05d9\u05de\u05d5\u05e7\u05de \u05e8\u05d5\u05de\u05d9\u05e9 \u05ea\u05e8\u05e9"');
      } finally {
        if (fs.existsSync(testFilePath)) {
          fs.unlinkSync(testFilePath);
        }
      }
    });

    it('should only reverse Hebrew runs for mixed strings with low Hebrew ratio', async () => {
      const rtlConfig: ServerConfig = {
        ...configWithTransform,
        rtlTextWorkaround: true,
        rtlWrapMode: 'VISUAL_REVERSE',
        rtlTransformScope: 'all'
      };

      const app = createTestApp(rtlConfig);
      const servicesDir = path.join(testAssetsDir, 'Servises');
      const testFilePath = path.join(servicesDir, 'lang.aspx%3flang%3d17');

      fs.writeFileSync(
        testFilePath,
        '<?xml version="1.0" encoding="utf-8"?><Lang><Sections><Section name="General"><M id="2" msg="Welcome back \u05e9\u05dc\u05d5\u05dd user!" /></Section></Sections></Lang>',
        'utf8'
      );

      try {
        const response = await app.inject({
          method: 'GET',
          url: '/Servises/lang.aspx?lang=17'
        });

        expect(response.statusCode).toBe(200);
        const body = response.body;
        expect(body).toContain('msg="Welcome back \u05dd\u05d5\u05dc\u05e9 user!"');
      } finally {
        if (fs.existsSync(testFilePath)) {
          fs.unlinkSync(testFilePath);
        }
      }
    });

    it('should only transform selected allowlisted keys and record skipped keys in diagnostics', async () => {
      const rtlConfig: ServerConfig = {
        ...configWithTransform,
        rtlTextWorkaround: true,
        rtlWrapMode: 'VISUAL_REVERSE',
        rtlTransformScope: 'selected-keys',
        rtlTransformKeys: ['Buttons.1']
      };

      const app = createTestApp(rtlConfig);
      const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
      ruffleDiagnosticsManager.clear();

      const response = await app.inject({
        method: 'GET',
        url: '/Servises/lang.aspx?lang=1'
      });

      expect(response.statusCode).toBe(200);
      const body = response.body;

      // Buttons.1 is allowlisted: "אישור" -> "רושיא"
      expect(body).toContain('\u05e8\u05d5\u05e9\u05d9\u05d0');
      // Buttons.2 is NOT allowlisted: msg="ביטול" stays msg="ביטול"
      expect(body).toContain('msg="\u05d1יטול"');

      // Check diagnostics
      const report = ruffleDiagnosticsManager.getReport({});
      expect(report.rtlTransformScope).toBe('selected-keys');
      expect(report.rtlAllowlistedKeys).toContain('Buttons.1');
      expect(report.rtlTransformedKeys).toContain('Buttons.1');
      expect(report.rtlSkippedBecauseNotAllowlisted).toContain('Buttons.2');
    });

    it('should not touch chat_1.xml files even if keys are allowlisted', async () => {
      const rtlConfig: ServerConfig = {
        ...configWithTransform,
        rtlTextWorkaround: true,
        rtlWrapMode: 'VISUAL_REVERSE',
        rtlTransformScope: 'all'
      };

      const app = createTestApp(rtlConfig);
      const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
      ruffleDiagnosticsManager.clear();

      const response = await app.inject({
        method: 'GET',
        url: '/Xmls/lang/chat_1.xml'
      });

      expect(response.statusCode).toBe(200);
      const body = response.body;

      // chat_1.xml has "Hebrew Chat".
      const chatFilePath = path.join(langDir, 'chat_hebrew_temp.xml');
      fs.writeFileSync(
        chatFilePath,
        '<?xml version="1.0" encoding="utf-8"?><Lang><chat><m id="1" txt="\u05e9\u05dc\u05d5\u05dd" /></chat></Lang>',
        'utf8'
      );

      try {
        const responseTemp = await app.inject({
          method: 'GET',
          url: '/Xmls/lang/chat_hebrew_temp.xml'
        });
        expect(responseTemp.statusCode).toBe(200);
        // It must NOT be reversed because it is a chat XML file!
        expect(responseTemp.body).toContain('txt="\u05e9\u05dc\u05d5\u05dd"');
      } finally {
        if (fs.existsSync(chatFilePath)) {
          fs.unlinkSync(chatFilePath);
        }
      }
    });

    it('should support file-specific allowlist keys using file:key format', async () => {
      const rtlConfig: ServerConfig = {
        ...configWithTransform,
        rtlTextWorkaround: true,
        rtlWrapMode: 'VISUAL_REVERSE',
        rtlTransformScope: 'selected-keys',
        rtlTransformKeys: ['lang.aspx:Buttons.1', 'other_file.xml:Buttons.2']
      };

      const app = createTestApp(rtlConfig);
      const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
      ruffleDiagnosticsManager.clear();

      const response = await app.inject({
        method: 'GET',
        url: '/Servises/lang.aspx?lang=1'
      });

      expect(response.statusCode).toBe(200);
      const body = response.body;

      // lang.aspx:Buttons.1 matches: "אישור" -> "רושיא"
      expect(body).toContain('\u05e8\u05d5\u05e9\u05d9\u05d0');
      // other_file.xml:Buttons.2 does not match: "ביטול" stays "ביטול"
      expect(body).toContain('msg="\u05d1יטול"');
    });

    it('should serve custom Ruffle fonts from the ruffle-fonts directory', async () => {
      const parentDir = path.dirname(configWithTransform.assetsPath);
      const testFontsDir = path.join(parentDir, 'ruffle-fonts');
      fs.mkdirSync(testFontsDir, { recursive: true });
      fs.writeFileSync(path.join(testFontsDir, 'HebrewFont.swf'), 'mock-font-swf-content');

      const app = createTestApp(configWithTransform);

      try {
        const response = await app.inject({
          method: 'GET',
          url: '/RuffleFonts/HebrewFont.swf'
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toContain('application/x-shockwave-flash');
        expect(response.body).toBe('mock-font-swf-content');
      } finally {
        fs.rmSync(testFontsDir, { recursive: true, force: true });
      }
    });
  });
});
