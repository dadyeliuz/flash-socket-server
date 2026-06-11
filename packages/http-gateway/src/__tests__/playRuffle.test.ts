import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fastify from 'fastify';
import { ServerConfig, ruffleDiagnosticsManager, timelineManager } from '@flash-socket-server/core';
import * as fs from 'fs';
import * as path from 'path';
import { registerPlayHtmlRoute } from '../routes/playHtml';
import { registerPlayRuffleRoutes } from '../routes/playRuffle';
import { registerDebugRoutes } from '../routes/debug';

describe('Bundled local Ruffle runtime sanity', () => {
  it('contains required local compatibility shims and diagnostics', () => {
    const runtimeDir = path.resolve(__dirname, '../../../../tools/runtime/ruffle');
    const runtimeFiles = fs
      .readdirSync(runtimeDir)
      .filter((name) => /\.(js|wasm)$/i.test(name))
      .map((name) => fs.readFileSync(path.join(runtimeDir, name)).toString('utf8'))
      .join('\n');

    expect(runtimeFiles).toContain('hebrewRtlWorkaround');
    expect(runtimeFiles).toContain('rtlTextWorkaround');
    expect(runtimeFiles).toContain('textFlowEditorCtorShim');
    expect(runtimeFiles).toContain('buttonGridClearShim');
    expect(runtimeFiles).toContain('userExperienceCtorShim');
    expect(runtimeFiles).toContain('magicControlPanelShim');
    expect(runtimeFiles).toContain('loadingScreenTextCompatShim');
    expect(runtimeFiles).toContain('loadingScreenTextCompatFallbackText');
    expect(runtimeFiles).toContain('hebrew_rtl');
    expect(runtimeFiles).toContain('text_flow_editor');
    expect(runtimeFiles).toContain('button_data_grid_clear_shim');
    expect(runtimeFiles).toContain('user_experience_ctor_shim');
    expect(runtimeFiles).toContain('magic_controlpanel_shim');
    expect(runtimeFiles).toContain('magic_trace');
  });
});

describe('HTTP Gateway Ruffle Experiment Routes', () => {
  const tempRuntimeDir = path.resolve(__dirname, 'temp_ruffle_runtime');
  const config: ServerConfig = {
    httpPort: 8080,
    socketPort: 9339,
    policyPort: 843,
    assetsPath: './non_existent_folder_xyz',
    runtimeMode: 'ruffle-local',
    entrySwf: 'Mogo.swf',
    publicHost: 'localhost',
    acceptAnyLogin: true,
    defaultUserModerator: true,
    sendRoomListAfterLogin: false,
    defaultRoomName: 'room_20',
    defaultRoomId: 1,
    verboseHttp: false,
    debugAssetsPath: './debug-assets',
    ruffleRuntimeDir: tempRuntimeDir,
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

  beforeEach(() => {
    ruffleDiagnosticsManager.clear();
    timelineManager.clearAll();
    fs.rmSync(tempRuntimeDir, { recursive: true, force: true });
    fs.mkdirSync(tempRuntimeDir, { recursive: true });
    fs.writeFileSync(path.join(tempRuntimeDir, 'ruffle.js'), 'runtime-js');
    fs.writeFileSync(path.join(tempRuntimeDir, 'runtime-hash.wasm'), 'runtime-wasm');
    fs.writeFileSync(path.join(tempRuntimeDir, 'core.ruffle.123abc.js'), 'core-runtime-js');
    fs.writeFileSync(path.join(tempRuntimeDir, 'ruffle.js.map'), '{}');
  });

  afterEach(() => {
    fs.rmSync(tempRuntimeDir, { recursive: true, force: true });
  });

  function createApp() {
    const app = fastify();
    registerPlayHtmlRoute(app, config);
    registerPlayRuffleRoutes(app, config);
    registerDebugRoutes(app, config);
    return app;
  }

  it('serves play-ruffle.html with no-op ExternalInterface hooks and local flashvars', async () => {
    const app = createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('/ruffle/ruffle.js');
    expect(response.body).toContain('/Swf/Mogo.swf');
    expect(response.body).toContain('onSetVar');
    expect(response.body).toContain('onTrackEvent');
    expect(response.body).toContain('onPageView');
    expect(response.body).toContain('setLanguage');
    expect(response.body).toContain('reloadPage');
    expect(response.body).toContain('__fssRecordExternalInterfaceHookTiming');
    expect(response.body).toContain('external-interface-timing');
    expect(response.body).toContain('"httpPort":"9339"');
    expect(response.body).toContain('"mainDomain":"localhost:8080"');
    expect(response.body).toContain('"mediaURL":"http://localhost:8080/"');
    expect(response.body).toContain('Room loader: unknown');
    expect(response.body).toContain('refreshRoomLoaderStatus');
    expect(response.body).toContain('/debug/bluebox-summary');
  });

  it('includes freeze console diagnostics hook', async () => {
    const app = createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('installFreezeConsoleDiagnostics');
    expect(response.body).toContain('browser-console-freeze-signal');
    expect(response.body).toContain('long script');
  });

  it('uses best-effort diagnostic reporting with failure counters', async () => {
    const app = createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('__fssDiagnosticTransport');
    expect(response.body).toContain('diagnosticReportFailedCount');
    expect(response.body).toContain('lastDiagnosticReportFailedAt');
    expect(response.body).toContain('lastDiagnosticReportFailureMessage');
    expect(response.body).toContain('failureLogThrottleMs: 5000');
    expect(response.body).toContain('catch(recordDiagnosticReportFailure)');
    expect(response.body).toContain('__fssRecordDiagnosticReportFailure');
  });

  it('exposes diagnostic report failure counters in the Ruffle report', async () => {
    const app = createApp();

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: 'localhost:8080', 'content-type': 'application/json' },
      payload: {
        type: 'external-interface',
        message: 'after transport failure',
        details: {
          diagnosticReportFailedCount: 3,
          lastDiagnosticReportFailedAt: 123456,
          lastDiagnosticReportFailureMessage: 'Failed to fetch'
        }
      }
    });

    const reportResponse = await app.inject({
      method: 'GET',
      url: '/debug/ruffle-report',
      headers: { host: 'localhost:8080' }
    });

    expect(reportResponse.statusCode).toBe(200);
    const body = JSON.parse(reportResponse.body);
    expect(body.diagnosticReportFailedCount).toBe(3);
    expect(body.lastDiagnosticReportFailedAt).toBe(123456);
    expect(body.lastDiagnosticReportFailureMessage).toBe('Failed to fetch');
    expect(body.diagnosticTransport.diagnosticReportFailedCount).toBe(3);
  });

  it('does not include canvas text diagnostics by default', async () => {
    const app = createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('installFssCanvasTextDiagnostics');
    expect(response.body).not.toContain('/debug/ruffle-canvas-text');
  });

  it('does not include Hebrew RTL workaround config by default', async () => {
    const app = createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('hebrewRtlWorkaround: true');
    expect(response.body).toContain('hebrewRtlWorkaround: false');
    expect(response.body).not.toContain('fastFailSocketWithoutProxy: true');
    expect(response.body).toContain('fastFailSocketWithoutProxy: false');
    expect(response.body).not.toContain('preloginCallTrace: true');
    expect(response.body).toContain('preloginCallTrace: false');
    expect(response.body).not.toContain('userExperienceCtorShim: true');
    expect(response.body).toContain('userExperienceCtorShim: false');
    expect(response.body).not.toContain('magicControlPanelShim: true');
    expect(response.body).toContain('magicControlPanelShim: false');
  });

  it('includes Hebrew RTL workaround config when configured', async () => {
    const app = fastify();
    registerPlayRuffleRoutes(app, {
      ...config,
      ruffleHebrewRtlWorkaround: true
    });

    const response = await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('hebrewRtlWorkaround: true');
  });

  it('includes Ruffle socket fast-fail config when configured', async () => {
    const app = fastify();
    registerPlayRuffleRoutes(app, {
      ...config,
      ruffleFastFailSocketWithoutProxy: true
    });

    const response = await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('fastFailSocketWithoutProxy: true');
    expect(response.body).toContain('player.config.fastFailSocketWithoutProxy');
  });

  it('includes Ruffle prelogin call trace config when configured', async () => {
    const app = fastify();
    registerPlayRuffleRoutes(app, {
      ...config,
      rufflePreloginCallTrace: true
    });

    const response = await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('preloginCallTrace: true');
    expect(response.body).toContain('player.config.preloginCallTrace');
  });

  it('includes UserExperience constructor shim config when configured', async () => {
    const app = fastify();
    registerPlayRuffleRoutes(app, {
      ...config,
      ruffleUserExperienceCtorShim: true
    });

    const response = await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('userExperienceCtorShim: true');
    expect(response.body).toContain('player.config.userExperienceCtorShim');
    expect(response.body).toContain('generatedUserExperienceCtorShim: true');
  });

  it('includes TextFlowEditor constructor shim config when configured', async () => {
    const app = fastify();
    registerPlayRuffleRoutes(app, {
      ...config,
      ruffleTextFlowEditorCtorShim: true
    });

    const response = await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('textFlowEditorCtorShim: true');
    expect(response.body).toContain('player.config.textFlowEditorCtorShim');
    expect(response.body).toContain('generatedTextFlowEditorCtorShim: true');
  });

  it('includes ButtonDataGrid clear shim config when configured', async () => {
    const app = fastify();
    registerPlayRuffleRoutes(app, {
      ...config,
      ruffleButtonGridClearShim: true
    });

    const response = await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('buttonGridClearShim: true');
    expect(response.body).toContain('player.config.buttonGridClearShim');
    expect(response.body).toContain('generatedButtonGridClearShim: true');
  });

  it('includes Magic ControlPanel shim config when configured', async () => {
    const app = fastify();
    registerPlayRuffleRoutes(app, {
      ...config,
      ruffleMagicControlPanelShim: true
    });

    const response = await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('magicControlPanelShim: true');
    expect(response.body).toContain('player.config.magicControlPanelShim');
    expect(response.body).toContain('generatedMagicControlPanelShim: true');
  });

  it('configures LoadingScreen text compat envelope when loading-screen text mode is active', async () => {
    const assetsPath = path.join(tempRuntimeDir, 'assets');
    const servicesDir = path.join(assetsPath, 'Servises');
    fs.mkdirSync(servicesDir, { recursive: true });
    fs.writeFileSync(
      path.join(servicesDir, 'lang.aspx%3flang%3d4'),
      '<Lang><Sections><Section name="LoadingScreen"><M id="1" msg="Local loading message" /></Section></Sections></Lang>',
      'utf8'
    );

    const app = fastify();
    registerPlayRuffleRoutes(app, {
      ...config,
      assetsPath,
      compatLoadingScreenTextMode: 'plain'
    });
    registerDebugRoutes(app, {
      ...config,
      assetsPath,
      compatLoadingScreenTextMode: 'plain'
    });

    const response = await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('loadingScreenTextCompatShim: true');
    expect(response.body).toContain('loadingScreenTextCompatFallbackText: "[LS_TEXT_V1]');
    expect(response.body).toContain('generatedLoadingScreenTextCompatShim: true');

    const reportResponse = await app.inject({
      method: 'GET',
      url: '/debug/ruffle-report',
      headers: { host: 'localhost:8080' }
    });
    const body = JSON.parse(reportResponse.body);
    expect(body.loadingScreenTextEnvelopeBuilt).toBe(true);
    expect(body.loadingScreenTextEnvelopeSource).toBe('extracted-local');
    expect(body.loadingScreenTextEnvelopeCandidateCount).toBe(1);
    expect(body.loadingScreenTextEnvelopePreviewSafe).toBe('Local loading message');
    expect(body.loadingScreenTextCompatShimConfigured).toBe(true);
    expect(body.loadingScreenTextCompatFallbackTextLength).toBeGreaterThan('[LS_TEXT_V1]'.length);
  });

  it('exposes UserExperience constructor shim diagnostics in the Ruffle report', async () => {
    const app = createApp();

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: 'localhost:8080', 'content-type': 'application/json' },
      payload: {
        type: 'browser-console-freeze-signal',
        message: '[user_experience_ctor_shim] applied=true class=worlds4u.view::UserExperience expected=2 got=3 argTypes=[flash.display::MovieClip,flash.text::TextField,Number] droppedArgType=flash.text::TextField argValuesPreview=[score=1234] textFieldScoreApplied=true'
      }
    });

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: 'localhost:8080', 'content-type': 'application/json' },
      payload: {
        type: 'browser-console-freeze-signal',
        message: '[user_experience_ctor_shim] applied=false class=worlds4u.view::UserExperience skipReason=arg2_not_numeric expected=2 got=3 argTypes=[flash.display::MovieClip,flash.text::TextField,String]'
      }
    });

    const reportResponse = await app.inject({
      method: 'GET',
      url: '/debug/ruffle-report',
      headers: { host: 'localhost:8080' }
    });

    expect(reportResponse.statusCode).toBe(200);
    const body = JSON.parse(reportResponse.body);
    expect(body.userExperienceCtorShimEnabled).toBe(true);
    expect(body.userExperienceCtorShimAppliedCount).toBe(1);
    expect(body.userExperienceCtorShimSkippedCount).toBe(1);
    expect(body.lastUserExperienceCtorShimSkipReason).toBe('arg2_not_numeric');
    expect(body.lastUserExperienceCtorShimArgTypes).toEqual([
      'flash.display::MovieClip',
      'flash.text::TextField',
      'String'
    ]);
    expect(body.lastUserExperienceCtorShimDroppedArgType).toBe('flash.text::TextField');
    expect(body.lastUserExperienceCtorShimArgValuesPreview).toEqual({ score: '1234' });
    expect(body.lastUserExperienceCtorShimTextFieldScoreApplied).toBe(true);
  });

  it('exposes TextFlowEditor constructor shim diagnostics in the Ruffle report', async () => {
    const app = createApp();

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: 'localhost:8080', 'content-type': 'application/json' },
      payload: {
        type: 'browser-console-freeze-signal',
        message: '[text_flow_editor_ctor_shim] applied=true class=worlds4u.common.uiControls::TextFlowEditor expected=2 got=4 argTypes=[flash.text::TextField,int,int,int] droppedArgTypes=[int,int] argValuesPreview=[maxLength=120,scaleX=1,scaleY=1] callSiteMethod=mogobe.MogoWall.Compose::ComposeContent.init callerSwf=MogoWall.swf'
      }
    });

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: 'localhost:8080', 'content-type': 'application/json' },
      payload: {
        type: 'browser-console-freeze-signal',
        message: '[text_flow_editor_ctor_shim] applied=false class=worlds4u.common.uiControls::TextFlowEditor skipReason=arg0_not_textfield expected=2 got=4 argTypes=[Object,int,int,int] callSiteMethod=mogobe.MogoWall.Compose::ComposeContent.init callerSwf=MogoWall.swf'
      }
    });

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: 'localhost:8080', 'content-type': 'application/json' },
      payload: {
        type: 'browser-console-freeze-signal',
        message: '[text_flow_editor_ctor_shim] mismatch=true textFlowEditorCtorMismatchSeen=true mismatchCallerSwf=MogoWall.swf mismatchCallerClass=mogobe.MogoWall.Compose::ComposeContent mismatchCallerMethod=init mismatchExpectedReceiverClass=worlds4u.common.uiControls.TextFlowEditor expected=2 got=4 mismatchReceiverClassLoadedFromSwf=/Login.swf mismatchLikelyCause=mixed_swf_versions mismatchSuggestedAction="Use a MogoWall.swf and TextFlowEditor provider SWF from the same client version, or enable an explicit compatibility shim if available."'
      }
    });

    const reportResponse = await app.inject({
      method: 'GET',
      url: '/debug/ruffle-report',
      headers: { host: 'localhost:8080' }
    });

    expect(reportResponse.statusCode).toBe(200);
    const body = JSON.parse(reportResponse.body);
    expect(body.textFlowEditorCtorShimEnabled).toBe(true);
    expect(body.textFlowEditorCtorShimAppliedCount).toBe(1);
    expect(body.textFlowEditorCtorShimSkippedCount).toBe(1);
    expect(body.lastTextFlowEditorCtorShimSkipReason).toBe('arg0_not_textfield');
    expect(body.lastTextFlowEditorCtorShimArgTypes).toEqual(['Object', 'int', 'int', 'int']);
    expect(body.lastTextFlowEditorCtorShimDroppedArgTypes).toEqual(['int', 'int']);
    expect(body.lastTextFlowEditorCtorShimArgValuesPreview).toEqual({
      maxLength: '120',
      scaleX: '1',
      scaleY: '1'
    });
    expect(body.lastTextFlowEditorCtorShimCallSiteMethod).toBe('mogobe.MogoWall.Compose::ComposeContent.init');
    expect(body.lastTextFlowEditorCtorShimCallerSwf).toBe('MogoWall.swf');
    expect(body.textFlowEditorCtorMismatchSeen).toBe(true);
    expect(body.textFlowEditorCtorMismatchReceiverClassLoadedFromSwf).toBe('/Login.swf');
  });

  it('exposes MogoWall tab lifecycle diagnostics in the Ruffle report', async () => {
    const app = createApp();

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: 'localhost:8080', 'content-type': 'application/json' },
      payload: {
        type: 'browser-console-freeze-signal',
        message: '[mogo_wall_trace] event=call method=mogobe.MogoWall.WallMainScreen.onTabClick arg0=Object expectedCommandAfterTab=null anyMogoWallMouseClickSeen=true clickedDisplayObjectClass=Object clickedDisplayObjectName=btnCompose clickedDisplayObjectPath=mcTabs.btnCompose clickedTooltipText=compose clickedTabButtonIndexRaw=2 clickedTabButtonMappedPage=2 tabButtonEnabled=true tabButtonMouseEnabled=true tabButtonVisible=true tabButtonAlpha=1 tabButtonHitTestBlockedBy=unknown'
      }
    });

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: 'localhost:8080', 'content-type': 'application/json' },
      payload: {
        type: 'browser-console-freeze-signal',
        message: '[mogo_wall_trace] event=call method=MogoWall.requestTabView arg0=2 expectedCommandAfterTab=wall__getMessageTemplates requestTabViewCalled=true requestTabViewIndex=2 requestTabViewResolvedName=Compose'
      }
    });

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: 'localhost:8080', 'content-type': 'application/json' },
      payload: {
        type: 'browser-console-freeze-signal',
        message: '[mogo_wall_trace] event=call method=mogobe.MogoWall.WallMainScreen.gotoPage display=mogobe.MogoWall.WallMainScreen/gotoPage() arg0=2 expectedCommandAfterTab=wall__getMessageTemplates gotoPageCalled=true gotoPageIndex=2 requestTabViewResolvedName=Compose'
      }
    });

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: 'localhost:8080', 'content-type': 'application/json' },
      payload: {
        type: 'browser-console-freeze-signal',
        message: '[mogo_wall_trace] event=call method=mogobe.MogoWall.WallMainScreen.destroyView display=mogobe.MogoWall.WallMainScreen/destroyView() arg0=null expectedCommandAfterTab=null'
      }
    });

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: 'localhost:8080', 'content-type': 'application/json' },
      payload: {
        type: 'browser-console-freeze-signal',
        message: '[mogo_wall_trace] event=call method=mogobe.MogoWall.WallMainScreen.addComposeView display=mogobe.MogoWall.WallMainScreen/addComposeView() arg0=null expectedCommandAfterTab=null'
      }
    });

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: 'localhost:8080', 'content-type': 'application/json' },
      payload: {
        type: 'browser-console-freeze-signal',
        message: '[mogo_wall_trace] event=error method=mogobe.MogoWall.WallMainScreen.addComposeView errorClass=AVM2 errorMessage=Error_#1009:_Cannot_access currentlyExecutingAvm2Method=mogobe.MogoWall.WallMainScreen.addComposeView'
      }
    });

    const reportResponse = await app.inject({
      method: 'GET',
      url: '/debug/ruffle-report',
      headers: { host: 'localhost:8080' }
    });

    expect(reportResponse.statusCode).toBe(200);
    const body = JSON.parse(reportResponse.body);
    expect(body.anyMogoWallMouseClickSeen).toBe(true);
    expect(body.clickedDisplayObjectName).toBe('btnCompose');
    expect(body.clickedTooltipText).toBe('compose');
    expect(body.clickedTabButtonIndexRaw).toBe(2);
    expect(body.clickedTabButtonMappedPage).toBe(2);
    expect(body.requestTabViewCalled).toBe(true);
    expect(body.requestTabViewIndex).toBe(2);
    expect(body.requestTabViewResolvedName).toBe('Compose');
    expect(body.gotoPageCalled).toBe(true);
    expect(body.gotoPageIndex).toBe(2);
    expect(body.tabButtonEnabled).toBe('true');
    expect(body.tabButtonMouseEnabled).toBe('true');
    expect(body.tabButtonVisible).toBe('true');
    expect(body.tabButtonAlpha).toBe('1');
    expect(body.tabButtonHitTestBlockedBy).toBe('unknown');
    expect(body.composeTabClickedSeen).toBe(true);
    expect(body.lastMogoWallTabClickName).toBe('Compose');
    expect(body.lastMogoWallTabClickIndex).toBe(2);
    expect(body.lastMogoWallDestroyViewCalled).toBe(true);
    expect(body.lastMogoWallAddViewCalled).toBe('mogobe.MogoWall.WallMainScreen.addComposeView');
    expect(body.lastMogoWallViewAfterSwitch).toBe('Compose');
    expect(body.lastMogoWallCommandExpectedAfterTab).toBe('wall__getMessageTemplates');
    expect(body.lastMogoWallAddViewErrorSeen).toBe(true);
    expect(body.mogoWallLocalExceptionSeen).toBe(true);
    expect(body.mogoWallLocalExceptionMethod).toBe('mogobe.MogoWall.WallMainScreen.addComposeView');
  });

  it('exposes MogoWall mixed-SWF compatibility mismatch attribution', async () => {
    const app = createApp();

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: 'localhost:8080', 'content-type': 'application/json' },
      payload: {
        type: 'browser-console-freeze-signal',
        message: '[mogo_wall_trace] event=compatibility_mismatch mismatchCallerSwf=/Swf/Apps/MogoWall.swf mismatchCallerClass=mogobe.MogoWall.UserInfo::UserItemTabs mismatchCallerMethod=destroy mismatchExpectedReceiverClass=worlds4u.common.uiControls.DataGrid.ButtonDataGrid mismatchMissingMethod=clear mismatchReceiverClassLoadedFromSwf=/Mogo.swf mismatchReceiverClassDefiningMovie=Mogo.swf mismatchLikelyCause=mixed_swf_versions mismatchSuggestedAction="Use a MogoWall.swf and ButtonDataGrid provider SWF from the same client version, or enable an explicit compatibility shim if available."'
      }
    });

    const reportResponse = await app.inject({
      method: 'GET',
      url: '/debug/ruffle-report',
      headers: { host: 'localhost:8080' }
    });

    expect(reportResponse.statusCode).toBe(200);
    const body = JSON.parse(reportResponse.body);
    expect(body.mogoWallCompatibilityMismatchSeen).toBe(true);
    expect(body.mismatchCallerSwf).toBe('/Swf/Apps/MogoWall.swf');
    expect(body.mismatchCallerClass).toBe('mogobe.MogoWall.UserInfo::UserItemTabs');
    expect(body.mismatchCallerMethod).toBe('destroy');
    expect(body.mismatchExpectedReceiverClass).toBe('worlds4u.common.uiControls.DataGrid.ButtonDataGrid');
    expect(body.mismatchMissingMethod).toBe('clear');
    expect(body.mismatchReceiverClassLoadedFromSwf).toBe('/Mogo.swf');
    expect(body.mismatchReceiverClassDefiningMovie).toBe('Mogo.swf');
    expect(body.mismatchLikelyCause).toBe('mixed_swf_versions');
    expect(body.mismatchSuggestedAction).toContain('same client version');
  });

  it('exposes ButtonDataGrid clear shim diagnostics in the Ruffle report', async () => {
    const app = createApp();

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: 'localhost:8080', 'content-type': 'application/json' },
      payload: {
        type: 'browser-console-freeze-signal',
        message: '[button_data_grid_clear_shim] applied=true mode=emulated-clear fallbackReason=none receiverClass=worlds4u.common.uiControls.DataGrid::ButtonDataGrid callerSwf=/Swf/Apps/MogoWall.swf callSiteMethod=mogobe.MogoWall.UserInfo::UserItemTabs.destroy removedMcItems=true recreatedMcItems=true resetSelectedItem=true'
      }
    });

    const reportResponse = await app.inject({
      method: 'GET',
      url: '/debug/ruffle-report',
      headers: { host: 'localhost:8080' }
    });

    expect(reportResponse.statusCode).toBe(200);
    const body = JSON.parse(reportResponse.body);
    expect(body.buttonDataGridClearShimEnabled).toBe(true);
    expect(body.buttonDataGridClearShimAppliedCount).toBe(1);
    expect(body.buttonDataGridClearShimMode).toBe('emulated-clear');
    expect(body.buttonDataGridClearShimFallbackReason).toBeNull();
    expect(body.lastButtonDataGridClearShimReceiverClass).toBe('worlds4u.common.uiControls.DataGrid::ButtonDataGrid');
    expect(body.lastButtonDataGridClearShimCallerSwf).toBe('/Swf/Apps/MogoWall.swf');
    expect(body.lastButtonDataGridClearShimCallSiteMethod).toBe('mogobe.MogoWall.UserInfo::UserItemTabs.destroy');
    expect(body.buttonDataGridClearShimRemovedMcItems).toBe(true);
    expect(body.buttonDataGridClearShimRecreatedMcItems).toBe(true);
    expect(body.buttonDataGridClearShimResetSelectedItem).toBe(true);
  });

  it('includes canvas text diagnostics interceptor when configured', async () => {
    const app = fastify();
    registerPlayRuffleRoutes(app, {
      ...config,
      canvasTextDiagnostics: true
    });

    const response = await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('installFssCanvasTextDiagnostics');
    expect(response.body).toContain('CanvasRenderingContext2D');
    expect(response.body).toContain('OffscreenCanvasRenderingContext2D');
    expect(response.body).toContain('/debug/ruffle-canvas-text');
    expect(response.body.indexOf('installFssCanvasTextDiagnostics')).toBeLessThan(response.body.indexOf('const ruffle = window.RufflePlayer.newest()'));
  });

  it('includes browser audio diagnostics hooks before Ruffle player creation', async () => {
    const app = fastify();
    registerPlayRuffleRoutes(app, config);

    const response = await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('installFssAudioDiagnostics');
    expect(response.body).toContain('AudioBufferSourceNode');
    expect(response.body).toContain('browser-audio-event');
    expect(response.body.indexOf('installFssAudioDiagnostics')).toBeLessThan(response.body.indexOf('const ruffle = window.RufflePlayer.newest()'));
  });

  it('records canvas text diagnostics in the ruffle report', async () => {
    const app = createApp();

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-canvas-text',
      headers: { host: 'localhost:8080', 'content-type': 'application/json' },
      payload: {
        interceptorActive: true,
        totalDrawCount: 3,
        hebrewTextDrawCount: 1,
        fontsSeen: { '16px Arial': 1 },
        methodCounts: { fillText: 2, strokeText: 1 },
        samples: [
          {
            method: 'fillText',
            text: 'שלום',
            font: '16px Arial',
            direction: 'ltr',
            textAlign: 'start',
            x: 10,
            y: 20,
            canvasWidth: 800,
            canvasHeight: 600,
            timestamp: 123,
            length: 4
          }
        ]
      }
    });

    const reportResponse = await app.inject({
      method: 'GET',
      url: '/debug/ruffle-report',
      headers: { host: 'localhost:8080' }
    });

    expect(reportResponse.statusCode).toBe(200);
    const body = JSON.parse(reportResponse.body);
    expect(body.canvasTextInterceptorActive).toBe(true);
    expect(body.canvasTextTotalDrawCount).toBe(3);
    expect(body.canvasHebrewTextDrawCount).toBe(1);
    expect(body.canvasTextFontsSeen['16px Arial']).toBe(1);
    expect(body.canvasTextMethodCounts.fillText).toBe(2);
    expect(body.canvasHebrewTextSamples).toHaveLength(1);
    expect(body.canvasHebrewTextSamples[0].text).toBe('שלום');
  });

  it('rejects non-localhost access to play-ruffle.html', async () => {
    const app = createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'example.com:8080' }
    });

    expect(response.statusCode).toBe(403);
  });

  it('exposes ruffle diagnostics report', async () => {
    const app = createApp();

    await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: 'localhost:8080', 'content-type': 'application/json' },
      payload: { type: 'ruffle-runtime-loaded', message: 'loaded' }
    });

    timelineManager.recordMilestone('127.0.0.1', 'Vitest', 'Mogo.swf served');

    const reportResponse = await app.inject({
      method: 'GET',
      url: '/debug/ruffle-report',
      headers: { host: 'localhost:8080' }
    });

    expect(reportResponse.statusCode).toBe(200);
    const body = JSON.parse(reportResponse.body);
    expect(body.checklist.rufflePageServed).toBe(true);
    expect(body.checklist.ruffleRuntimeLoaded).toBe(true);
    expect(body.checklist.mogoSwfRequested).toBe(true);
  });

  it('keeps the existing play.html wrapper available', async () => {
    const app = createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/play.html'
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Clean-Room Container');
    expect(response.body).not.toContain('/ruffle/ruffle.js');
  });

  it('/ruffle/ruffle.js returns 200 from the resolved runtime directory', async () => {
    const app = createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/ruffle/ruffle.js',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/javascript');
    expect(response.body).toBe('runtime-js');
  });

  it('/ruffle/<hashed>.wasm returns 200 with wasm content type', async () => {
    const app = createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/ruffle/runtime-hash.wasm',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/wasm');
    expect(response.body).toBe('runtime-wasm');
  });

  it('/ruffle/core.ruffle.*.js returns 200', async () => {
    const app = createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/ruffle/core.ruffle.123abc.js',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/javascript');
    expect(response.body).toBe('core-runtime-js');
  });

  it('missing files under /ruffle return 404', async () => {
    const app = createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/ruffle/missing.js',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(404);
  });

  it('path traversal under /ruffle is blocked', async () => {
    const app = createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/ruffle/..%2F..%2Fpackage.json',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(404);
  });

  it('--ruffle-runtime-dir override affects /ruffle static serving', async () => {
    const overrideRuntimeDir = path.resolve(__dirname, 'temp_ruffle_runtime_override');
    fs.rmSync(overrideRuntimeDir, { recursive: true, force: true });
    fs.mkdirSync(overrideRuntimeDir, { recursive: true });
    fs.writeFileSync(path.join(overrideRuntimeDir, 'ruffle.js'), 'override-runtime-js');

    try {
      const app = fastify();
      registerPlayRuffleRoutes(app, {
        ...config,
        ruffleRuntimeDir: overrideRuntimeDir
      });

      const response = await app.inject({
        method: 'GET',
        url: '/ruffle/ruffle.js',
        headers: { host: 'localhost:8080' }
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('override-runtime-js');
    } finally {
      fs.rmSync(overrideRuntimeDir, { recursive: true, force: true });
    }
  });

  it('serves play-ruffle.html with serverList=true by default', async () => {
    const app = createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"serverList":"true"');
  });

  it('serves play-ruffle.html with serverList=false when overridden', async () => {
    const app = fastify();
    registerPlayRuffleRoutes(app, {
      ...config,
      serverList: false
    });
    const response = await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"serverList":"false"');
  });

  it('renders defaultFonts and optional fontSources / deviceFontRenderer in player.config when configured', async () => {
    const app = fastify();
    registerPlayRuffleRoutes(app, {
      ...config,
      ruffleFontSources: ['/Fonts/Spacerblack.swf'],
      ruffleDefaultFonts: {
        sans: ['Arial', 'David'],
        serif: ['David']
      },
      ruffleDeviceFontRenderer: 'canvas'
    });

    const response = await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('fontSources: ["/Fonts/Spacerblack.swf"]');
    expect(response.body).toContain('defaultFonts: {"sans":["Arial","David"],"serif":["David"]}');
    expect(response.body).toContain('deviceFontRenderer: "canvas"');
  });

  it('forwards magic_trace console diagnostics from the browser page', async () => {
    const app = createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('magic_trace');
  });

  it('omits deviceFontRenderer when not configured', async () => {
    const app = fastify();
    registerPlayRuffleRoutes(app, {
      ...config,
      ruffleDeviceFontRenderer: null
    });

    const response = await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    const configMatch = response.body.match(/const fssRuffleConfig = \{([^}]+)\}/);
    expect(configMatch).toBeTruthy();
    expect(configMatch![1]).not.toContain('deviceFontRenderer');
  });

  it('omits defaultFonts when not configured', async () => {
    const app = fastify();
    registerPlayRuffleRoutes(app, {
      ...config,
      ruffleDefaultFonts: undefined
    });

    const response = await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    expect(response.statusCode).toBe(200);
    const configMatch = response.body.match(/const fssRuffleConfig = \{([^}]+)\}/);
    expect(configMatch).toBeTruthy();
    expect(configMatch![1]).not.toContain('defaultFonts');
  });

  it('records ruffle font config and tracks diagnostics correctly', async () => {
    const app = fastify();
    registerPlayRuffleRoutes(app, {
      ...config,
      ruffleFontSources: ['/Fonts/Spacerblack.swf'],
      ruffleDeviceFontRenderer: 'canvas'
    });
    registerDebugRoutes(app, config);

    // Serve page to trigger recording
    await app.inject({
      method: 'GET',
      url: '/play-ruffle.html',
      headers: { host: 'localhost:8080' }
    });

    const reportResponse = await app.inject({
      method: 'GET',
      url: '/debug/ruffle-report',
      headers: { host: 'localhost:8080' }
    });

    expect(reportResponse.statusCode).toBe(200);
    const body = JSON.parse(reportResponse.body);
    expect(body.ruffleDefaultFonts).toBeDefined();
    expect(body.ruffleDeviceFontRenderer).toBe('canvas');
    expect(body.ruffleFontSources).toContain('/Fonts/Spacerblack.swf');
    expect(body.fontSourceRequests).toBeDefined();
    expect(body.fontSourceServed).toBeDefined();
    expect(body.fontSourceMissing).toBeDefined();
  });
});
