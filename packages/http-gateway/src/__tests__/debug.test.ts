import { describe, it, expect, beforeEach } from 'vitest';
import fastify from 'fastify';
import { ServerConfig, ruffleDiagnosticsManager, timelineManager } from '@flash-socket-server/core';
import { registerDebugRoutes } from '../routes/debug';

describe('HTTP Gateway Debug Routes', () => {
  const dummyConfig: ServerConfig = {
    httpPort: 8080,
    socketPort: 9339,
    policyPort: 843,
    assetsPath: './non_existent_folder_xyz',
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
    registerDebugRoutes(app, dummyConfig);
    return app;
  };

  beforeEach(() => {
    timelineManager.clearAll();
    ruffleDiagnosticsManager.clear();
  });

  it('should return no session recorded when there are no active sessions', async () => {
    const app = createTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/debug/runtime-timeline'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    
    const body = JSON.parse(response.body);
    expect(body.status).toBe('no_session_recorded');
  });

  it('should return the latest session timeline JSON', async () => {
    const app = createTestApp();
    
    // Simulate recording milestones
    timelineManager.recordMilestone('127.0.0.1', 'Mozilla/5.0', 'Mogo.swf served');
    timelineManager.recordMilestone('127.0.0.1', 'Mozilla/5.0', 'Servers.aspx served');

    const response = await app.inject({
      method: 'GET',
      url: '/debug/runtime-timeline'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');

    const body = JSON.parse(response.body);
    expect(body.ip).toBe('127.0.0.1');
    expect(body.userAgent).toBe('Mozilla/5.0');
    expect(body.milestones).toHaveLength(2);
    expect(body.milestones[0].name).toBe('Mogo.swf served');
    expect(body.milestones[1].name).toBe('Servers.aspx served');
    expect(body.serversServedAt).toBeDefined();
    expect(body.tcpMissingWarningFired).toBe(false);
  });

  it('should initialize visual diagnostics as null and not set them on room20PageViewSeen', async () => {
    const app = createTestApp();
    const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
    ruffleDiagnosticsManager.clear();

    const reportRes = await app.inject({
      method: 'GET',
      url: '/debug/ruffle-report',
      headers: { host: '127.0.0.1' }
    });
    expect(reportRes.statusCode).toBe(200);
    const initialReport = JSON.parse(reportRes.body);
    const initialVisuals = initialReport.visualDiagnostics;
    expect(initialVisuals.room20PageViewSeen).toBe(false);
    expect(initialVisuals.avatarCreated).toBeNull();
    expect(initialVisuals.controlPanelInitialized).toBeNull();
    expect(initialVisuals.controlPanelVisible).toBeNull();
    expect(initialVisuals.loadingScreenHidden).toBeNull();

    // Trigger room20PageViewSeen event
    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: '127.0.0.1' },
      payload: {
        type: 'room-milestone',
        message: 'room20PageViewSeen',
        details: { pageName: 'room_20' }
      }
    });

    const reportResAfter = await app.inject({
      method: 'GET',
      url: '/debug/ruffle-report',
      headers: { host: '127.0.0.1' }
    });
    const afterReport = JSON.parse(reportResAfter.body);
    const afterVisuals = afterReport.visualDiagnostics;
    expect(afterVisuals.room20PageViewSeen).toBe(true);
    expect(afterVisuals.avatarCreated).toBeNull();
    expect(afterVisuals.controlPanelInitialized).toBeNull();
    expect(afterVisuals.controlPanelVisible).toBeNull();
    expect(afterVisuals.loadingScreenHidden).toBeNull();
  });

  it('should expose ExternalInterface timing diagnostics in the Ruffle report', async () => {
    const app = createTestApp();

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: '127.0.0.1' },
      payload: {
        type: 'external-interface-timing',
        message: 'addToLog',
        details: {
          hook: 'addToLog',
          durationMs: 12.5,
          msg: 'asdfasdf'
        }
      }
    });

    const reportRes = await app.inject({
      method: 'GET',
      url: '/debug/ruffle-report',
      headers: { host: '127.0.0.1' }
    });

    expect(reportRes.statusCode).toBe(200);
    const report = JSON.parse(reportRes.body);
    expect(report.externalInterfaceTimingDiagnostics.hookCounts.addToLog).toBe(1);
    expect(report.externalInterfaceTimingDiagnostics.hookMaxDurationMs.addToLog).toBe(12.5);
    expect(report.externalInterfaceTimingDiagnostics.samples[0].hook).toBe('addToLog');
  });

  it('should set visual diagnostics to false when explicit failures are recorded', async () => {
    const app = createTestApp();
    const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
    ruffleDiagnosticsManager.clear();

    // Trigger avatar and control panel error events
    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: '127.0.0.1' },
      payload: {
        type: 'ruffle-trace',
        message: 'ReferenceError: Error #1069: Property avatar not found on mlRoom_20'
      }
    });

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: '127.0.0.1' },
      payload: {
        type: 'ruffle-trace',
        message: 'TypeError: Error #1009: Cannot access a property or method of a null object reference controlpanel'
      }
    });

    const reportRes = await app.inject({
      method: 'GET',
      url: '/debug/ruffle-report',
      headers: { host: '127.0.0.1' }
    });
    const report = JSON.parse(reportRes.body);
    const visuals = report.visualDiagnostics;
    expect(visuals.avatarCreationErrorSeen).toBe(true);
    expect(visuals.avatarCreated).toBe(false);
    expect(visuals.localUserCreated).toBe(false);
    
    expect(visuals.controlPanelInitErrorSeen).toBe(true);
    expect(visuals.controlPanelInitialized).toBe(false);
    expect(visuals.controlPanelVisible).toBe(false);
  });

  it('records Ruffle socket fallback diagnostics from trace events', async () => {
    const app = createTestApp();
    const { ruffleDiagnosticsManager } = await import('@flash-socket-server/core');
    ruffleDiagnosticsManager.clear();

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: '127.0.0.1' },
      payload: {
        type: 'ruffle-trace',
        message: 'Missing WebSocket proxy for host localhost, port 9339'
      }
    });

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: '127.0.0.1' },
      payload: {
        type: 'ruffle-trace',
        message: 'Socket connection failed. Trying BlueBox'
      }
    });

    const reportRes = await app.inject({
      method: 'GET',
      url: '/debug/ruffle-report',
      headers: { host: '127.0.0.1' }
    });
    const report = JSON.parse(reportRes.body);
    expect(report.socketDiagnostics.missingWebSocketProxySeen).toBe(true);
    expect(report.socketDiagnostics.socketFallbackToBlueBoxSeen).toBe(true);
    expect(report.socketDiagnostics.socketFailureTraces.length).toBeGreaterThanOrEqual(2);
  });

  it('stores bounded Hebrew canvas text samples and ignores non-Hebrew samples', async () => {
    const app = createTestApp();
    const samples = Array.from({ length: 105 }, (_, index) => ({
      method: index % 2 === 0 ? 'fillText' : 'strokeText',
      text: `שלום ${index}`,
      font: '16px Arial',
      direction: 'ltr',
      textAlign: 'start',
      x: index,
      y: index + 1,
      canvasWidth: 800,
      canvasHeight: 600,
      timestamp: index,
      length: `שלום ${index}`.length
    }));

    const postRes = await app.inject({
      method: 'POST',
      url: '/debug/ruffle-canvas-text',
      headers: { host: '127.0.0.1' },
      payload: {
        interceptorActive: true,
        totalDrawCount: 200,
        hebrewTextDrawCount: 105,
        fontsSeen: { '16px Arial': 105 },
        methodCounts: { fillText: 53, strokeText: 52 },
        samples: [
          { method: 'fillText', text: 'hello', font: '16px Arial', timestamp: 1, length: 5 },
          ...samples
        ]
      }
    });
    expect(postRes.statusCode).toBe(200);

    const reportRes = await app.inject({
      method: 'GET',
      url: '/debug/ruffle-report',
      headers: { host: '127.0.0.1' }
    });

    const report = JSON.parse(reportRes.body);
    expect(report.canvasTextInterceptorActive).toBe(true);
    expect(report.canvasTextTotalDrawCount).toBe(200);
    expect(report.canvasHebrewTextDrawCount).toBe(105);
    expect(report.canvasTextFontsSeen['16px Arial']).toBe(105);
    expect(report.canvasTextMethodCounts.fillText).toBe(53);
    expect(report.canvasHebrewTextSamples).toHaveLength(100);
    expect(report.canvasHebrewTextSamples.some((sample: any) => sample.text === 'hello')).toBe(false);
    expect(report.canvasHebrewTextSamples[0].text).toBe('שלום 5');
    expect(report.canvasHebrewTextSamples[99].text).toBe('שלום 104');
  });

  it('parses magic trace diagnostics from browser console forwarding', async () => {
    const app = createTestApp();

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: '127.0.0.1' },
      payload: {
        type: 'browser-console-freeze-signal',
        message: '[magic_trace] event=call method=worlds4u.view.controls::ControlPanel.initSpecialMove specialHolderName=mcSpecialMove specialHolderVisibleAtInit=false specialHolderMouseEnabled=true specialHolderMouseChildren=true specialInnerButtonCount=3 specialInnerButtonNames="btnA,btnB,btnC" specialInnerButtonMouseEnabledList="true,true,true" specialInnerButtonVisibleList="true,true,true"'
      }
    });

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: '127.0.0.1' },
      payload: {
        type: 'browser-console-freeze-signal',
        message: '[magic_trace] event=call method=worlds4u.view.controls::ControlPanel.initSpecialEffectControl magicPanelVisible=false magicPanelExpectedClosedAtStartup=true magicPanelParentPath=mcControlButtons.mcSpecialEffectHolder magicPanelBounds=0,0,120,200 magicPanelAlpha=1 magicPanelMouseEnabled=true magicPanelMouseChildren=true specialHolderName=mcSpecialEffectHolder specialHolderVisibleAtInit=false specialHolderMouseEnabled=true specialHolderMouseChildren=true specialInnerButtonCount=5 specialInnerButtonNames="fx1,fx2,fx3"'
      }
    });

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: '127.0.0.1' },
      payload: {
        type: 'browser-console-freeze-signal',
        message: '[magic_trace] event=call method=worlds4u.view.controls::ControlPanel.onSpecialEffect magicButtonClickTargetClass=Object magicButtonClickTargetName=btnEEffects magicButtonClickTargetPath=mcControlButtons.btnEEffects magicPanelVisible=true'
      }
    });

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: '127.0.0.1' },
      payload: {
        type: 'browser-console-freeze-signal',
        message: '[magic_trace] event=mouse_pick inputEvent=mouse_down stageX=410 stageY=360 controlPanelHitTestTopObjectClass=MogoWallPopup controlPanelHitTestTopObjectName=mcBlocker controlPanelHitTestTopObjectPath=_level0.popupLayer.MogoWallPopup.mcBlocker controlPanelHitTestTopObjectBounds=0,0,800,600 controlPanelHitTestAncestorChain=MogoWallPopup:mcBlocker:visible=true:alpha=1.00:mouseEnabled=true:mouseChildren=false:bounds=0,0,800,600 controlPanelClickBlockedByClass=MogoWallPopup controlPanelClickBlockedByName=mcBlocker controlPanelClickBlockedByPath=_level0.popupLayer.MogoWallPopup.mcBlocker popupLayerTopObject=_level0.popupLayer.MogoWallPopup.mcBlocker popupLayerBlocksControlPanel=true activePopupClassName=MogoWallPopup activePopupMouseEnabled=true activePopupMouseChildren=false'
      }
    });

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: '127.0.0.1' },
      payload: {
        type: 'browser-console-freeze-signal',
        message: '[magic_trace] event=error method=worlds4u.view.controls.SpecialEffectControl.onSelectEffect errorClass=TypeError errorMessage=Cannot_access_property currentlyExecutingAvm2Method=worlds4u.view.controls.SpecialEffectControl.onSelectEffect'
      }
    });

    const reportRes = await app.inject({
      method: 'GET',
      url: '/debug/ruffle-report',
      headers: { host: '127.0.0.1' }
    });

    const report = JSON.parse(reportRes.body);
    expect(report.controlPanelMethodsSeen).toContain('worlds4u.view.controls::ControlPanel.initSpecialMove');
    expect(report.magicPanelSeen).toBe(true);
    expect(report.magicPanelInitiallyOpen).toBe(false);
    expect(report.magicPanelExpectedClosedAtStartup).toBe(true);
    expect(report.specialMoveInitSeen).toBe(true);
    expect(report.specialEffectInitSeen).toBe(true);
    expect(report.specialHolderName).toBe('mcSpecialEffectHolder');
    expect(report.specialInnerButtonCount).toBe(5);
    expect(report.magicButtonClickSeen).toBe(true);
    expect(report.magicButtonClickTargetName).toBe('btnEEffects');
    expect(report.controlPanelButtonClickSeen).toBe(true);
    expect(report.controlPanelClickedButtonPath).toBe('mcControlButtons.btnEEffects');
    expect(report.controlPanelHitTestTopObjectClass).toBe('MogoWallPopup');
    expect(report.controlPanelHitTestTopObjectPath).toBe('_level0.popupLayer.MogoWallPopup.mcBlocker');
    expect(report.controlPanelClickBlockedByClass).toBe('MogoWallPopup');
    expect(report.popupLayerBlocksControlPanel).toBe(true);
    expect(report.activePopupMouseChildren).toBe('false');
    expect(report.magicLocalExceptionSeen).toBe(true);
    expect(report.magicLocalExceptionClass).toBe('TypeError');
    expect(report.currentExecutingAvm2Method).toBe('worlds4u.view.controls.SpecialEffectControl.onSelectEffect');
  });

  it('parses magic compatibility shim diagnostics from browser console forwarding', async () => {
    const app = createTestApp();

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: '127.0.0.1' },
      payload: {
        type: 'browser-console-freeze-signal',
        message: '[magic_compat_shim] applied=false reason=registration_seen originalHandler=onSpecialMoveSend compatHandler=onEffectSend receiverClassActual=worlds4u.view.controls::SpecialEffectControl listenerNameActual=worlds4u.view.controls::ControlPanel/onSpecialMoveSend boundReceiverClassActual=worlds4u.view.controls::ControlPanel boundMethodActual=onSpecialMoveSend'
      }
    });

    await app.inject({
      method: 'POST',
      url: '/debug/ruffle-event',
      headers: { host: '127.0.0.1' },
      payload: {
        type: 'browser-console-freeze-signal',
        message: '[magic_compat_shim] applied=true reason=suppressed-doeffect-onspecialmovesend-from-enableevents originalHandler=onSpecialMoveSend compatHandler=onEffectSend'
      }
    });

    const reportRes = await app.inject({
      method: 'GET',
      url: '/debug/ruffle-report',
      headers: { host: '127.0.0.1' }
    });

    const report = JSON.parse(reportRes.body);
    expect(report.magicCompatShimApplied).toBe(true);
    expect(report.magicCompatShimReason).toBe('suppressed-doeffect-onspecialmovesend-from-enableevents');
    expect(report.magicDoEffectOriginalHandler).toBe('onSpecialMoveSend');
    expect(report.magicDoEffectCompatHandler).toBe('onEffectSend');
    expect(report.magicDoEffectRegistrationCount).toBe(1);
    expect(report.magicDoEffectRegistrationsSeen).toEqual([
      'receiver=worlds4u.view.controls::SpecialEffectControl listener=worlds4u.view.controls::ControlPanel/onSpecialMoveSend boundReceiver=worlds4u.view.controls::ControlPanel boundMethod=onSpecialMoveSend',
    ]);
  });

  it('parses magic controlpanel shim plumbing diagnostics from browser console forwarding', async () => {
    const app = createTestApp();

    const messages = [
      '[magic_controlpanel_shim] configureBuilder config.magicControlPanelShim = true',
      '[magic_controlpanel_shim] RuffleInstanceBuilder received magic_control_panel_shim=true',
      '[magic_controlpanel_shim] PlayerBuilder received magic_control_panel_shim=true',
      '[magic_controlpanel_shim] Player constructed with magic_control_panel_shim=true',
      '[magic_controlpanel_shim] EventDispatcher.addEventListener flag=true eventType=DOEffect receiverClassActual=worlds4u.view.controls::SpecialEffectControl listenerNameActual=worlds4u.view.controls::ControlPanel/onSpecialMoveSend boundReceiverClassActual=worlds4u.view.controls::ControlPanel boundMethodActual=onSpecialMoveSend',
    ];

    for (const message of messages) {
      await app.inject({
        method: 'POST',
        url: '/debug/ruffle-event',
        headers: { host: '127.0.0.1' },
        payload: {
          type: 'browser-console-freeze-signal',
          message,
        }
      });
    }

    const reportRes = await app.inject({
      method: 'GET',
      url: '/debug/ruffle-report',
      headers: { host: '127.0.0.1' }
    });

    const report = JSON.parse(reportRes.body);
    expect(report.magicControlPanelShimConfigured).toBe(true);
    expect(report.magicControlPanelShimBuilderReceived).toBe(true);
    expect(report.magicControlPanelShimPlayerBuilderReceived).toBe(true);
    expect(report.magicControlPanelShimPlayerConstructed).toBe(true);
    expect(report.magicControlPanelShimEventDispatcherFlag).toBe(true);
  });
});
