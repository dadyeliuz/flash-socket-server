export interface RuffleDiagnosticEvent {
  type: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message?: string;
  details?: Record<string, unknown>;
}

export interface CanvasHebrewTextSample {
  method: string;
  text: string;
  font?: string;
  direction?: string;
  textAlign?: string;
  x?: number | string | null;
  y?: number | string | null;
  canvasWidth?: number | null;
  canvasHeight?: number | null;
  timestamp: number;
  length: number;
}

export interface CanvasTextDiagnosticsPayload {
  interceptorActive?: boolean;
  totalDrawCount?: number;
  hebrewTextDrawCount?: number;
  fontsSeen?: Record<string, number>;
  methodCounts?: Record<string, number>;
  samples?: CanvasHebrewTextSample[];
}

export class RuffleDiagnosticsManager {
  private events: RuffleDiagnosticEvent[] = [];
  private maxEvents = 400;
  private languageSetCalls: string[] = [];

  // Visual milestone tracking
  private room20PageViewSeen = false;
  private mcSpecialEffectHolderWarningSeen = false;
  private swfParamsNullSeen = false;
  private flashAlerts: Array<{ msg: string; ts: number }> = [];
  private roomPageViews: Array<{ pageName: string; ts: number }> = [];
  private trackEvents: Array<{ category: string; action: string; ts: number }> = [];

  // room_20.txt diagnostics
  private room20TxtRequested = false;
  private room20TxtServed = false;
  private room20TxtSizeBytes = 0;
  private room20TxtJsonValid = false;
  private room20TxtTopLevelKeys: string[] = [];
  private room20TxtParseError: string | null = null;

  // MogoWall asset diagnostics
  private mogoWallSwfRequested = false;
  private mogoWallSwfServed = false;
  private mogoWallTxtRequested = false;
  private mogoWallTxtServed = false;
  private mogoWallTxtJsonValid = false;
  private mogoWallConfigKeys: string[] = [];

  // Room asset diagnostics
  private exactRoomAssetRequests: string[] = [];
  private roomLoaderRequestedNames: string[] = [];
  private roomSwfRequestedNames: string[] = [];
  private roomTxtRequestedNames: string[] = [];
  private lastRoomLoaded: string | null = null;
  private anyRequestContainingRoomRoom20 = false;
  private anyRequestContainingRoom20 = false;

  public recordRoomAssetRequest(url: string): void {
    this.exactRoomAssetRequests.push(url);
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('room_room_20')) {
      this.anyRequestContainingRoomRoom20 = true;
    }
    if (lowerUrl.includes('room_20')) {
      this.anyRequestContainingRoom20 = true;
    }

    // Extract room name (e.g. room_20, room_room_20) from URL
    const match = url.match(/\/Rooms\/(room_[^.?]+|[^.?\/]+)/i);
    if (match) {
      const name = match[1];
      if (!this.roomLoaderRequestedNames.includes(name)) {
        this.roomLoaderRequestedNames.push(name);
      }
      if (/\.swf(?:[\?#]|$)/i.test(url)) {
        if (!this.roomSwfRequestedNames.includes(name)) {
          this.roomSwfRequestedNames.push(name);
        }
        if (this.lastRoomLoaded && this.lastRoomLoaded !== name) {
          this.roomSoundStoppedOnTransition = true;
          this.roomBackSoundStoppedOnTransition = true;
        }
        this.lastRoomLoaded = name;
      }
      if (/\.txt(?:[\?#]|$)/i.test(url)) {
        if (!this.roomTxtRequestedNames.includes(name)) {
          this.roomTxtRequestedNames.push(name);
        }
      }
    }
  }

  public getRoomAssetDiagnosticsReport(): Record<string, unknown> {
    const roomLoaderSwfActuallyRequested = this.roomSwfRequestedNames.length > 0;
    const roomLoaderTxtActuallyRequested = this.roomTxtRequestedNames.length > 0;
    const roomLoaderVersionDetected = roomLoaderTxtActuallyRequested
      ? 'old-swf-plus-txt'
      : (roomLoaderSwfActuallyRequested ? 'unknown' : 'unknown');
    const roomLoaderExpectedTxt = roomLoaderVersionDetected === 'old-swf-plus-txt' ? true : null;
    const roomLoaderMetadataSource = roomLoaderTxtActuallyRequested ? 'txt' : 'unknown';
    return {
      exactRoomAssetRequests: [...this.exactRoomAssetRequests],
      roomLoaderRequestedNames: [...this.roomLoaderRequestedNames],
      roomSwfRequestedNames: [...this.roomSwfRequestedNames],
      roomTxtRequestedNames: [...this.roomTxtRequestedNames],
      lastRoomLoaded: this.lastRoomLoaded,
      roomLoaderVersionDetected,
      roomLoaderExpectedTxt,
      roomLoaderSwfActuallyRequested,
      roomLoaderTxtActuallyRequested,
      roomLoaderMetadataSource,
      lastRoomLoadedLoaderVersion: this.lastRoomLoaded && this.roomTxtRequestedNames.includes(this.lastRoomLoaded)
        ? 'old-swf-plus-txt'
        : (this.lastRoomLoaded ? 'unknown' : null),
      anyRequestContainingRoomRoom20: this.anyRequestContainingRoomRoom20,
      anyRequestContainingRoom20: this.anyRequestContainingRoom20
    };
  }

  // Stronger visual state tracking
  private controlPanelVisible: boolean | null = null;
  private controlPanelInitialized: boolean | null = null;
  private avatarCreated: boolean | null = null;
  private localUserCreated: boolean | null = null;
  private loadingScreenHidden: boolean | null = null;

  // New diagnostics
  private missingAssetCounts: Record<string, number> = {};
  private missingMp3Requests: string[] = [];
  private popupOpened: string[] = [];
  private soundRequests: string[] = [];
  private soundServed: string[] = [];
  private soundMissing: string[] = [];
  private soundResolvedPath: Record<string, string> = {};
  private soundContentType: Record<string, string> = {};
  private soundLoadErrorSeen = false;
  private soundLoadSuccessSeen = false;
  private roomSoundConfigField: string | null = null;
  private roomSoundConfigValue: unknown = null;
  private roomSoundExpectedUrl: string | null = null;
  private roomSoundRequested = false;
  private roomSoundServed = false;
  private roomSoundLoadError = false;
  private roomSoundPlayAttemptSeen = false;
  private roomSoundChannelCreated = false;
  private roomSoundLoopRequested: number | boolean | null = null;
  private roomSoundVolume: number | null = null;
  private roomSoundMuted: boolean | null = null;
  private roomSoundStoppedOnTransition = false;
  private roomSoundStartedAfterTransition = false;
  private lastRoomSoundRoomName: string | null = null;
  private roomBackSoundVarSent = false;
  private roomBackSoundVarValue: string | null = null;
  private roomBackSoundExpectedUrl: string | null = null;
  private roomBackSoundExpectedRequestUrl: string | null = null;
  private roomBackSoundRequested = false;
  private roomBackSoundServed = false;
  private roomBackSoundLoadError = false;
  private roomBackSoundPlayAttemptSeen = false;
  private roomBackSoundStarted = false;
  private roomBackSoundStoppedOnTransition = false;
  private roomBackSoundVolume: number | null = null;
  private roomBackSoundLoop: number | boolean | null = null;
  private lastRoomBackSoundRoomName: string | null = null;
  private roomBackSoundActualRequestUrl: string | null = null;
  private roomBackSoundMalformedRequestUrl: string | null = null;
  private roomBackSoundRequestSeen = false;
  private roomBackSoundPlayCalled = false;
  private roomBackSoundChannelNonNull = false;
  private roomBackSoundAudibleLikely = false;
  private roomBackSoundStoppedImmediately = false;
  private avatarCreationErrorSeen = false;
  private controlPanelInitErrorSeen = false;

  // Client-side SFS/Avatar events observed via traces/logs
  private roomChangeEventSeen = false;
  private userAddedEventSeen = false;
  private avatarEventTraces: string[] = [];
  private socketConnectAttemptSeen = false;
  private socketFallbackToBlueBoxSeen = false;
  private missingWebSocketProxySeen = false;
  private socketFailureTraces: Array<{ msg: string; ts: number }> = [];

  // ExternalInterface timing diagnostics
  private externalInterfaceHookCounts: Record<string, number> = {};
  private externalInterfaceHookMaxDurationMs: Record<string, number> = {};
  private externalInterfaceHookTimingSamples: Array<{
    hook: string;
    durationMs: number;
    ts: number;
    msg?: string;
  }> = [];
  private maxExternalInterfaceHookTimingSamples = 100;

  // Localization/Language Diagnostics
  private languageAssetRequests: string[] = [];
  private languageAssetMissing: string[] = [];
  private languageAssetServed: string[] = [];
  private lastLanguageXmlKeys = 0;
  private lastLangIdRequested: string | null = null;
  private missingLocalizationKeys: string[] = [];
  private serverNameHoverText: string | null = 'שרת שימור מקומי';
  private languageSectionsPresent: Record<string, boolean> = {};
  private compatLoadingScreenTextMode: 'off' | 'plain' | 'fallback-plain' | 'simple' | 'empty' | 'minimal-tlf' = 'off';
  private compatLoadingScreenTextApplied = false;
  private compatLoadingScreenOriginalWasTlf = false;
  private compatLoadingScreenOriginalLength = 0;
  private compatLoadingScreenExtractedPlainText: string | null = null;
  private compatLoadingScreenReplacementLength = 0;
  private loadingScreenCompatResolvedMessage: string | null = null;
  private loadingScreenCompatResolvedMessageLength = 0;
  private loadingScreenCompatResolvedMessagePreview: string | null = null;
  private fontClassCreateTextLayoutInputKind: 'tlf' | 'plain' | 'empty' | 'unknown' = 'unknown';
  private fontClassCreateTextLayoutInputLength = 0;
  private loadingScreenInputModeActuallyUsed: string | null = null;
  private fontClassCreateTextLayoutReturnedObjectType: string | null = null;
  private loadingScreenCreateTextLayoutReturnedNull: boolean | null = null;
  private loadingScreenCreateTextLayoutError: string | null = null;
  private loadingScreenTextAddedToDisplayList: boolean | null = null;
  private loadingScreenTextDisplayObjectBounds: Record<string, unknown> | null = null;
  private loadingScreenTextAlphaVisible: boolean | null = null;
  private loadingScreenTextEnvelopeBuilt = false;
  private loadingScreenTextEnvelopeSource: string | null = null;
  private loadingScreenTextEnvelopeCandidateCount = 0;
  private loadingScreenTextEnvelopePreviewSafe: string | null = null;
  private loadingScreenTextEnvelopeDecoded = false;
  private loadingScreenTextSelectedPreview: string | null = null;
  private loadingScreenTextEnvelopeDecodeError: string | null = null;
  private loadingScreenTextCompatShimConfigured = false;
  private loadingScreenTextCompatFallbackTextLength = 0;

  // Loading Screen TextField Compat Shim
  private loadingScreenTextCompatShimEnabled = false;
  private loadingScreenTextFieldCompatApplied = false;
  private loadingScreenTextRenderPath: 'tlf' | 'textfield-compat' | 'unknown' = 'unknown';
  private loadingScreenTextFieldCompatReason: string | null = null;
  private loadingScreenTextFieldBoundsBefore: string | null = null;
  private loadingScreenTextFieldBoundsAfter: string | null = null;
  private loadingScreenTextFieldTextLength: number | null = null;
  private loadingScreenTextFieldFont: string | null = null;
  private loadingScreenTextFieldColor: string | null = null;
  private loadingScreenTextCallStackMatched: boolean | null = null;

  // Ruffle page/font config (set at page-serve time from ServerConfig)
  private rufflePageConfig: {
    hebrewFontWorkaroundEnabled: boolean;
    rendererPreference: string;
  } = { hebrewFontWorkaroundEnabled: false, rendererPreference: 'auto' };

  private ruffleFontSources: string[] = [];
  private ruffleDefaultFonts: Record<string, string[]> = {};
  private ruffleDeviceFontRenderer: string | null = null;
  private fontSourceRequests: string[] = [];
  private fontSourceServed: string[] = [];
  private fontSourceMissing: string[] = [];

  // Canvas text rendering diagnostics
  private canvasTextInterceptorActive = false;
  private canvasTextTotalDrawCount = 0;
  private canvasHebrewTextDrawCount = 0;
  private canvasTextFontsSeen: Record<string, number> = {};
  private canvasTextMethodCounts: Record<string, number> = {};
  private canvasHebrewTextSamples: CanvasHebrewTextSample[] = [];
  private maxCanvasHebrewTextSamples = 100;

  // Browser-side diagnostic transport health
  private diagnosticReportFailedCount = 0;
  private lastDiagnosticReportFailedAt: number | null = null;
  private lastDiagnosticReportFailureMessage: string | null = null;

  // Narrow mixed-version UserExperience constructor compatibility shim diagnostics.
  private userExperienceCtorShimEnabled = false;
  private userExperienceCtorShimAppliedCount = 0;
  private userExperienceCtorShimSkippedCount = 0;
  private lastUserExperienceCtorShimAt: number | null = null;
  private lastUserExperienceCtorShimSkipReason: string | null = null;
  private lastUserExperienceCtorShimArgTypes: string[] = [];
  private lastUserExperienceCtorShimDroppedArgType: string | null = null;
  private lastUserExperienceCtorShimArgValuesPreview: Record<string, string> = {};
  private lastUserExperienceCtorShimTextFieldScoreApplied: boolean | null = null;
  private textFlowEditorCtorShimEnabled = false;
  private textFlowEditorCtorShimAppliedCount = 0;
  private textFlowEditorCtorShimSkippedCount = 0;
  private lastTextFlowEditorCtorShimAt: number | null = null;
  private lastTextFlowEditorCtorShimSkipReason: string | null = null;
  private lastTextFlowEditorCtorShimArgTypes: string[] = [];
  private lastTextFlowEditorCtorShimArgValuesPreview: Record<string, string> = {};
  private lastTextFlowEditorCtorShimDroppedArgTypes: string[] = [];
  private lastTextFlowEditorCtorShimCallSiteMethod: string | null = null;
  private lastTextFlowEditorCtorShimCallerSwf: string | null = null;
  private textFlowEditorCtorMismatchSeen = false;
  private textFlowEditorCtorMismatchReceiverClassLoadedFromSwf: string | null = null;
  private buttonDataGridClearShimEnabled = false;
  private buttonDataGridClearShimAppliedCount = 0;
  private buttonDataGridClearShimMode: string | null = null;
  private buttonDataGridClearShimFallbackReason: string | null = null;
  private lastButtonDataGridClearShimAt: number | null = null;
  private lastButtonDataGridClearShimReceiverClass: string | null = null;
  private lastButtonDataGridClearShimCallerSwf: string | null = null;
  private lastButtonDataGridClearShimCallSiteMethod: string | null = null;
  private buttonDataGridClearShimRemovedMcItems = false;
  private buttonDataGridClearShimRecreatedMcItems = false;
  private buttonDataGridClearShimResetSelectedItem = false;
  private personalCardDestroyErrorSeen = false;
  private personalCardDestroyErrorClass: string | null = null;
  private personalCardDestroyErrorMessage: string | null = null;
  private personalCardDestroyErrorMethod: string | null = null;
  private lastMogoWallTabBeforeDestroy: string | null = null;
  private lastMogoWallTabAfterDestroy: string | null = null;
  private lastMogoWallTabClickName: string | null = null;
  private lastMogoWallTabClickIndex: number | null = null;
  private lastMogoWallViewBeforeSwitch: string | null = null;
  private lastMogoWallViewAfterSwitch: string | null = null;
  private lastMogoWallDestroyViewCalled = false;
  private lastMogoWallDestroyViewErrorSeen = false;
  private lastMogoWallDestroyViewErrorMessage: string | null = null;
  private lastMogoWallAddViewCalled: string | null = null;
  private lastMogoWallAddViewErrorSeen = false;
  private lastMogoWallAddViewErrorMessage: string | null = null;
  private lastMogoWallCommandExpectedAfterTab: string | null = null;
  private lastMogoWallCommandActuallySentAfterTab: string | null = null;
  private anyMogoWallMouseClickSeen = false;
  private clickedDisplayObjectClass: string | null = null;
  private clickedDisplayObjectName: string | null = null;
  private clickedDisplayObjectPath: string | null = null;
  private clickedTooltipText: string | null = null;
  private clickedTabButtonIndexRaw: number | null = null;
  private clickedTabButtonMappedPage: number | null = null;
  private gotoPageCalled = false;
  private gotoPageIndex: number | null = null;
  private requestTabViewCalled = false;
  private requestTabViewIndex: number | null = null;
  private requestTabViewResolvedName: string | null = null;
  private tabButtonEnabled: string | null = null;
  private tabButtonMouseEnabled: string | null = null;
  private tabButtonVisible: string | null = null;
  private tabButtonAlpha: string | null = null;
  private tabButtonHitTestBlockedBy: string | null = null;
  private tabClickExceptionSeen = false;
  private tabClickExceptionClass: string | null = null;
  private tabClickExceptionMessage: string | null = null;
  private tabClickExceptionMethod: string | null = null;
  private composeTabClickedSeen = false;
  private addComposeViewCalled = false;
  private wallComposeViewInitCalled = false;
  private wallComposeViewInitContentCalled = false;
  private wallComposeViewInitFriendListCalled = false;
  private wallComposeViewInitTemplatesCalled = false;
  private wallComposeViewRequestTemplatesCalled = false;
  private wallComposeViewTemplatesRequestExpected = false;
  private wallComposeViewTemplatesRequestSent = false;
  private wallComposeViewInventoryRequestCount = 0;
  private wallComposeViewInventoryResponseSeen = false;
  private wallComposeViewInventoryParsedOk: boolean | null = null;
  private lastInventoryResponseShapeKeys: string[] = [];
  private lastInventoryItemShapeKeys: string[] = [];
  private composeTabNetworkCommandSent = false;
  private personalTabClickedSeen = false;
  private personalTabExitAttemptSeen = false;
  private mogoWallCloseClickedSeen = false;
  private mogoWallCloseHandlerEntered = false;
  private mogoWallCloseCurrentViewClass: string | null = null;
  private mogoWallCloseCurrentTabName: string | null = null;
  private mogoWallCloseDestroyViewCalled = false;
  private mogoWallCloseRemovePopupCalled = false;
  private mogoWallCloseOverlayRemoved: string | null = null;
  private mogoWallCloseStageChildrenBefore: number | null = null;
  private mogoWallCloseStageChildrenAfter: number | null = null;
  private mogoWallCloseBlockedStateRemaining: string | null = null;
  private mogoWallCloseExceptionSeen = false;
  private mogoWallCloseExceptionMessage: string | null = null;
  private mogoWallLocalExceptionSeen = false;
  private mogoWallLocalExceptionClass: string | null = null;
  private mogoWallLocalExceptionMessage: string | null = null;
  private mogoWallLocalExceptionMethod: string | null = null;
  private mogoWallCompatibilityMismatchSeen = false;
  private magicButtonSeen = false;
  private controlPanelMethodsSeen: string[] = [];
  private controlPanelButtonClickSeen = false;
  private controlPanelClickedButtonName: string | null = null;
  private controlPanelClickedButtonPath: string | null = null;
  private controlPanelClickedButtonTooltip: string | null = null;
  private specialMoveInitSeen = false;
  private specialEffectInitSeen = false;
  private specialHolderName: string | null = null;
  private specialHolderVisibleAtInit: string | null = null;
  private specialHolderVisibleAfterClick: string | null = null;
  private specialHolderMouseEnabled: string | null = null;
  private specialHolderMouseChildren: string | null = null;
  private specialInnerButtonCount: number | null = null;
  private specialInnerButtonNames: string[] = [];
  private specialInnerButtonMouseEnabledList: string[] = [];
  private specialInnerButtonVisibleList: string[] = [];
  private controlPanelEffectConfigRequested = false;
  private controlPanelEffectConfigServed = false;
  private controlPanelEffectConfigResolvedPath: string | null = null;
  private controlPanelEffectButtonRequests: string[] = [];
  private controlPanelEffectButtonServed: string[] = [];
  private controlPanelEffectButtonMissing: string[] = [];
  private controlPanelSwfRequestedUrl: string | null = null;
  private controlPanelSwfResolvedPath: string | null = null;
  private controlPanelSwfServed = false;
  private controlPanelSwfHash: string | null = null;
  private controlPanelSwfCandidateHashes: Record<string, string | null> = {};
  private controlPanelTxtParsed = false;
  private controlPanelTxtEffectNames: string[] = [];
  private controlPanelTxtExpectedButtonUrls: string[] = [];
  private controlPanelTxtExpectedLinkageNames: string[] = [];
  private controlPanelTxtMissingButtonFiles: string[] = [];
  private controlPanelTxtFieldsSeen: string[] = [];
  private controlPanelAssetBridgeApplied = false;
  private controlPanelAssetBridgeReason: string | null = null;
  private controlPanelAssetVersionMismatchLikely = false;
  private controlPanelExpectedConfigPath: string | null = null;
  private controlPanelExpectedEffectButtonPathPattern: string | null = null;
  private controlPanelResolvedConfigPath: string | null = null;
  private controlPanelResolvedEffectsDir: string | null = null;
  private specialInnerButtonClickSeen = false;
  private specialInnerButtonClickedName: string | null = null;
  private specialInnerButtonClickedPath: string | null = null;
  private magicCompatShimApplied = false;
  private magicCompatShimReason: string | null = null;
  private magicDoEffectOriginalHandler: string | null = null;
  private magicDoEffectCompatHandler: string | null = null;
  private magicDoEffectRegistrationsSeen: string[] = [];
  private magicDoEffectRegistrationCount = 0;
  private magicControlPanelShimConfigured: boolean | null = null;
  private magicControlPanelShimBuilderReceived: boolean | null = null;
  private magicControlPanelShimPlayerBuilderReceived: boolean | null = null;
  private magicControlPanelShimPlayerConstructed: boolean | null = null;
  private magicControlPanelShimEventDispatcherFlag: boolean | null = null;
  private onEffectSendSeen = false;
  private onSpecialMoveSendSeen = false;
  private effectOnClickSeen = false;
  private specialEffectControlOnSelectEffectSeen = false;
  private magicButtonVisible: string | null = null;
  private magicButtonEnabled: string | null = null;
  private magicButtonMouseEnabled: string | null = null;
  private magicButtonMouseChildren: string | null = null;
  private magicButtonTooltipText: string | null = null;
  private magicPanelSeen = false;
  private magicPanelVisible: string | null = null;
  private magicPanelInitiallyOpen: boolean | null = null;
  private magicPanelOpenState: string | null = null;
  private magicPanelExpectedClosedAtStartup: boolean | null = null;
  private magicPanelParentPath: string | null = null;
  private magicPanelBounds: string | null = null;
  private magicPanelAlpha: string | null = null;
  private magicPanelMouseEnabled: string | null = null;
  private magicPanelMouseChildren: string | null = null;
  private magicButtonClickSeen = false;
  private magicButtonMouseDownSeen = false;
  private magicButtonMouseUpSeen = false;
  private magicButtonClickTargetClass: string | null = null;
  private magicButtonClickTargetName: string | null = null;
  private magicButtonClickTargetPath: string | null = null;
  private magicPanelClickSeen = false;
  private magicInnerButtonClickSeen = false;
  private magicInnerButtonTargetClass: string | null = null;
  private magicInnerButtonTargetName: string | null = null;
  private magicInnerButtonTargetPath: string | null = null;
  private magicInnerButtonIndex: number | null = null;
  private magicInnerButtonEnabled: string | null = null;
  private magicInnerButtonMouseEnabled: string | null = null;
  private magicInnerButtonVisible: string | null = null;
  private magicInnerButtonAlpha: string | null = null;
  private magicClickBlockedByClass: string | null = null;
  private magicClickBlockedByName: string | null = null;
  private magicClickBlockedByPath: string | null = null;
  private magicHitTestTopObjectClass: string | null = null;
  private magicHitTestTopObjectName: string | null = null;
  private controlPanelHitTestTopObjectClass: string | null = null;
  private controlPanelHitTestTopObjectName: string | null = null;
  private controlPanelHitTestTopObjectPath: string | null = null;
  private controlPanelHitTestTopObjectBounds: string | null = null;
  private controlPanelHitTestAncestorChain: string | null = null;
  private controlPanelClickBlockedByClass: string | null = null;
  private controlPanelClickBlockedByName: string | null = null;
  private controlPanelClickBlockedByPath: string | null = null;
  private controlPanelBounds: string | null = null;
  private magicButtonBounds: string | null = null;
  private magicButtonGlobalBounds: string | null = null;
  private popupLayerTopObject: string | null = null;
  private popupLayerBlocksControlPanel: boolean | null = null;
  private activePopupClassName: string | null = null;
  private activePopupMouseEnabled: string | null = null;
  private activePopupMouseChildren: string | null = null;
  private magicLocalExceptionSeen = false;
  private magicLocalExceptionClass: string | null = null;
  private magicLocalExceptionMessage: string | null = null;
  private magicLocalExceptionMethod: string | null = null;
  private currentExecutingAvm2Method: string | null = null;
  private magicCommandSent = false;
  private magicCommandName: string | null = null;
  private magicCommandPayloadDecoded: Record<string, unknown> | null = null;
  private magicCommandResponseSeen = false;
  private magicCommandResponseShape: string | null = null;
  private magicUnhandledCommandSeen = false;
  private magicUnhandledCommandName: string | null = null;
  private mismatchCallerSwf: string | null = null;
  private mismatchCallerClass: string | null = null;
  private mismatchCallerMethod: string | null = null;
  private mismatchExpectedReceiverClass: string | null = null;
  private mismatchMissingMethod: string | null = null;
  private mismatchReceiverClassLoadedFromSwf: string | null = null;
  private mismatchReceiverClassDefiningMovie: string | null = null;
  private mismatchLikelyCause: string | null = null;
  private mismatchSuggestedAction: string | null = null;

  // RTL Text Workaround diagnostics
  private rtlTextWorkaroundEnabled = false;
  private rtlWrappedStringCount = 0;
  private rtlWrapMode: 'RLE' | 'RLM' | 'VISUAL_REVERSE' = 'RLE';
  private sampleRtlWrappedKeys: string[] = [];
  private rtlTextMode: 'wrap' | 'visual-reverse' = 'wrap';
  private rtlVisualReverseCount = 0;
  private sampleVisualReverseBeforeAfter: Array<{ key: string; before: string; after: string }> = [];
  private rtlTransformScope: 'all' | 'selected-keys' = 'selected-keys';
  private rtlAllowlistedKeys: string[] = [];
  private rtlTransformedKeys: string[] = [];
  private rtlSkippedBecauseNotAllowlisted: string[] = [];

  public recordRtlTextWorkaroundConfig(
    enabled: boolean,
    mode: 'RLE' | 'RLM' | 'VISUAL_REVERSE',
    scope: 'all' | 'selected-keys' = 'selected-keys',
    allowlistedKeys: string[] = []
  ): void {
    this.rtlTextWorkaroundEnabled = enabled;
    this.rtlWrapMode = mode;
    this.rtlTextMode = mode === 'VISUAL_REVERSE' ? 'visual-reverse' : 'wrap';
    this.rtlTransformScope = scope;
    this.rtlAllowlistedKeys = [...allowlistedKeys];
  }

  public recordRtlTextWorkaround(count: number, sampleKeys: string[]): void {
    this.rtlWrappedStringCount += count;
    for (const key of sampleKeys) {
      if (!this.sampleRtlWrappedKeys.includes(key)) {
        this.sampleRtlWrappedKeys.push(key);
        // Cap sample keys list to prevent excessive growth (e.g. max 50)
        if (this.sampleRtlWrappedKeys.length > 50) {
          this.sampleRtlWrappedKeys.shift();
        }
      }
    }
  }

  public recordRtlVisualReverse(
    count: number,
    transformedKeys: string[],
    skippedKeys: string[],
    samples: Array<{ key: string; before: string; after: string }>
  ): void {
    this.rtlVisualReverseCount += count;
    for (const key of transformedKeys) {
      if (!this.rtlTransformedKeys.includes(key)) {
        this.rtlTransformedKeys.push(key);
        if (this.rtlTransformedKeys.length > 100) {
          this.rtlTransformedKeys.shift();
        }
      }
    }
    for (const key of skippedKeys) {
      if (!this.rtlSkippedBecauseNotAllowlisted.includes(key)) {
        this.rtlSkippedBecauseNotAllowlisted.push(key);
        if (this.rtlSkippedBecauseNotAllowlisted.length > 100) {
          this.rtlSkippedBecauseNotAllowlisted.shift();
        }
      }
    }
    for (const sample of samples) {
      if (!this.sampleVisualReverseBeforeAfter.some(s => s.key === sample.key)) {
        this.sampleVisualReverseBeforeAfter.push(sample);
        // Cap sample list to prevent excessive growth (e.g. max 50)
        if (this.sampleVisualReverseBeforeAfter.length > 50) {
          this.sampleVisualReverseBeforeAfter.shift();
        }
      }
    }
  }

  public isRoom20PageViewSeen(): boolean { return this.room20PageViewSeen; }
  public isControlPanelVisible(): boolean | null { return this.controlPanelVisible; }
  public isControlPanelInitialized(): boolean | null { return this.controlPanelInitialized; }
  public isAvatarCreated(): boolean | null { return this.avatarCreated; }
  public isLocalUserCreated(): boolean | null { return this.localUserCreated; }
  public isLoadingScreenHidden(): boolean | null { return this.loadingScreenHidden; }
  public isMcSpecialEffectHolderWarningSeen(): boolean { return this.mcSpecialEffectHolderWarningSeen; }
  public isRoomChangeEventSeen(): boolean { return this.roomChangeEventSeen; }
  public isUserAddedEventSeen(): boolean { return this.userAddedEventSeen; }
  public getAvatarEventTraces(): string[] { return [...this.avatarEventTraces]; }
  public getSocketDiagnostics(): Record<string, unknown> {
    return {
      socketConnectAttemptSeen: this.socketConnectAttemptSeen,
      socketFallbackToBlueBoxSeen: this.socketFallbackToBlueBoxSeen,
      missingWebSocketProxySeen: this.missingWebSocketProxySeen,
      socketFailureTraces: [...this.socketFailureTraces]
    };
  }
  public getLastPopupClassName(): string | null {
    const popups = this.trackEvents.filter(e => e.category === 'Popup');
    return popups.length > 0 ? popups[popups.length - 1].action : null;
  }

  public getMissingAssetCounts(): Record<string, number> {
    return { ...this.missingAssetCounts };
  }

  public getMissingMp3Requests(): string[] {
    return [...this.missingMp3Requests];
  }

  public getPopupOpened(): string[] {
    return [...this.popupOpened];
  }

  public isSoundLoadErrorSeen(): boolean {
    return this.soundLoadErrorSeen;
  }

  public isSoundLoadSuccessSeen(): boolean {
    return this.soundLoadSuccessSeen;
  }

  public getSoundDiagnostics(): Record<string, unknown> {
    this.updateRoomSoundRequestState();
    return {
      soundRequests: [...this.soundRequests],
      soundServed: [...this.soundServed],
      soundMissing: [...this.soundMissing],
      soundResolvedPath: { ...this.soundResolvedPath },
      soundContentType: { ...this.soundContentType },
      soundLoadErrorSeen: this.soundLoadErrorSeen,
      soundLoadSuccessSeen: this.soundLoadSuccessSeen,
      roomSoundConfigField: this.roomSoundConfigField,
      roomSoundConfigValue: this.roomSoundConfigValue,
      roomSoundExpectedUrl: this.roomSoundExpectedUrl,
      roomSoundRequested: this.roomSoundRequested,
      roomSoundServed: this.roomSoundServed,
      roomSoundLoadError: this.roomSoundLoadError,
      roomSoundPlayAttemptSeen: this.roomSoundPlayAttemptSeen,
      roomSoundChannelCreated: this.roomSoundChannelCreated,
      roomSoundLoopRequested: this.roomSoundLoopRequested,
      roomSoundVolume: this.roomSoundVolume,
      roomSoundMuted: this.roomSoundMuted,
      roomSoundStoppedOnTransition: this.roomSoundStoppedOnTransition,
      roomSoundStartedAfterTransition: this.roomSoundStartedAfterTransition,
      lastRoomSoundRoomName: this.lastRoomSoundRoomName,
      roomBackSoundVarSent: this.roomBackSoundVarSent,
      roomBackSoundVarValue: this.roomBackSoundVarValue,
      roomBackSoundExpectedUrl: this.roomBackSoundExpectedUrl,
      roomBackSoundExpectedRequestUrl: this.roomBackSoundExpectedRequestUrl,
      roomBackSoundRequested: this.roomBackSoundRequested,
      roomBackSoundServed: this.roomBackSoundServed,
      roomBackSoundLoadError: this.roomBackSoundLoadError,
      roomBackSoundPlayAttemptSeen: this.roomBackSoundPlayAttemptSeen,
      roomBackSoundStarted: this.roomBackSoundStarted,
      roomBackSoundStoppedOnTransition: this.roomBackSoundStoppedOnTransition,
      roomBackSoundVolume: this.roomBackSoundVolume,
      roomBackSoundLoop: this.roomBackSoundLoop,
      lastRoomBackSoundRoomName: this.lastRoomBackSoundRoomName,
      roomBackSoundActualRequestUrl: this.roomBackSoundActualRequestUrl,
      roomBackSoundMalformedRequestUrl: this.roomBackSoundMalformedRequestUrl,
      roomBackSoundRequestSeen: this.roomBackSoundRequestSeen,
      roomBackSoundPlayCalled: this.roomBackSoundPlayCalled,
      roomBackSoundChannelNonNull: this.roomBackSoundChannelNonNull,
      roomBackSoundAudibleLikely: this.roomBackSoundAudibleLikely,
      roomBackSoundStoppedImmediately: this.roomBackSoundStoppedImmediately
    };
  }

  public isAvatarCreationErrorSeen(): boolean {
    return this.avatarCreationErrorSeen;
  }

  public isControlPanelInitErrorSeen(): boolean {
    return this.controlPanelInitErrorSeen;
  }

  public recordControlPanelAssetRequest(url: string, served?: boolean, resolvedPath?: string): void {
    const normalized = url.replace(/\\/g, '/');
    const lower = normalized.toLowerCase();
    const resolvedNormalized = (resolvedPath || '').replace(/\\/g, '/');
    const resolvedLower = resolvedNormalized.toLowerCase();
    if (lower.includes('controlpanel.swf') || lower.includes('controlpanel-old.swf') || lower.includes('controlpanelpetsm.swf')) {
      if (lower.includes('controlpanel.swf') && !lower.includes('controlpanel-old.swf') && !lower.includes('controlpanelpetsm.swf')) {
        this.controlPanelSwfRequestedUrl = normalized;
        this.controlPanelSwfServed = served === true || this.controlPanelSwfServed;
        this.controlPanelSwfResolvedPath = resolvedPath || this.controlPanelSwfResolvedPath;
      }
    }
    if (
      lower.includes('/swf/assetsclean/controlpanel/controlpanel.txt') ||
      lower.endsWith('swf/assetsclean/controlpanel/controlpanel.txt') ||
      resolvedLower.endsWith('swf/assetsclean/controlpanel/controlpanel.txt')
    ) {
      this.controlPanelEffectConfigRequested = true;
      if (served === true) {
        this.controlPanelEffectConfigServed = true;
        this.controlPanelEffectConfigResolvedPath = resolvedPath || this.controlPanelEffectConfigResolvedPath;
      }
      return;
    }

    if (
      (lower.includes('/swf/assetsclean/controlpanel/effects/btn') && lower.endsWith('.swf')) ||
      (resolvedLower.includes('swf/assetsclean/controlpanel/effects/btn') && resolvedLower.endsWith('.swf'))
    ) {
      if (!this.controlPanelEffectButtonRequests.includes(normalized)) {
        this.controlPanelEffectButtonRequests.push(normalized);
      }
      if (served === true) {
        if (!this.controlPanelEffectButtonServed.includes(normalized)) {
          this.controlPanelEffectButtonServed.push(normalized);
        }
      } else if (served === false && !this.controlPanelEffectButtonMissing.includes(normalized)) {
        this.controlPanelEffectButtonMissing.push(normalized);
      }
    }
  }

  public recordControlPanelSwfDiagnostics(details: {
    requestedUrl?: string | null;
    resolvedPath?: string | null;
    served?: boolean;
    hash?: string | null;
    candidateHashes?: Record<string, string | null>;
  }): void {
    if (details.requestedUrl) this.controlPanelSwfRequestedUrl = details.requestedUrl.replace(/\\/g, '/');
    if (details.resolvedPath) this.controlPanelSwfResolvedPath = details.resolvedPath.replace(/\\/g, '/');
    if (details.served !== undefined) this.controlPanelSwfServed = details.served;
    if (details.hash !== undefined) this.controlPanelSwfHash = details.hash;
    if (details.candidateHashes) this.controlPanelSwfCandidateHashes = { ...details.candidateHashes };
  }

  public recordControlPanelTxtDiagnostics(details: {
    parsed: boolean;
    effectNames?: string[];
    expectedButtonUrls?: string[];
    expectedLinkageNames?: string[];
    missingButtonFiles?: string[];
    fieldsSeen?: string[];
  }): void {
    this.controlPanelTxtParsed = details.parsed;
    this.controlPanelTxtEffectNames = [...(details.effectNames || [])];
    this.controlPanelTxtExpectedButtonUrls = [...(details.expectedButtonUrls || [])];
    this.controlPanelTxtExpectedLinkageNames = [...(details.expectedLinkageNames || [])];
    this.controlPanelTxtMissingButtonFiles = [...(details.missingButtonFiles || [])];
    this.controlPanelTxtFieldsSeen = [...(details.fieldsSeen || [])];
  }

  public recordControlPanelAssetBridge(details: {
    applied: boolean;
    reason?: string | null;
    versionMismatchLikely?: boolean;
    expectedConfigPath?: string | null;
    expectedEffectButtonPathPattern?: string | null;
    resolvedConfigPath?: string | null;
    resolvedEffectsDir?: string | null;
  }): void {
    if (details.applied) this.controlPanelAssetBridgeApplied = true;
    this.controlPanelAssetBridgeReason = details.reason || this.controlPanelAssetBridgeReason;
    this.controlPanelAssetVersionMismatchLikely = details.versionMismatchLikely ?? this.controlPanelAssetVersionMismatchLikely;
    this.controlPanelExpectedConfigPath = details.expectedConfigPath || this.controlPanelExpectedConfigPath;
    this.controlPanelExpectedEffectButtonPathPattern = details.expectedEffectButtonPathPattern || this.controlPanelExpectedEffectButtonPathPattern;
    this.controlPanelResolvedConfigPath = details.resolvedConfigPath || this.controlPanelResolvedConfigPath;
    this.controlPanelResolvedEffectsDir = details.resolvedEffectsDir || this.controlPanelResolvedEffectsDir;
  }

  public getControlPanelAssetDiagnostics(): Record<string, unknown> {
    return {
      controlPanelEffectConfigRequested: this.controlPanelEffectConfigRequested,
      controlPanelEffectConfigServed: this.controlPanelEffectConfigServed,
      controlPanelEffectConfigResolvedPath: this.controlPanelEffectConfigResolvedPath,
      controlPanelEffectButtonRequests: [...this.controlPanelEffectButtonRequests],
      controlPanelEffectButtonServed: [...this.controlPanelEffectButtonServed],
      controlPanelEffectButtonMissing: [...this.controlPanelEffectButtonMissing],
      controlPanelSwfRequestedUrl: this.controlPanelSwfRequestedUrl,
      controlPanelSwfResolvedPath: this.controlPanelSwfResolvedPath,
      controlPanelSwfServed: this.controlPanelSwfServed,
      controlPanelSwfHash: this.controlPanelSwfHash,
      controlPanelSwfCandidateHashes: { ...this.controlPanelSwfCandidateHashes },
      controlPanelTxtParsed: this.controlPanelTxtParsed,
      controlPanelTxtEffectNames: [...this.controlPanelTxtEffectNames],
      controlPanelTxtExpectedButtonUrls: [...this.controlPanelTxtExpectedButtonUrls],
      controlPanelTxtExpectedLinkageNames: [...this.controlPanelTxtExpectedLinkageNames],
      controlPanelTxtMissingButtonFiles: [...this.controlPanelTxtMissingButtonFiles],
      controlPanelTxtFieldsSeen: [...this.controlPanelTxtFieldsSeen],
      controlPanelAssetBridgeApplied: this.controlPanelAssetBridgeApplied,
      controlPanelAssetBridgeReason: this.controlPanelAssetBridgeReason,
      controlPanelAssetVersionMismatchLikely: this.controlPanelAssetVersionMismatchLikely,
      controlPanelExpectedConfigPath: this.controlPanelExpectedConfigPath,
      controlPanelExpectedEffectButtonPathPattern: this.controlPanelExpectedEffectButtonPathPattern,
      controlPanelResolvedConfigPath: this.controlPanelResolvedConfigPath,
      controlPanelResolvedEffectsDir: this.controlPanelResolvedEffectsDir
    };
  }

  public recordMissingAsset(url: string): void {
    const extMatch = url.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'unknown';
    this.missingAssetCounts[ext] = (this.missingAssetCounts[ext] || 0) + 1;

    if (ext === 'mp3') {
      this.recordSoundMissing(url);
    }
  }

  public recordSoundRequest(url: string): void {
    if (!this.soundRequests.includes(url)) {
      this.soundRequests.push(url);
    }
    this.recordPotentialRoomBackSoundRequest(url);
    this.updateRoomSoundRequestState();
  }

  public recordRoomBackSoundVarSent(roomName: string, value: string, expectedUrl: string, expectedRequestUrl: string): void {
    this.roomBackSoundVarSent = true;
    this.roomBackSoundVarValue = value;
    this.roomBackSoundExpectedUrl = expectedUrl;
    this.roomBackSoundExpectedRequestUrl = expectedRequestUrl;
    this.roomBackSoundRequested = false;
    this.roomBackSoundServed = false;
    this.roomBackSoundLoadError = false;
    this.roomBackSoundPlayAttemptSeen = false;
    this.roomBackSoundStarted = false;
    this.roomBackSoundVolume = null;
    this.roomBackSoundLoop = true;
    this.lastRoomBackSoundRoomName = roomName;
    this.roomBackSoundActualRequestUrl = null;
    this.roomBackSoundMalformedRequestUrl = null;
    this.roomBackSoundRequestSeen = false;
    this.roomBackSoundPlayCalled = false;
    this.roomBackSoundChannelNonNull = false;
    this.roomBackSoundAudibleLikely = false;
    this.roomBackSoundStoppedImmediately = false;
    this.updateRoomSoundRequestState();
  }

  public recordPotentialRoomBackSoundRequest(url: string): void {
    if (!this.roomBackSoundVarSent || !this.roomBackSoundVarValue) return;
    const lowerUrl = url.toLowerCase();
    const expectedRequest = this.roomBackSoundExpectedRequestUrl?.toLowerCase() || null;
    const value = this.roomBackSoundVarValue;
    const basename = value.split('/').pop()?.toLowerCase() || value.toLowerCase();
    if (expectedRequest && lowerUrl === expectedRequest) {
      this.roomBackSoundRequestSeen = true;
      this.roomBackSoundActualRequestUrl = url;
      return;
    }
    if (basename && lowerUrl.includes(basename)) {
      this.roomBackSoundActualRequestUrl = url;
      if (expectedRequest && lowerUrl !== expectedRequest) {
        this.roomBackSoundMalformedRequestUrl = url;
      }
    }
  }

  public recordRoomBackSoundAudioEvent(event: {
    type: 'buffer-source-start' | 'buffer-source-stop' | 'html-media-play';
    recentMp3Urls?: string[];
    volume?: number | null;
    contextState?: string | null;
    at?: number;
  }): void {
    if (!this.roomBackSoundVarSent) return;
    const expected = this.roomBackSoundExpectedRequestUrl?.toLowerCase() || null;
    const recent = (event.recentMp3Urls || []).map(url => String(url).toLowerCase());
    const related = expected ? recent.includes(expected) : false;
    if (!related) return;

    if (event.type === 'buffer-source-start' || event.type === 'html-media-play') {
      this.roomBackSoundPlayCalled = true;
      this.roomBackSoundPlayAttemptSeen = true;
      this.roomBackSoundChannelNonNull = true;
      if (typeof event.volume === 'number') {
        this.roomBackSoundVolume = event.volume;
      }
      if (event.contextState !== 'suspended') {
        this.roomBackSoundStarted = true;
        if (this.roomBackSoundVolume === null || this.roomBackSoundVolume > 0) {
          this.roomBackSoundAudibleLikely = true;
        }
      }
    } else if (event.type === 'buffer-source-stop') {
      this.roomBackSoundStoppedImmediately = true;
      this.roomBackSoundAudibleLikely = false;
    }
  }

  public recordSoundServed(url: string, resolvedPath: string, contentType: string): void {
    if (!this.soundServed.includes(url)) {
      this.soundServed.push(url);
    }
    this.soundResolvedPath[url] = resolvedPath;
    this.soundContentType[url] = contentType;
    this.soundLoadSuccessSeen = true;
    this.updateRoomSoundRequestState();
  }

  public recordSoundMissing(url: string): void {
    if (!this.missingMp3Requests.includes(url)) {
      this.missingMp3Requests.push(url);
    }
    if (!this.soundMissing.includes(url)) {
      this.soundMissing.push(url);
    }
    this.soundLoadErrorSeen = true;
    this.updateRoomSoundRequestState();
  }

  public recordRoomTextConfig(roomName: string, content: string): void {
    let parsed: any;
    try {
      parsed = JSON.parse(content.replace(/\r/g, ''));
    } catch (_) {
      return;
    }

    const candidateFields = ['rbs', 'bgSound', 'sound', 'music', 'ambient', 'roomSound', 'movSound'];
    const field = candidateFields.find(key => parsed?.[key] !== undefined) || null;
    this.lastRoomSoundRoomName = roomName;
    this.roomSoundConfigField = field;
    this.roomSoundConfigValue = field ? parsed[field] : null;
    this.roomSoundExpectedUrl = null;
    this.roomSoundRequested = false;
    this.roomSoundServed = false;
    this.roomSoundLoadError = false;
    this.roomSoundPlayAttemptSeen = false;
    this.roomSoundChannelCreated = false;
    this.roomSoundLoopRequested = null;
    this.roomSoundVolume = null;
    this.roomSoundMuted = null;
    this.roomSoundStartedAfterTransition = false;

    if (field === 'movSound') {
      const movSound = Array.isArray(parsed.movSound) ? parsed.movSound[0] : parsed.movSound;
      if (typeof movSound === 'string' && movSound.length > 0) {
        this.roomSoundExpectedUrl = `/Sound/${movSound}.mp3`;
        // WalkableScreen registers movSound with SoundManager.add(..., loops=1).
        // Playback is interactive via InteractiveMovieClip, not automatic ambient looping.
        this.roomSoundLoopRequested = 1;
      }
    } else if (field && typeof parsed[field] === 'string' && parsed[field].length > 0) {
      const value = parsed[field];
      this.roomSoundExpectedUrl = value.startsWith('http://') || value.startsWith('https://')
        ? value
        : `/Sound/Rooms/${value}`;
      // BaseRoom background sounds, when present via room vars, are replayed on SOUND_COMPLETE.
      this.roomSoundLoopRequested = true;
    }

    this.updateRoomSoundRequestState();
  }

  private updateRoomSoundRequestState(): void {
    if (!this.roomSoundExpectedUrl && !this.roomBackSoundExpectedUrl) return;
    const normalize = (value: string) => value.toLowerCase().replace(/^https?:\/\/[^/]+/i, '');
    if (this.roomSoundExpectedUrl) {
      const expected = normalize(this.roomSoundExpectedUrl);
      this.roomSoundRequested = this.soundRequests.some(url => normalize(url) === expected);
      this.roomSoundServed = this.soundServed.some(url => normalize(url) === expected);
      this.roomSoundLoadError = this.soundMissing.some(url => normalize(url) === expected);
    }
    if (this.roomBackSoundExpectedUrl) {
      const expected = normalize(this.roomBackSoundExpectedUrl);
      this.roomBackSoundRequested = this.soundRequests.some(url => normalize(url) === expected);
      this.roomBackSoundServed = this.soundServed.some(url => normalize(url) === expected);
      this.roomBackSoundLoadError = this.soundMissing.some(url => normalize(url) === expected);
    }
  }

  public recordRoom20Txt(options: {
    requested?: boolean;
    served?: boolean;
    sizeBytes?: number;
    jsonValid?: boolean;
    topLevelKeys?: string[];
    parseError?: string | null;
  }): void {
    if (options.requested !== undefined) this.room20TxtRequested = options.requested;
    if (options.served !== undefined) this.room20TxtServed = options.served;
    if (options.sizeBytes !== undefined) this.room20TxtSizeBytes = options.sizeBytes;
    if (options.jsonValid !== undefined) this.room20TxtJsonValid = options.jsonValid;
    if (options.topLevelKeys !== undefined) this.room20TxtTopLevelKeys = options.topLevelKeys;
    if (options.parseError !== undefined) this.room20TxtParseError = options.parseError;
  }

  public getRoom20TxtReport() {
    return {
      room20TxtRequested: this.room20TxtRequested,
      room20TxtServed: this.room20TxtServed,
      room20TxtSizeBytes: this.room20TxtSizeBytes,
      room20TxtJsonValid: this.room20TxtJsonValid,
      room20TxtTopLevelKeys: [...this.room20TxtTopLevelKeys],
      room20TxtParseError: this.room20TxtParseError
    };
  }

  public recordMogoWallSwf(requested: boolean, served: boolean): void {
    if (requested) this.mogoWallSwfRequested = true;
    if (served) this.mogoWallSwfServed = true;
  }

  public recordMogoWallTxt(requested: boolean, served: boolean, jsonValid: boolean, configKeys: string[]): void {
    if (requested) this.mogoWallTxtRequested = true;
    if (served) this.mogoWallTxtServed = true;
    if (jsonValid) this.mogoWallTxtJsonValid = true;
    if (configKeys && configKeys.length > 0) this.mogoWallConfigKeys = [...configKeys];
  }

  public getMogoWallReport() {
    return {
      mogoWallSwfRequested: this.mogoWallSwfRequested,
      mogoWallSwfServed: this.mogoWallSwfServed,
      mogoWallTxtRequested: this.mogoWallTxtRequested,
      mogoWallTxtServed: this.mogoWallTxtServed,
      mogoWallTxtJsonValid: this.mogoWallTxtJsonValid,
      mogoWallConfigKeys: [...this.mogoWallConfigKeys]
    };
  }

  public recordLanguageCall(val: string): void {
    this.languageSetCalls.push(val);
  }

  public getLanguageSetCalls(): string[] {
    return [...this.languageSetCalls];
  }

  public recordLanguageAssetRequest(url: string): void {
    if (!this.languageAssetRequests.includes(url)) {
      this.languageAssetRequests.push(url);
    }
  }

  public recordLanguageAssetMissing(url: string): void {
    if (!this.languageAssetMissing.includes(url)) {
      this.languageAssetMissing.push(url);
    }
  }

  public recordLanguageAssetServed(url: string): void {
    if (!this.languageAssetServed.includes(url)) {
      this.languageAssetServed.push(url);
    }
    // Extract and record the lang ID from the URL for visibility in diagnostics
    // e.g. "/servises/lang.aspx?lang=1" -> "1"
    const langMatch = url.match(/lang[=%3D]+([0-9]+)/i);
    if (langMatch) {
      this.lastLangIdRequested = langMatch[1];
    }
  }

  public recordLastLanguageXmlKeys(count: number): void {
    this.lastLanguageXmlKeys = count;
  }

  public recordMissingLocalizationKey(key: string): void {
    if (!this.missingLocalizationKeys.includes(key)) {
      this.missingLocalizationKeys.push(key);
    }
  }

  public recordLanguageSectionsPresent(sections: Record<string, boolean>): void {
    this.languageSectionsPresent = { ...sections };
  }

  public recordCompatLoadingScreenTextTransform(details: {
    mode: 'off' | 'plain' | 'fallback-plain' | 'simple' | 'empty' | 'minimal-tlf';
    applied: boolean;
    originalWasTlf: boolean;
    originalLength: number;
    extractedPlainText: string;
    replacementLength: number;
    resolvedMessage?: string;
    inputKind?: 'tlf' | 'plain' | 'empty' | 'unknown';
    inputLength?: number;
  }): void {
    this.compatLoadingScreenTextMode = details.mode;
    this.compatLoadingScreenTextApplied = details.applied;
    this.compatLoadingScreenOriginalWasTlf = details.originalWasTlf;
    this.compatLoadingScreenOriginalLength = details.originalLength;
    this.compatLoadingScreenExtractedPlainText = details.extractedPlainText;
    this.compatLoadingScreenReplacementLength = details.replacementLength;
    if (details.resolvedMessage !== undefined) {
      this.loadingScreenCompatResolvedMessage = details.resolvedMessage;
      this.loadingScreenCompatResolvedMessageLength = details.resolvedMessage.length;
      this.loadingScreenCompatResolvedMessagePreview = details.resolvedMessage.slice(0, 160);
    }
    if (details.inputKind !== undefined) {
      this.fontClassCreateTextLayoutInputKind = details.inputKind;
      this.loadingScreenInputModeActuallyUsed = details.inputKind;
    }
    if (details.inputLength !== undefined) {
      this.fontClassCreateTextLayoutInputLength = details.inputLength;
    }
  }

  public recordLoadingScreenTextEnvelope(details: {
    built: boolean;
    source: string;
    candidateCount: number;
    previewSafe: string | null;
    shimConfigured: boolean;
    fallbackTextLength: number;
  }): void {
    this.loadingScreenTextEnvelopeBuilt = details.built;
    this.loadingScreenTextEnvelopeSource = details.source;
    this.loadingScreenTextEnvelopeCandidateCount = details.candidateCount;
    this.loadingScreenTextEnvelopePreviewSafe = details.previewSafe;
    this.loadingScreenTextCompatShimConfigured = details.shimConfigured;
    this.loadingScreenTextCompatFallbackTextLength = details.fallbackTextLength;
  }

  public recordRufflePageConfig(cfg: { hebrewFontWorkaroundEnabled: boolean; rendererPreference: string }): void {
    this.rufflePageConfig = { ...cfg };
  }

  public recordFontSourceRequest(url: string, served: boolean): void {
    const normalizedUrl = url.replace(/\\/g, '/');
    if (!this.fontSourceRequests.includes(normalizedUrl)) {
      this.fontSourceRequests.push(normalizedUrl);
    }
    if (served) {
      if (!this.fontSourceServed.includes(normalizedUrl)) {
        this.fontSourceServed.push(normalizedUrl);
      }
    } else {
      if (!this.fontSourceMissing.includes(normalizedUrl)) {
        this.fontSourceMissing.push(normalizedUrl);
      }
    }
  }

  public recordRuffleFontConfig(sources: string[], defaultFonts: Record<string, string[]>, deviceFontRenderer: string | null): void {
    this.ruffleFontSources = [...sources];
    this.ruffleDefaultFonts = { ...defaultFonts };
    this.ruffleDeviceFontRenderer = deviceFontRenderer;
  }

  public recordCanvasTextDiagnostics(payload: CanvasTextDiagnosticsPayload): void {
    if (payload.interceptorActive === true) {
      this.canvasTextInterceptorActive = true;
    }
    if (typeof payload.totalDrawCount === 'number' && Number.isFinite(payload.totalDrawCount)) {
      this.canvasTextTotalDrawCount = Math.max(this.canvasTextTotalDrawCount, Math.max(0, Math.floor(payload.totalDrawCount)));
    }
    if (typeof payload.hebrewTextDrawCount === 'number' && Number.isFinite(payload.hebrewTextDrawCount)) {
      this.canvasHebrewTextDrawCount = Math.max(this.canvasHebrewTextDrawCount, Math.max(0, Math.floor(payload.hebrewTextDrawCount)));
    }
    this.mergeCountMap(this.canvasTextFontsSeen, payload.fontsSeen);
    this.mergeCountMap(this.canvasTextMethodCounts, payload.methodCounts);

    if (Array.isArray(payload.samples)) {
      for (const sample of payload.samples) {
        if (!sample || typeof sample.text !== 'string' || !/[\u0590-\u05FF]/.test(sample.text)) {
          continue;
        }
        this.canvasHebrewTextSamples.push({
          method: String(sample.method || 'unknown'),
          text: sample.text,
          font: typeof sample.font === 'string' ? sample.font : undefined,
          direction: typeof sample.direction === 'string' ? sample.direction : undefined,
          textAlign: typeof sample.textAlign === 'string' ? sample.textAlign : undefined,
          x: typeof sample.x === 'number' || typeof sample.x === 'string' || sample.x === null ? sample.x : undefined,
          y: typeof sample.y === 'number' || typeof sample.y === 'string' || sample.y === null ? sample.y : undefined,
          canvasWidth: typeof sample.canvasWidth === 'number' ? sample.canvasWidth : null,
          canvasHeight: typeof sample.canvasHeight === 'number' ? sample.canvasHeight : null,
          timestamp: typeof sample.timestamp === 'number' ? sample.timestamp : Date.now(),
          length: typeof sample.length === 'number' ? sample.length : sample.text.length
        });
        if (this.canvasHebrewTextSamples.length > this.maxCanvasHebrewTextSamples) {
          this.canvasHebrewTextSamples.splice(0, this.canvasHebrewTextSamples.length - this.maxCanvasHebrewTextSamples);
        }
      }
    }
  }

  private mergeCountMap(target: Record<string, number>, source?: Record<string, number>): void {
    if (!source || typeof source !== 'object') return;
    for (const [rawKey, rawValue] of Object.entries(source)) {
      const key = String(rawKey || 'unknown');
      const value = typeof rawValue === 'number' && Number.isFinite(rawValue) ? Math.max(0, Math.floor(rawValue)) : 0;
      target[key] = Math.max(target[key] || 0, value);
    }
  }

  public getCanvasTextDiagnosticsReport(): Record<string, unknown> {
    return {
      canvasTextInterceptorActive: this.canvasTextInterceptorActive,
      canvasTextTotalDrawCount: this.canvasTextTotalDrawCount,
      canvasHebrewTextDrawCount: this.canvasHebrewTextDrawCount,
      canvasTextFontsSeen: { ...this.canvasTextFontsSeen },
      canvasTextMethodCounts: { ...this.canvasTextMethodCounts },
      canvasHebrewTextSamples: [...this.canvasHebrewTextSamples]
    };
  }

  private recordUserExperienceCtorShimDiagnostic(message: string, details?: Record<string, unknown>): void {
    if (!message.includes('[user_experience_ctor_shim]')) return;

    this.userExperienceCtorShimEnabled = true;
    this.lastUserExperienceCtorShimAt = Date.now();

    const argTypesMatch = message.match(/argTypes=\[([^\]]*)\]/);
    if (argTypesMatch) {
      this.lastUserExperienceCtorShimArgTypes = argTypesMatch[1]
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    } else if (Array.isArray(details?.argTypes)) {
      this.lastUserExperienceCtorShimArgTypes = (details!.argTypes as unknown[]).map(String);
    }

    const droppedMatch = message.match(/droppedArgType=([^\s]+)/);
    if (droppedMatch) {
      this.lastUserExperienceCtorShimDroppedArgType = droppedMatch[1];
    } else if (typeof details?.droppedArgType === 'string') {
      this.lastUserExperienceCtorShimDroppedArgType = details.droppedArgType;
    }

    const scorePreviewMatch = message.match(/argValuesPreview=\[score=([^\]]*)\]/);
    if (scorePreviewMatch) {
      this.lastUserExperienceCtorShimArgValuesPreview = { score: scorePreviewMatch[1] };
    } else if (details?.argValuesPreview && typeof details.argValuesPreview === 'object') {
      this.lastUserExperienceCtorShimArgValuesPreview = Object.fromEntries(
        Object.entries(details.argValuesPreview as Record<string, unknown>).map(([key, value]) => [key, String(value)])
      );
    }

    const textFieldScoreAppliedMatch = message.match(/textFieldScoreApplied=(true|false)/);
    if (textFieldScoreAppliedMatch) {
      this.lastUserExperienceCtorShimTextFieldScoreApplied = textFieldScoreAppliedMatch[1] === 'true';
    } else if (typeof details?.textFieldScoreApplied === 'boolean') {
      this.lastUserExperienceCtorShimTextFieldScoreApplied = details.textFieldScoreApplied;
    }

    const destroyErrorMatch = message.match(/\[personal_card_destroy_error\].*class=([^\s]+).*message=(.*?)(?:\s+method=([^\s]+))?$/);
    if (destroyErrorMatch) {
      this.personalCardDestroyErrorSeen = true;
      this.personalCardDestroyErrorClass = destroyErrorMatch[1];
      this.personalCardDestroyErrorMessage = destroyErrorMatch[2]?.trim() || null;
      this.personalCardDestroyErrorMethod = destroyErrorMatch[3] || null;
    }

    const skipMatch = message.match(/skipReason=([^\s]+)/);
    if (message.includes('applied=true')) {
      this.userExperienceCtorShimAppliedCount += 1;
      this.lastUserExperienceCtorShimSkipReason = null;
    } else if (skipMatch || message.includes('applied=false')) {
      this.userExperienceCtorShimSkippedCount += 1;
      this.lastUserExperienceCtorShimSkipReason = skipMatch ? skipMatch[1] : String(details?.skipReason || 'unknown');
    }
  }

  private recordTextFlowEditorCtorShimDiagnostic(message: string, details?: Record<string, unknown>): void {
    if (!message.includes('[text_flow_editor_ctor_shim]')) return;

    this.textFlowEditorCtorShimEnabled = true;
    this.lastTextFlowEditorCtorShimAt = Date.now();

    const argTypesMatch = message.match(/argTypes=\[([^\]]*)\]/);
    if (argTypesMatch) {
      this.lastTextFlowEditorCtorShimArgTypes = argTypesMatch[1]
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    } else if (Array.isArray(details?.argTypes)) {
      this.lastTextFlowEditorCtorShimArgTypes = (details.argTypes as unknown[]).map(String);
    }

    const droppedMatch = message.match(/droppedArgTypes=\[([^\]]*)\]/);
    if (droppedMatch) {
      this.lastTextFlowEditorCtorShimDroppedArgTypes = droppedMatch[1]
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    }

    const valuesMatch = message.match(/argValuesPreview=\[([^\]]*)\]/);
    if (valuesMatch) {
      this.lastTextFlowEditorCtorShimArgValuesPreview = Object.fromEntries(
        valuesMatch[1]
          .split(',')
          .map((part) => part.split('='))
          .filter(([key, value]) => key && value !== undefined)
          .map(([key, value]) => [key.trim(), value.trim()])
      );
    } else if (details?.argValuesPreview && typeof details.argValuesPreview === 'object') {
      this.lastTextFlowEditorCtorShimArgValuesPreview = Object.fromEntries(
        Object.entries(details.argValuesPreview as Record<string, unknown>).map(([key, value]) => [key, String(value)])
      );
    }

    this.lastTextFlowEditorCtorShimCallSiteMethod = this.parseTraceField(message, 'callSiteMethod')
      || this.lastTextFlowEditorCtorShimCallSiteMethod;
    this.lastTextFlowEditorCtorShimCallerSwf = this.parseTraceField(message, 'callerSwf')
      || this.lastTextFlowEditorCtorShimCallerSwf;

    const skipMatch = message.match(/skipReason=([^\s]+)/);
    if (message.includes('applied=true')) {
      this.textFlowEditorCtorShimAppliedCount += 1;
      this.lastTextFlowEditorCtorShimSkipReason = null;
    } else if (skipMatch || message.includes('applied=false')) {
      this.textFlowEditorCtorShimSkippedCount += 1;
      this.lastTextFlowEditorCtorShimSkipReason = skipMatch ? skipMatch[1] : String(details?.skipReason || 'unknown');
    }

    if (message.includes('textFlowEditorCtorMismatchSeen=true') || message.includes('mismatch=true')) {
      this.textFlowEditorCtorMismatchSeen = true;
      this.textFlowEditorCtorMismatchReceiverClassLoadedFromSwf =
        this.parseTraceField(message, 'mismatchReceiverClassLoadedFromSwf')
        || this.textFlowEditorCtorMismatchReceiverClassLoadedFromSwf;
    }
  }

  private recordButtonDataGridClearShimDiagnostic(message: string, details?: Record<string, unknown>): void {
    if (!message.includes('[button_data_grid_clear_shim]')) return;

    this.buttonDataGridClearShimEnabled = true;
    this.lastButtonDataGridClearShimAt = Date.now();

    const appliedMatch = message.match(/applied=(true|false)/);
    if (appliedMatch?.[1] === 'true') {
      this.buttonDataGridClearShimAppliedCount += 1;
    }

    const modeMatch = message.match(/mode=([^\s]+)/);
    this.buttonDataGridClearShimMode = modeMatch?.[1] || String(details?.mode || this.buttonDataGridClearShimMode || 'unknown');

    const fallbackMatch = message.match(/fallbackReason=([^\s]+)/);
    this.buttonDataGridClearShimFallbackReason = fallbackMatch?.[1] && fallbackMatch[1] !== 'none'
      ? fallbackMatch[1]
      : (typeof details?.fallbackReason === 'string' ? details.fallbackReason : null);

    const receiverMatch = message.match(/receiverClass=([^\s]+)/);
    this.lastButtonDataGridClearShimReceiverClass = receiverMatch?.[1] || (typeof details?.receiverClass === 'string' ? details.receiverClass : this.lastButtonDataGridClearShimReceiverClass);

    const callerSwfMatch = message.match(/callerSwf=([^\s]+)/);
    this.lastButtonDataGridClearShimCallerSwf = callerSwfMatch?.[1] || (typeof details?.callerSwf === 'string' ? details.callerSwf : this.lastButtonDataGridClearShimCallerSwf);

    const callSiteMatch = message.match(/callSiteMethod=([^\s]+)/);
    this.lastButtonDataGridClearShimCallSiteMethod = callSiteMatch?.[1] || (typeof details?.callSiteMethod === 'string' ? details.callSiteMethod : this.lastButtonDataGridClearShimCallSiteMethod);

    const removedMatch = message.match(/removedMcItems=(true|false)/);
    if (removedMatch) this.buttonDataGridClearShimRemovedMcItems = removedMatch[1] === 'true';

    const recreatedMatch = message.match(/recreatedMcItems=(true|false)/);
    if (recreatedMatch) this.buttonDataGridClearShimRecreatedMcItems = recreatedMatch[1] === 'true';

    const resetMatch = message.match(/resetSelectedItem=(true|false)/);
    if (resetMatch) this.buttonDataGridClearShimResetSelectedItem = resetMatch[1] === 'true';
  }

  private recordLoadingScreenTextCompatShimDiagnostic(message: string, details?: Record<string, unknown>): void {
    if (!message.includes('[loading_screen_text_compat]')) return;

    this.loadingScreenTextCompatShimEnabled = true;

    if (message.includes('loadingScreenTextEnvelopeDecoded=true')) {
      this.loadingScreenTextEnvelopeDecoded = true;
    }

    const sourceMatch = message.match(/loadingScreenTextSource=([^\s]+)/);
    if (sourceMatch) {
      this.loadingScreenTextEnvelopeSource = sourceMatch[1];
    }

    const candidateCountMatch = message.match(/loadingScreenTextCandidateCount=(\d+)/);
    if (candidateCountMatch) {
      this.loadingScreenTextEnvelopeCandidateCount = parseInt(candidateCountMatch[1], 10);
    }

    const selectedPreviewMatch = message.match(/loadingScreenTextSelectedPreview=(.*)$/);
    if (selectedPreviewMatch) {
      this.loadingScreenTextSelectedPreview = selectedPreviewMatch[1]?.trim() || null;
    }

    const decodeErrorMatch = message.match(/loadingScreenTextEnvelopeDecodeError=([^\s]+)/);
    if (decodeErrorMatch) {
      this.loadingScreenTextEnvelopeDecodeError = decodeErrorMatch[1];
    }

    if (message.includes('applied=true')) {
      this.loadingScreenTextFieldCompatApplied = true;
    }

    const pathMatch = message.match(/loadingScreenTextRenderPath=([^\s]+)/);
    if (pathMatch) {
      this.loadingScreenTextRenderPath = pathMatch[1] as any;
    } else if (typeof details?.loadingScreenTextRenderPath === 'string') {
      this.loadingScreenTextRenderPath = details.loadingScreenTextRenderPath as any;
    }

    const reasonMatch = message.match(/loadingScreenTextFieldCompatReason=([^\]]+)/);
    if (reasonMatch) {
      this.loadingScreenTextFieldCompatReason = reasonMatch[1].trim();
    } else if (typeof details?.loadingScreenTextFieldCompatReason === 'string') {
      this.loadingScreenTextFieldCompatReason = details.loadingScreenTextFieldCompatReason;
    }

    const boundsBeforeMatch = message.match(/loadingScreenTextFieldBoundsBefore=([^\s]+)/);
    if (boundsBeforeMatch) {
      this.loadingScreenTextFieldBoundsBefore = boundsBeforeMatch[1];
    } else if (typeof details?.loadingScreenTextFieldBoundsBefore === 'string') {
      this.loadingScreenTextFieldBoundsBefore = details.loadingScreenTextFieldBoundsBefore;
    }

    const boundsAfterMatch = message.match(/loadingScreenTextFieldBoundsAfter=([^\s]+)/);
    if (boundsAfterMatch) {
      this.loadingScreenTextFieldBoundsAfter = boundsAfterMatch[1];
    } else if (typeof details?.loadingScreenTextFieldBoundsAfter === 'string') {
      this.loadingScreenTextFieldBoundsAfter = details.loadingScreenTextFieldBoundsAfter;
    }

    const lengthMatch = message.match(/loadingScreenTextFieldTextLength=(\d+)/);
    if (lengthMatch) {
      this.loadingScreenTextFieldTextLength = parseInt(lengthMatch[1], 10);
    } else if (typeof details?.loadingScreenTextFieldTextLength === 'number') {
      this.loadingScreenTextFieldTextLength = details.loadingScreenTextFieldTextLength;
    }

    const fontMatch = message.match(/loadingScreenTextFieldFont=([^\s]+)/);
    if (fontMatch) {
      this.loadingScreenTextFieldFont = fontMatch[1];
    } else if (typeof details?.loadingScreenTextFieldFont === 'string') {
      this.loadingScreenTextFieldFont = details.loadingScreenTextFieldFont;
    }

    const colorMatch = message.match(/loadingScreenTextFieldColor=([^\s]+)/);
    if (colorMatch) {
      this.loadingScreenTextFieldColor = colorMatch[1];
    } else if (typeof details?.loadingScreenTextFieldColor === 'string') {
      this.loadingScreenTextFieldColor = details.loadingScreenTextFieldColor;
    }

    const callStackMatch = message.match(/loadingScreenTextCallStackMatched=(true|false)/);
    if (callStackMatch) {
      this.loadingScreenTextCallStackMatched = callStackMatch[1] === 'true';
    } else if (typeof details?.loadingScreenTextCallStackMatched === 'boolean') {
      this.loadingScreenTextCallStackMatched = details.loadingScreenTextCallStackMatched;
    }
    
    const addedMatch = message.match(/loadingScreenTextAddedToDisplayList=(true|false)/);
    if (addedMatch) {
      this.loadingScreenTextAddedToDisplayList = addedMatch[1] === 'true';
    } else if (typeof details?.loadingScreenTextAddedToDisplayList === 'boolean') {
      this.loadingScreenTextAddedToDisplayList = details.loadingScreenTextAddedToDisplayList;
    }

    const boundsMatch = message.match(/loadingScreenTextDisplayObjectBounds=([^\s]+)/);
    if (boundsMatch) {
      try {
        this.loadingScreenTextDisplayObjectBounds = JSON.parse(boundsMatch[1]);
      } catch (e) {
        // Ignore parse error
      }
    } else if (details?.loadingScreenTextDisplayObjectBounds) {
      this.loadingScreenTextDisplayObjectBounds = details.loadingScreenTextDisplayObjectBounds as Record<string, unknown>;
    }

    const alphaMatch = message.match(/loadingScreenTextAlphaVisible=(true|false)/);
    if (alphaMatch) {
      this.loadingScreenTextAlphaVisible = alphaMatch[1] === 'true';
    } else if (typeof details?.loadingScreenTextAlphaVisible === 'boolean') {
      this.loadingScreenTextAlphaVisible = details.loadingScreenTextAlphaVisible;
    }
  }

  private recordMogoWallTraceDiagnostic(message: string): void {
    if (!message.includes('[mogo_wall_trace]')) return;

    const method = message.match(/method=([^\s]+)/)?.[1] || null;
    const event = message.match(/event=([^\s]+)/)?.[1] || null;
    const arg0 = message.match(/arg0=([^\s]+)/)?.[1] || null;
    const expectedCommand = message.match(/expectedCommandAfterTab=([^\s]+)/)?.[1] || null;
    const clickedIndexRaw = this.parseTraceNumberField(message, 'clickedTabButtonIndexRaw');
    const clickedMappedPage = this.parseTraceNumberField(message, 'clickedTabButtonMappedPage');
    const gotoPageIndex = this.parseTraceNumberField(message, 'gotoPageIndex');
    const requestTabViewIndex = this.parseTraceNumberField(message, 'requestTabViewIndex');

    if (expectedCommand && expectedCommand !== 'null') {
      this.lastMogoWallCommandExpectedAfterTab = expectedCommand;
    }

    if (event === 'call') {
      if (message.includes('anyMogoWallMouseClickSeen=true')) {
        this.anyMogoWallMouseClickSeen = true;
      }
      if (message.includes('mogoWallCloseClickedSeen=true')) {
        this.mogoWallCloseClickedSeen = true;
      }
      if (message.includes('mogoWallCloseHandlerEntered=true')) {
        this.mogoWallCloseHandlerEntered = true;
      }
      if (message.includes('mogoWallCloseDestroyViewCalled=true')) {
        this.mogoWallCloseDestroyViewCalled = true;
        this.lastMogoWallDestroyViewCalled = true;
      }
      if (message.includes('mogoWallCloseRemovePopupCalled=true')) {
        this.mogoWallCloseRemovePopupCalled = true;
      }
      this.clickedDisplayObjectClass = this.parseTraceField(message, 'clickedDisplayObjectClass') || this.clickedDisplayObjectClass;
      this.clickedDisplayObjectName = this.parseTraceField(message, 'clickedDisplayObjectName') || this.clickedDisplayObjectName;
      this.clickedDisplayObjectPath = this.parseTraceField(message, 'clickedDisplayObjectPath') || this.clickedDisplayObjectPath;
      this.clickedTooltipText = this.parseTraceField(message, 'clickedTooltipText') || this.clickedTooltipText;
      this.tabButtonEnabled = this.parseTraceField(message, 'tabButtonEnabled') || this.tabButtonEnabled;
      this.tabButtonMouseEnabled = this.parseTraceField(message, 'tabButtonMouseEnabled') || this.tabButtonMouseEnabled;
      this.tabButtonVisible = this.parseTraceField(message, 'tabButtonVisible') || this.tabButtonVisible;
      this.tabButtonAlpha = this.parseTraceField(message, 'tabButtonAlpha') || this.tabButtonAlpha;
      this.tabButtonHitTestBlockedBy = this.parseTraceField(message, 'tabButtonHitTestBlockedBy') || this.tabButtonHitTestBlockedBy;
      this.mogoWallCloseCurrentViewClass = this.parseTraceField(message, 'mogoWallCloseCurrentViewClass') || this.mogoWallCloseCurrentViewClass;
      this.mogoWallCloseCurrentTabName = this.parseTraceField(message, 'mogoWallCloseCurrentTabName') || this.mogoWallCloseCurrentTabName;
      this.mogoWallCloseOverlayRemoved = this.parseTraceField(message, 'mogoWallCloseOverlayRemoved') || this.mogoWallCloseOverlayRemoved;
      this.mogoWallCloseBlockedStateRemaining = this.parseTraceField(message, 'mogoWallCloseBlockedStateRemaining') || this.mogoWallCloseBlockedStateRemaining;
      const stageChildrenBefore = this.parseTraceNumberField(message, 'mogoWallCloseStageChildrenBefore');
      if (stageChildrenBefore !== null) this.mogoWallCloseStageChildrenBefore = stageChildrenBefore;
      const stageChildrenAfter = this.parseTraceNumberField(message, 'mogoWallCloseStageChildrenAfter');
      if (stageChildrenAfter !== null) this.mogoWallCloseStageChildrenAfter = stageChildrenAfter;

      if (clickedIndexRaw !== null) {
        this.clickedTabButtonIndexRaw = clickedIndexRaw;
        this.lastMogoWallTabClickIndex = clickedIndexRaw;
        this.lastMogoWallTabClickName = this.mogoWallTabNameFromIndex(clickedIndexRaw);
      }
      if (clickedMappedPage !== null) {
        this.clickedTabButtonMappedPage = clickedMappedPage;
        if (clickedMappedPage === 2) this.composeTabClickedSeen = true;
        if (clickedMappedPage === 7) this.personalTabClickedSeen = true;
      }
      if (requestTabViewIndex !== null) {
        this.requestTabViewCalled = true;
        this.requestTabViewIndex = requestTabViewIndex;
        this.requestTabViewResolvedName = this.parseTraceField(message, 'requestTabViewResolvedName')
          || this.mogoWallTabNameFromIndex(requestTabViewIndex);
        if (requestTabViewIndex === 2) this.composeTabClickedSeen = true;
      }
      if (gotoPageIndex !== null) {
        this.gotoPageCalled = true;
        this.gotoPageIndex = gotoPageIndex;
        if (gotoPageIndex === 2) this.composeTabClickedSeen = true;
      }

      if (method === 'mogobe.MogoWall.WallMainScreen.gotoPage') {
        const index = arg0 ? Number(arg0) : NaN;
        this.lastMogoWallTabClickIndex = Number.isFinite(index) ? index : null;
        this.lastMogoWallTabClickName = this.mogoWallTabNameFromIndex(this.lastMogoWallTabClickIndex);
        if (this.lastMogoWallViewAfterSwitch) {
          this.lastMogoWallViewBeforeSwitch = this.lastMogoWallViewAfterSwitch;
        }
        if (this.lastMogoWallTabClickIndex === 2) {
          this.composeTabClickedSeen = true;
        }
        if (this.lastMogoWallTabClickIndex === 7) {
          this.personalTabClickedSeen = true;
        } else if (this.lastMogoWallViewAfterSwitch === 'UserInfo') {
          this.personalTabExitAttemptSeen = true;
        }
      } else if (method === 'mogobe.MogoWall.WallMainScreen.destroyView') {
        this.lastMogoWallDestroyViewCalled = true;
        this.mogoWallCloseDestroyViewCalled = true;
        if (this.lastMogoWallViewAfterSwitch === 'UserInfo') {
          this.personalTabExitAttemptSeen = true;
        }
        this.lastMogoWallTabBeforeDestroy = this.lastMogoWallViewAfterSwitch;
      } else if (method === 'worlds4u.view.popups::MogoWallPopup.onExit') {
        this.mogoWallCloseClickedSeen = true;
        this.mogoWallCloseHandlerEntered = true;
        this.personalTabExitAttemptSeen = this.personalTabClickedSeen || this.lastMogoWallViewAfterSwitch === 'UserInfo';
      } else if (method === 'worlds4u.view.popups::MogoWallPopup.disableEvents') {
        this.mogoWallCloseDestroyViewCalled = true;
        this.personalTabExitAttemptSeen = this.personalTabClickedSeen || this.lastMogoWallViewAfterSwitch === 'UserInfo';
      } else if (method === 'worlds4u.view.screen::ScreenManager.deleteMogoWallPopup') {
        this.mogoWallCloseHandlerEntered = true;
        this.mogoWallCloseRemovePopupCalled = true;
        this.personalTabExitAttemptSeen = this.personalTabClickedSeen || this.lastMogoWallViewAfterSwitch === 'UserInfo';
      } else if (method?.startsWith('mogobe.MogoWall.WallMainScreen.add')) {
        this.lastMogoWallAddViewCalled = method;
        const nextView = this.mogoWallViewNameFromAddMethod(method);
        if (nextView) {
          this.lastMogoWallViewAfterSwitch = nextView;
          this.lastMogoWallTabAfterDestroy = nextView;
        }
        if (method === 'mogobe.MogoWall.WallMainScreen.addComposeView') {
          this.addComposeViewCalled = true;
        }
      } else if (method === 'mogobe.MogoWall.Compose.WallComposeView.init') {
        this.wallComposeViewInitCalled = true;
        this.wallComposeViewTemplatesRequestExpected = true;
      } else if (method === 'mogobe.MogoWall.Compose.WallComposeView.initContent') {
        this.wallComposeViewInitContentCalled = true;
      } else if (method === 'mogobe.MogoWall.Compose.WallComposeView.initFriendList') {
        this.wallComposeViewInitFriendListCalled = true;
      } else if (method === 'mogobe.MogoWall.Compose.WallComposeView.initTemplates') {
        this.wallComposeViewInitTemplatesCalled = true;
      } else if (method === 'mogobe.MogoWall.Compose.WallComposeView.requestTemplates' || method === 'MogoWall.requestMessageTemplates') {
        this.lastMogoWallCommandActuallySentAfterTab = 'wall__getMessageTemplates';
        this.composeTabNetworkCommandSent = true;
        this.wallComposeViewRequestTemplatesCalled = true;
        this.wallComposeViewTemplatesRequestSent = true;
      } else if (method === 'MogoWall.requestUserInventory') {
        this.lastMogoWallCommandActuallySentAfterTab = 'user__getInventoryItems';
        this.wallComposeViewInventoryRequestCount += 1;
      } else if (method === 'mogobe.MogoWall.UserInfo.UserItemTabs.getUserItems') {
        this.lastMogoWallCommandActuallySentAfterTab = 'user__getInventoryItems';
        this.wallComposeViewInventoryRequestCount += 1;
      } else if (
        method === 'MogoWall.onGetUserItems' ||
        method === 'mogobe.MogoWall.UserInfo.UserInfoView.onGetUserItems' ||
        method === 'mogobe.MogoWall.UserInfo.UserItemTabs.onGetUserItems'
      ) {
        this.wallComposeViewInventoryResponseSeen = true;
      }
    } else if (event === 'error') {
      const errorMessage = message.match(/errorMessage=([^\s]+)/)?.[1]?.replace(/_/g, ' ') || null;
      const errorClass = message.match(/errorClass=([^\s]+)/)?.[1] || 'AVM2';
      this.mogoWallLocalExceptionSeen = true;
      this.mogoWallLocalExceptionClass = errorClass;
      this.mogoWallLocalExceptionMessage = errorMessage;
      this.mogoWallLocalExceptionMethod = method;
      if (
        method?.includes('MogoWallPopup') ||
        method?.includes('deleteMogoWallPopup') ||
        method?.includes('closePopups') ||
        method?.includes('destroy')
      ) {
        this.mogoWallCloseExceptionSeen = true;
        this.mogoWallCloseExceptionMessage = errorMessage;
      }

      if (
        method?.includes('onMouseClick') ||
        method?.includes('onMouseDown') ||
        method?.includes('onTabClick') ||
        method?.includes('onChangeTabClick') ||
        method?.includes('requestTabView') ||
        method?.includes('gotoPage')
      ) {
        this.tabClickExceptionSeen = true;
        this.tabClickExceptionClass = errorClass;
        this.tabClickExceptionMessage = errorMessage;
        this.tabClickExceptionMethod = method;
      }

      if (method?.includes('destroy')) {
        this.personalCardDestroyErrorSeen = true;
        this.personalCardDestroyErrorClass = errorClass;
        this.personalCardDestroyErrorMessage = errorMessage;
        this.personalCardDestroyErrorMethod = method;
        this.lastMogoWallDestroyViewErrorSeen = true;
        this.lastMogoWallDestroyViewErrorMessage = errorMessage;
      }
      if (method?.includes('.add')) {
        this.lastMogoWallAddViewErrorSeen = true;
        this.lastMogoWallAddViewErrorMessage = errorMessage;
      }
    } else if (event === 'compatibility_mismatch') {
      this.mogoWallCompatibilityMismatchSeen = true;
      this.mismatchCallerSwf = this.parseTraceField(message, 'mismatchCallerSwf');
      this.mismatchCallerClass = this.parseTraceField(message, 'mismatchCallerClass');
      this.mismatchCallerMethod = this.parseTraceField(message, 'mismatchCallerMethod');
      this.mismatchExpectedReceiverClass = this.parseTraceField(message, 'mismatchExpectedReceiverClass');
      this.mismatchMissingMethod = this.parseTraceField(message, 'mismatchMissingMethod');
      this.mismatchReceiverClassLoadedFromSwf = this.parseTraceField(message, 'mismatchReceiverClassLoadedFromSwf');
      this.mismatchReceiverClassDefiningMovie = this.parseTraceField(message, 'mismatchReceiverClassDefiningMovie');
      this.mismatchLikelyCause = this.parseTraceField(message, 'mismatchLikelyCause');
      this.mismatchSuggestedAction = this.parseQuotedTraceField(message, 'mismatchSuggestedAction')
        || 'Use a MogoWall.swf and ButtonDataGrid provider SWF from the same client version, or enable an explicit compatibility shim if available.';
    }
  }

  private recordMagicTraceDiagnostic(message: string): void {
    if (!message.includes('[magic_trace]')) return;

    const method = this.parseTraceField(message, 'method');
    const event = this.parseTraceField(message, 'event');
    const currentMethod = this.parseTraceField(message, 'currentlyExecutingAvm2Method');
    if (currentMethod) {
      this.currentExecutingAvm2Method = currentMethod;
    }
    if (method && !this.controlPanelMethodsSeen.includes(method)) {
      this.controlPanelMethodsSeen.push(method);
      if (this.controlPanelMethodsSeen.length > 50) {
        this.controlPanelMethodsSeen.splice(0, this.controlPanelMethodsSeen.length - 50);
      }
    }

    if (event === 'mouse_pick') {
      this.controlPanelHitTestTopObjectClass = this.parseTraceField(message, 'controlPanelHitTestTopObjectClass') || this.controlPanelHitTestTopObjectClass;
      this.controlPanelHitTestTopObjectName = this.parseTraceField(message, 'controlPanelHitTestTopObjectName') || this.controlPanelHitTestTopObjectName;
      this.controlPanelHitTestTopObjectPath = this.parseTraceField(message, 'controlPanelHitTestTopObjectPath') || this.controlPanelHitTestTopObjectPath;
      this.controlPanelHitTestTopObjectBounds = this.parseTraceField(message, 'controlPanelHitTestTopObjectBounds') || this.controlPanelHitTestTopObjectBounds;
      this.controlPanelHitTestAncestorChain = this.parseTraceField(message, 'controlPanelHitTestAncestorChain') || this.controlPanelHitTestAncestorChain;
      this.controlPanelClickBlockedByClass = this.parseTraceField(message, 'controlPanelClickBlockedByClass') || this.controlPanelClickBlockedByClass;
      this.controlPanelClickBlockedByName = this.parseTraceField(message, 'controlPanelClickBlockedByName') || this.controlPanelClickBlockedByName;
      this.controlPanelClickBlockedByPath = this.parseTraceField(message, 'controlPanelClickBlockedByPath') || this.controlPanelClickBlockedByPath;
      this.magicClickBlockedByClass = this.controlPanelClickBlockedByClass || this.magicClickBlockedByClass;
      this.magicClickBlockedByName = this.controlPanelClickBlockedByName || this.magicClickBlockedByName;
      this.magicClickBlockedByPath = this.controlPanelClickBlockedByPath || this.magicClickBlockedByPath;
      this.magicHitTestTopObjectClass = this.controlPanelHitTestTopObjectClass || this.magicHitTestTopObjectClass;
      this.magicHitTestTopObjectName = this.controlPanelHitTestTopObjectName || this.magicHitTestTopObjectName;
      this.popupLayerTopObject = this.parseTraceField(message, 'popupLayerTopObject') || this.popupLayerTopObject;
      const popupBlocks = this.parseTraceField(message, 'popupLayerBlocksControlPanel');
      if (popupBlocks === 'true') this.popupLayerBlocksControlPanel = true;
      if (popupBlocks === 'false') this.popupLayerBlocksControlPanel = false;
      this.activePopupClassName = this.parseTraceField(message, 'activePopupClassName') || this.activePopupClassName || this.getLastPopupClassName();
      this.activePopupMouseEnabled = this.parseTraceField(message, 'activePopupMouseEnabled') || this.activePopupMouseEnabled;
      this.activePopupMouseChildren = this.parseTraceField(message, 'activePopupMouseChildren') || this.activePopupMouseChildren;
      return;
    }

    if (event === 'call') {
      if (method === 'worlds4u.view.controls::ControlPanel.ControlPanel' || method === 'worlds4u.view.controls.ControlPanel.ControlPanel') {
        this.magicButtonSeen = true;
      } else if (method === 'worlds4u.view.controls::ControlPanel.enableEvents' || method === 'worlds4u.view.controls.ControlPanel.enableEvents') {
        this.magicButtonSeen = true;
        this.magicButtonTooltipText = this.parseTraceField(message, 'magicButtonTooltipText') || this.magicButtonTooltipText || 'קסמים';
        this.magicButtonVisible = this.parseTraceField(message, 'magicButtonVisible') || this.magicButtonVisible;
        this.magicButtonEnabled = this.parseTraceField(message, 'magicButtonEnabled') || this.magicButtonEnabled;
        this.magicButtonMouseEnabled = this.parseTraceField(message, 'magicButtonMouseEnabled') || this.magicButtonMouseEnabled;
        this.magicButtonMouseChildren = this.parseTraceField(message, 'magicButtonMouseChildren') || this.magicButtonMouseChildren;
      } else if (method === 'worlds4u.view.controls::ControlPanel.initSpecialMove' || method === 'worlds4u.view.controls.ControlPanel.initSpecialMove') {
        this.specialMoveInitSeen = true;
        this.specialHolderName = this.parseTraceField(message, 'specialHolderName') || this.specialHolderName || 'mcSpecialMove';
        this.specialHolderVisibleAtInit = this.parseTraceField(message, 'specialHolderVisibleAtInit') || this.specialHolderVisibleAtInit;
        this.specialHolderMouseEnabled = this.parseTraceField(message, 'specialHolderMouseEnabled') || this.specialHolderMouseEnabled;
        this.specialHolderMouseChildren = this.parseTraceField(message, 'specialHolderMouseChildren') || this.specialHolderMouseChildren;
        this.specialInnerButtonCount = this.parseTraceNumberField(message, 'specialInnerButtonCount');
        this.specialInnerButtonNames = this.parseTraceCsvField(message, 'specialInnerButtonNames') || this.specialInnerButtonNames;
        this.specialInnerButtonMouseEnabledList = this.parseTraceCsvField(message, 'specialInnerButtonMouseEnabledList') || this.specialInnerButtonMouseEnabledList;
        this.specialInnerButtonVisibleList = this.parseTraceCsvField(message, 'specialInnerButtonVisibleList') || this.specialInnerButtonVisibleList;
      } else if (method === 'worlds4u.view.controls::ControlPanel.initSpecialEffectControl' || method === 'worlds4u.view.controls.ControlPanel.initSpecialEffectControl') {
        this.specialEffectInitSeen = true;
        this.magicPanelSeen = true;
        this.magicPanelVisible = this.parseTraceField(message, 'magicPanelVisible') || this.magicPanelVisible;
        this.magicPanelOpenState = this.magicPanelVisible;
        this.magicPanelInitiallyOpen = this.magicPanelVisible === 'true';
        this.magicPanelExpectedClosedAtStartup = this.parseTraceField(message, 'magicPanelExpectedClosedAtStartup') === 'true';
        this.magicPanelParentPath = this.parseTraceField(message, 'magicPanelParentPath') || this.magicPanelParentPath;
        this.magicPanelBounds = this.parseTraceField(message, 'magicPanelBounds') || this.magicPanelBounds;
        this.controlPanelBounds = this.magicPanelBounds || this.controlPanelBounds;
        this.magicPanelAlpha = this.parseTraceField(message, 'magicPanelAlpha') || this.magicPanelAlpha;
        this.magicPanelMouseEnabled = this.parseTraceField(message, 'magicPanelMouseEnabled') || this.magicPanelMouseEnabled;
        this.magicPanelMouseChildren = this.parseTraceField(message, 'magicPanelMouseChildren') || this.magicPanelMouseChildren;
        this.specialHolderName = this.parseTraceField(message, 'specialHolderName') || this.specialHolderName || 'mcSpecialEffectHolder';
        this.specialHolderVisibleAtInit = this.parseTraceField(message, 'specialHolderVisibleAtInit') || this.specialHolderVisibleAtInit;
        this.specialHolderMouseEnabled = this.parseTraceField(message, 'specialHolderMouseEnabled') || this.specialHolderMouseEnabled;
        this.specialHolderMouseChildren = this.parseTraceField(message, 'specialHolderMouseChildren') || this.specialHolderMouseChildren;
        this.specialInnerButtonCount = this.parseTraceNumberField(message, 'specialInnerButtonCount');
        this.specialInnerButtonNames = this.parseTraceCsvField(message, 'specialInnerButtonNames') || this.specialInnerButtonNames;
        this.specialInnerButtonMouseEnabledList = this.parseTraceCsvField(message, 'specialInnerButtonMouseEnabledList') || this.specialInnerButtonMouseEnabledList;
        this.specialInnerButtonVisibleList = this.parseTraceCsvField(message, 'specialInnerButtonVisibleList') || this.specialInnerButtonVisibleList;
      } else if (method === 'worlds4u.view.controls::ControlPanel.onSpecialEffect' || method === 'worlds4u.view.controls.ControlPanel.onSpecialEffect') {
        this.magicButtonClickSeen = true;
        this.controlPanelButtonClickSeen = true;
        this.magicButtonClickTargetClass = this.parseTraceField(message, 'magicButtonClickTargetClass') || this.magicButtonClickTargetClass;
        this.magicButtonClickTargetName = this.parseTraceField(message, 'magicButtonClickTargetName') || this.magicButtonClickTargetName;
        this.magicButtonClickTargetPath = this.parseTraceField(message, 'magicButtonClickTargetPath') || this.magicButtonClickTargetPath;
        this.controlPanelClickedButtonName = this.magicButtonClickTargetName || this.controlPanelClickedButtonName;
        this.controlPanelClickedButtonPath = this.magicButtonClickTargetPath || this.controlPanelClickedButtonPath;
        this.controlPanelClickedButtonTooltip = this.magicButtonTooltipText || this.controlPanelClickedButtonTooltip;
        this.magicPanelOpenState = this.parseTraceField(message, 'magicPanelVisible') || this.magicPanelOpenState;
        this.magicPanelVisible = this.magicPanelOpenState;
        this.specialHolderVisibleAfterClick = this.magicPanelOpenState || this.specialHolderVisibleAfterClick;
      } else if (method === 'worlds4u.view.controls::ControlPanel.onSpecialMoves' || method === 'worlds4u.view.controls.ControlPanel.onSpecialMoves') {
        this.controlPanelButtonClickSeen = true;
        this.controlPanelClickedButtonName = this.parseTraceField(message, 'controlPanelClickedButtonName') || this.controlPanelClickedButtonName || 'btnMoves';
        this.controlPanelClickedButtonPath = this.parseTraceField(message, 'controlPanelClickedButtonPath') || this.controlPanelClickedButtonPath || 'mcControlButtons.btnMoves';
        this.specialHolderName = this.parseTraceField(message, 'specialHolderName') || this.specialHolderName || 'mcSpecialMove';
        this.specialHolderVisibleAfterClick = this.parseTraceField(message, 'specialHolderVisibleAfterClick') || this.specialHolderVisibleAfterClick;
      } else if (method === 'worlds4u.common.uiControls.ButtonSound.onMouseDown') {
        const tooltip = this.parseTraceField(message, 'tooltipText');
        if (tooltip === 'קסמים' || tooltip === 'magic' || this.parseTraceField(message, 'buttonName') === 'btnEEffects' || this.parseTraceField(message, 'buttonName') === 'btnMoves') {
          this.magicButtonMouseDownSeen = true;
          this.magicButtonSeen = true;
          this.magicButtonTooltipText = tooltip || this.magicButtonTooltipText;
          this.controlPanelButtonClickSeen = true;
          this.controlPanelClickedButtonName = this.parseTraceField(message, 'buttonName') || this.controlPanelClickedButtonName;
          this.controlPanelClickedButtonPath = this.parseTraceField(message, 'buttonPath') || this.controlPanelClickedButtonPath;
          this.controlPanelClickedButtonTooltip = tooltip || this.controlPanelClickedButtonTooltip;
        }
      } else if (method === 'worlds4u.common.uiControls.Button.onMouseClick') {
        const targetClass = this.parseTraceField(message, 'clickedDisplayObjectClass');
        const targetName = this.parseTraceField(message, 'clickedDisplayObjectName');
        const targetPath = this.parseTraceField(message, 'clickedDisplayObjectPath');
        const innerIndex = this.parseTraceNumberField(message, 'magicInnerButtonIndex');
        if (this.parseTraceField(message, 'magicPanelClickSeen') === 'true') {
          this.magicPanelClickSeen = true;
        }
        if (this.parseTraceField(message, 'magicInnerButtonClickSeen') === 'true') {
          this.magicInnerButtonClickSeen = true;
          this.specialInnerButtonClickSeen = true;
          this.magicInnerButtonTargetClass = targetClass || this.magicInnerButtonTargetClass;
          this.magicInnerButtonTargetName = targetName || this.magicInnerButtonTargetName;
          this.magicInnerButtonTargetPath = targetPath || this.magicInnerButtonTargetPath;
          this.magicInnerButtonIndex = innerIndex;
          this.magicInnerButtonEnabled = this.parseTraceField(message, 'magicInnerButtonEnabled') || this.magicInnerButtonEnabled;
          this.magicInnerButtonMouseEnabled = this.parseTraceField(message, 'magicInnerButtonMouseEnabled') || this.magicInnerButtonMouseEnabled;
          this.magicInnerButtonVisible = this.parseTraceField(message, 'magicInnerButtonVisible') || this.magicInnerButtonVisible;
          this.magicInnerButtonAlpha = this.parseTraceField(message, 'magicInnerButtonAlpha') || this.magicInnerButtonAlpha;
          this.specialInnerButtonClickedName = targetName || this.specialInnerButtonClickedName;
          this.specialInnerButtonClickedPath = targetPath || this.specialInnerButtonClickedPath;
        }
      } else if (
        method === 'worlds4u.view.controls::SpecialEffectControl.onSelectEffect'
        || method === 'worlds4u.view.controls.SpecialEffectControl.onSelectEffect'
        || method === 'worlds4u.view.controls::ControlPanel.onSpecialMoveSend'
        || method === 'worlds4u.view.controls.ControlPanel.onSpecialMoveSend'
      ) {
        if (
          method === 'worlds4u.view.controls::SpecialEffectControl.onSelectEffect'
          || method === 'worlds4u.view.controls.SpecialEffectControl.onSelectEffect'
        ) {
          this.specialEffectControlOnSelectEffectSeen = true;
        } else {
          this.onSpecialMoveSendSeen = true;
        }
        this.magicInnerButtonClickSeen = true;
        this.specialInnerButtonClickSeen = true;
      } else if (method === 'worlds4u.view.controls::ControlPanel.onEffectSend' || method === 'worlds4u.view.controls.ControlPanel.onEffectSend') {
        this.onEffectSendSeen = true;
        this.magicInnerButtonClickSeen = true;
        this.specialInnerButtonClickSeen = true;
      } else if (method === 'worlds4u.view.controls::Effect.onClick' || method === 'worlds4u.view.controls.Effect.onClick') {
        this.effectOnClickSeen = true;
        this.magicInnerButtonClickSeen = true;
        this.specialInnerButtonClickSeen = true;
      } else if (method === 'worlds4u.view.room::WalkableScreen.trySpecealEffect' || method === 'worlds4u.view.room.WalkableScreen.trySpecealEffect') {
        this.magicPanelClickSeen = true;
        this.magicHitTestTopObjectClass = this.parseTraceField(message, 'magicHitTestTopObjectClass') || this.magicHitTestTopObjectClass;
        this.magicHitTestTopObjectName = this.parseTraceField(message, 'magicHitTestTopObjectName') || this.magicHitTestTopObjectName;
      } else if (method === 'worlds4u.view.avatar::AvatarsManger.onEffect' || method === 'worlds4u.view.avatar.AvatarsManger.onEffect') {
        this.magicCommandSent = true;
        this.magicCommandName = this.parseTraceField(message, 'magicCommandName') || this.magicCommandName || 'effect__';
      }

      this.magicClickBlockedByClass = this.parseTraceField(message, 'magicClickBlockedByClass') || this.magicClickBlockedByClass;
      this.magicClickBlockedByName = this.parseTraceField(message, 'magicClickBlockedByName') || this.magicClickBlockedByName;
      this.magicClickBlockedByPath = this.parseTraceField(message, 'magicClickBlockedByPath') || this.magicClickBlockedByPath;
    } else if (event === 'error') {
      this.magicLocalExceptionSeen = true;
      this.magicLocalExceptionClass = this.parseTraceField(message, 'errorClass') || 'AVM2';
      this.magicLocalExceptionMessage = (this.parseTraceField(message, 'errorMessage') || '').replace(/_/g, ' ') || this.magicLocalExceptionMessage;
      this.magicLocalExceptionMethod = method;
    }
  }

  private recordMagicCompatShimDiagnostic(message: string): void {
    if (!message.includes('[magic_compat_shim]')) return;

    const applied = this.parseTraceField(message, 'applied');
    if (applied !== null) {
      this.magicCompatShimApplied = applied === 'true';
    }
    this.magicCompatShimReason = this.parseTraceField(message, 'reason') || this.magicCompatShimReason;
    this.magicDoEffectOriginalHandler = this.parseTraceField(message, 'originalHandler') || this.magicDoEffectOriginalHandler;
    this.magicDoEffectCompatHandler = this.parseTraceField(message, 'compatHandler') || this.magicDoEffectCompatHandler;

    const receiverClass = this.parseTraceField(message, 'receiverClassActual');
    const listenerName = this.parseTraceField(message, 'listenerNameActual');
    const boundReceiverClass = this.parseTraceField(message, 'boundReceiverClassActual');
    const boundMethod = this.parseTraceField(message, 'boundMethodActual');
    if (receiverClass || listenerName || boundReceiverClass || boundMethod) {
      const registration = [
        `receiver=${receiverClass || 'unknown'}`,
        `listener=${listenerName || 'unknown'}`,
        `boundReceiver=${boundReceiverClass || 'unknown'}`,
        `boundMethod=${boundMethod || 'unknown'}`,
      ].join(' ');
      this.magicDoEffectRegistrationCount += 1;
      if (this.magicDoEffectRegistrationsSeen.length < 10 && !this.magicDoEffectRegistrationsSeen.includes(registration)) {
        this.magicDoEffectRegistrationsSeen.push(registration);
      }
    }
  }

  private recordMagicControlPanelShimStatusDiagnostic(message: string): void {
    if (!message.includes('[magic_controlpanel_shim]')) return;

    if (message.includes('configureBuilder config.magicControlPanelShim =')) {
      const configured = this.parseTrailingBoolean(message);
      if (configured !== null) this.magicControlPanelShimConfigured = configured;
      return;
    }

    if (message.includes('RuffleInstanceBuilder received magic_control_panel_shim=')) {
      const enabled = this.parseTraceField(message, 'magic_control_panel_shim');
      if (enabled !== null) this.magicControlPanelShimBuilderReceived = enabled === 'true';
      return;
    }

    if (message.includes('PlayerBuilder received magic_control_panel_shim=')) {
      const enabled = this.parseTraceField(message, 'magic_control_panel_shim');
      if (enabled !== null) this.magicControlPanelShimPlayerBuilderReceived = enabled === 'true';
      return;
    }

    if (message.includes('Player constructed with magic_control_panel_shim=')) {
      const enabled = this.parseTraceField(message, 'magic_control_panel_shim');
      if (enabled !== null) this.magicControlPanelShimPlayerConstructed = enabled === 'true';
      return;
    }

    if (message.includes('EventDispatcher.addEventListener')) {
      const enabled = this.parseTraceField(message, 'flag');
      if (enabled !== null) this.magicControlPanelShimEventDispatcherFlag = enabled === 'true';
    }
  }

  private parseTraceField(message: string, key: string): string | null {
    const value = message.match(new RegExp(`${key}=([^\\s]+)`))?.[1] || null;
    return value ? value.replace(/%20/g, ' ') : null;
  }

  private parseTraceNumberField(message: string, key: string): number | null {
    const raw = this.parseTraceField(message, key);
    if (raw === null || raw === 'unknown' || raw === 'null') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  private parseTrailingBoolean(message: string): boolean | null {
    if (/\btrue\s*$/.test(message)) return true;
    if (/\bfalse\s*$/.test(message)) return false;
    return null;
  }

  private parseQuotedTraceField(message: string, key: string): string | null {
    return message.match(new RegExp(`${key}="([^"]*)"`))?.[1] || null;
  }

  private parseTraceCsvField(message: string, key: string): string[] | null {
    const raw = this.parseQuotedTraceField(message, key) || this.parseTraceField(message, key);
    if (!raw || raw === 'unknown' || raw === 'null') return null;
    return raw.split(',').map((value) => value.trim()).filter(Boolean);
  }

  private mogoWallTabNameFromIndex(index: number | null): string | null {
    switch (index) {
      case 1: return 'Messages';
      case 2: return 'Compose';
      case 3: return 'BuddyList';
      case 4: return 'IgnoredList';
      case 5: return 'RequestedList';
      case 6: return 'RewardSystem';
      case 7: return 'UserInfo';
      default: return null;
    }
  }

  private mogoWallViewNameFromAddMethod(method: string): string | null {
    if (method.endsWith('.addMessageView')) return 'Messages';
    if (method.endsWith('.addComposeView')) return 'Compose';
    if (method.endsWith('.addBuddyList')) return 'BuddyList';
    if (method.endsWith('.addRewardSystem')) return 'RewardSystem';
    if (method.endsWith('.addUserInfo')) return 'UserInfo';
    return null;
  }

  public recordMogoWallCommandSent(commandName: string): void {
    const normalized = commandName.startsWith('xt.') ? commandName.slice(3) : commandName;
    if (![
      'wall__getMessageTemplates',
      'user__getInventoryItems',
      'rewardSystem__getDetails',
      'user__getUserCardInfo',
      'buddyList__getUserBuddies',
      'wall__getUserMessages'
    ].includes(normalized)) {
      return;
    }

    this.lastMogoWallCommandActuallySentAfterTab = normalized;
    if (normalized === 'wall__getMessageTemplates') {
      this.composeTabNetworkCommandSent = true;
      this.wallComposeViewTemplatesRequestSent = true;
    } else if (normalized === 'user__getInventoryItems') {
      this.wallComposeViewInventoryRequestCount += 1;
    } else if (normalized === 'user__getUserCardInfo') {
      this.personalTabClickedSeen = true;
      this.lastMogoWallTabClickName = this.lastMogoWallTabClickName || 'UserInfo';
      this.lastMogoWallViewAfterSwitch = this.lastMogoWallViewAfterSwitch || 'UserInfo';
    }
  }

  public recordMagicCommandSent(commandName: string, payload?: string): void {
    const normalized = commandName.startsWith('sys.') ? commandName.slice(4) : commandName;
    if (normalized !== 'pubMsg' || !payload || !payload.includes('effect__')) {
      return;
    }

    const txtMatch = payload.match(/<txt>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/txt>/i);
    const raw = txtMatch?.[1] || '';
    if (!raw.startsWith('effect__')) {
      return;
    }

    const parts = raw.split('__');
    this.magicCommandSent = true;
    this.magicCommandName = 'effect__';
    this.magicCommandPayloadDecoded = {
      raw,
      effectName: parts[1] || null,
      targetOrUserId: parts[2] || null,
      pointOrFlag: parts[3] || null,
      maybeThrowFlag: parts[4] || null
    };
  }

  public recordMagicCommandResponse(shape: string): void {
    this.magicCommandResponseSeen = true;
    this.magicCommandResponseShape = shape;
  }

  public recordMogoWallInventoryResponseShape(responseObject: unknown): void {
    this.wallComposeViewInventoryResponseSeen = true;
    if (!responseObject || typeof responseObject !== 'object') {
      this.wallComposeViewInventoryParsedOk = false;
      this.lastInventoryResponseShapeKeys = [];
      this.lastInventoryItemShapeKeys = [];
      return;
    }

    const response = responseObject as Record<string, unknown>;
    this.lastInventoryResponseShapeKeys = Object.keys(response).sort();
    const items = Array.isArray(response.items) ? response.items : null;
    this.wallComposeViewInventoryParsedOk = items !== null;
    const firstItem = items?.find((item): item is Record<string, unknown> => !!item && typeof item === 'object');
    this.lastInventoryItemShapeKeys = firstItem ? Object.keys(firstItem).sort() : [];
  }

  public recordServerNameHoverText(text: string): void {
    this.serverNameHoverText = text;
  }

  public recordRoomMilestone(milestoneType: string, details?: Record<string, unknown>): void {
    const argsArr = Array.isArray(details?.args) ? (details!.args as unknown[]) : [];
    const pageName = String(details?.pageName || argsArr[0] || '');
    if (milestoneType === 'room20PageViewSeen') {
      this.room20PageViewSeen = true;
      this.roomPageViews.push({ pageName, ts: Date.now() });
    } else if (milestoneType === 'roomPageViewSeen') {
      this.roomPageViews.push({ pageName, ts: Date.now() });
    }
  }

  public recordFlashAlert(msg: string): void {
    this.flashAlerts.push({ msg, ts: Date.now() });
    if (msg.indexOf('mcSpecialEffectHolder') !== -1) {
      this.mcSpecialEffectHolderWarningSeen = true;
    }
    if (msg.indexOf('SwfParams is null') !== -1) {
      this.swfParamsNullSeen = true;
    }
  }

  public recordTrackEvent(category: string, action: string): void {
    this.trackEvents.push({ category, action, ts: Date.now() });
    if (category === 'Popup') {
      this.popupOpened.push(action);
    }
  }

  public record(
    type: string,
    options: {
      level?: 'info' | 'warn' | 'error';
      message?: string;
      details?: Record<string, unknown>;
    } = {}
  ): void {
    this.events.push({
      type,
      timestamp: Date.now(),
      level: options.level || 'info',
      message: options.message,
      details: options.details
    });

    const msg = String(options.message || options.details?.msg || '');
    const lowerMsg = msg.toLowerCase();

    if (
      type === 'diagnostic-report-failure' ||
      options.details?.diagnosticReportFailedCount !== undefined ||
      options.details?.lastDiagnosticReportFailedAt !== undefined ||
      options.details?.lastDiagnosticReportFailureMessage !== undefined
    ) {
      const count = Number(options.details?.diagnosticReportFailedCount || options.details?.failedCount || 0);
      this.diagnosticReportFailedCount = Math.max(this.diagnosticReportFailedCount, Number.isFinite(count) ? Math.floor(count) : this.diagnosticReportFailedCount + 1);
      const failedAt = Number(options.details?.lastDiagnosticReportFailedAt || 0);
      this.lastDiagnosticReportFailedAt = Number.isFinite(failedAt) && failedAt > 0 ? failedAt : Date.now();
      this.lastDiagnosticReportFailureMessage = String(options.details?.lastDiagnosticReportFailureMessage || options.message || '');
    }

    if (
      type === 'browser-console-freeze-signal' ||
      type === 'ruffle-trace' ||
      type === 'flash-log' ||
      type === 'external-interface'
    ) {
      this.recordUserExperienceCtorShimDiagnostic(msg, options.details);
      this.recordTextFlowEditorCtorShimDiagnostic(msg, options.details);
      this.recordButtonDataGridClearShimDiagnostic(msg, options.details);
      this.recordLoadingScreenTextCompatShimDiagnostic(msg, options.details);
      this.recordMogoWallTraceDiagnostic(msg);
      this.recordMagicTraceDiagnostic(msg);
      this.recordMagicCompatShimDiagnostic(msg);
      this.recordMagicControlPanelShimStatusDiagnostic(msg);
    }

    if (type === 'external-interface-timing') {
      const hook = String(options.details?.hook || options.message || 'unknown');
      const durationMs = typeof options.details?.durationMs === 'number'
        ? options.details.durationMs
        : Number(options.details?.durationMs || 0);
      this.externalInterfaceHookCounts[hook] = (this.externalInterfaceHookCounts[hook] || 0) + 1;
      this.externalInterfaceHookMaxDurationMs[hook] = Math.max(
        this.externalInterfaceHookMaxDurationMs[hook] || 0,
        durationMs
      );
      this.externalInterfaceHookTimingSamples.push({
        hook,
        durationMs,
        ts: Date.now(),
        msg: typeof options.details?.msg === 'string' ? options.details.msg : undefined
      });
      if (this.externalInterfaceHookTimingSamples.length > this.maxExternalInterfaceHookTimingSamples) {
        this.externalInterfaceHookTimingSamples.splice(
          0,
          this.externalInterfaceHookTimingSamples.length - this.maxExternalInterfaceHookTimingSamples
        );
      }
    }

    // Intercept trace logs for missing localization keys
    if (type === 'ruffle-trace' || type === 'flash-log' || type === 'external-interface') {
      if (msg.includes('sectionName:') && msg.includes('id:')) {
        const match = msg.match(/sectionName:\s*['"]([^'"]+)['"]\s+id:\s*['"]([^'"]+)['"]/);
        if (match) {
          const key = `${match[1]}.${match[2]}`;
          this.recordMissingLocalizationKey(key);
        }
      }
    }

    // Check for standard errors in Ruffle trace / ActionScript logs
    if (lowerMsg.includes('error') || lowerMsg.includes('exception') || lowerMsg.includes('fail') || lowerMsg.includes('null object reference')) {
      if (lowerMsg.includes('sound') || lowerMsg.includes('audio') || lowerMsg.includes('mp3')) {
        this.soundLoadErrorSeen = true;
      }
      if (lowerMsg.includes('avatar') || lowerMsg.includes('user') || lowerMsg.includes('mlroom')) {
        this.avatarCreationErrorSeen = true;
        this.avatarCreated = false;
        this.localUserCreated = false;
      }
      if (lowerMsg.includes('controlpanel') || lowerMsg.includes('control_panel') || lowerMsg.includes('btn')) {
        this.controlPanelInitErrorSeen = true;
        this.controlPanelInitialized = false;
        this.controlPanelVisible = false;
      }
    }

    if (type === 'ruffle-trace') {
      if (msg.includes('this is the first login') || msg.includes('last login:')) {
        this.loadingScreenHidden = true;
        this.controlPanelInitialized = true;
        this.controlPanelVisible = true;
        this.avatarCreated = true;
        this.localUserCreated = true;
      }
    }
    if (type === 'flash-log' || type === 'external-interface') {
      if (msg.includes('Claint log in successly') || msg.includes('login swf loaded')) {
        this.controlPanelInitialized = true;
      }
    }

    if (type === 'flash-log' || type === 'ruffle-trace' || type === 'external-interface') {
      if (
        lowerMsg.includes('socket.connect') ||
        lowerMsg.includes('connecting to') ||
        lowerMsg.includes('[sending]: <msg t=\'sys\'><body action=\'verchk\'') ||
        lowerMsg.includes('[sending]: <msg t="sys"><body action="verchk"')
      ) {
        this.socketConnectAttemptSeen = true;
      }
      if (lowerMsg.includes('socket connection failed') && lowerMsg.includes('bluebox')) {
        this.socketFallbackToBlueBoxSeen = true;
        this.socketFailureTraces.push({ msg, ts: Date.now() });
      }
      if (lowerMsg.includes('missing websocket proxy')) {
        this.missingWebSocketProxySeen = true;
        this.socketFailureTraces.push({ msg, ts: Date.now() });
      }
      if (
        lowerMsg.includes('socket error') ||
        lowerMsg.includes('websocket') ||
        lowerMsg.includes('bluebox') ||
        lowerMsg.includes('connection failed')
      ) {
        this.socketFailureTraces.push({ msg, ts: Date.now() });
      }
      if (this.socketFailureTraces.length > 50) {
        this.socketFailureTraces.splice(0, this.socketFailureTraces.length - 50);
      }

      if (lowerMsg.includes('onjoinroom') || lowerMsg.includes('room_change_evt')) {
        this.roomChangeEventSeen = true;
        this.avatarEventTraces.push(`[roomChangeEventSeen] ${msg}`);
      }
      if (lowerMsg.includes('onuserenterroom') || lowerMsg.includes('useradded_evt')) {
        this.userAddedEventSeen = true;
        this.avatarEventTraces.push(`[userAddedEventSeen] ${msg}`);
      }
      if (lowerMsg.includes('avatar') || lowerMsg.includes('myavatar') || lowerMsg.includes('avatarsmanger') || lowerMsg.includes('avatardocview')) {
        this.avatarEventTraces.push(`[avatarTrace] ${msg}`);
      }
    }

    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }
  }

  public getEvents(): RuffleDiagnosticEvent[] {
    return [...this.events];
  }

  public getExternalInterfaceTimingDiagnostics(): Record<string, unknown> {
    return {
      hookCounts: { ...this.externalInterfaceHookCounts },
      hookMaxDurationMs: { ...this.externalInterfaceHookMaxDurationMs },
      samples: [...this.externalInterfaceHookTimingSamples]
    };
  }

  public getReport(timeline: any, config?: any): Record<string, unknown> {
    const events = this.getEvents();
    const hasEvent = (type: string) => events.some((event) => event.type === type);
    const langCalls = this.getLanguageSetCalls();
    const defaultLanguage = config ? Number(config.defaultLanguage) : 4;

    return {
      generatedAt: new Date().toISOString(),
      runtime: 'ruffle-local',
      checklist: {
        rufflePageServed: hasEvent('page-served'),
        mogoSwfRequested: !!timeline?.milestones?.some((milestone: any) => milestone.name === 'Mogo.swf served'),
        loginSwfRequested: !!timeline?.milestones?.some((milestone: any) => milestone.name === 'Login.swf served'),
        loginGrSwfRequested: !!timeline?.milestones?.some((milestone: any) => milestone.name === 'loginGR.swf served'),
        loginURequested: !!timeline?.milestones?.some((milestone: any) => milestone.name === 'LoginU.aspx served'),
        loadingScreenRequested: !!timeline?.milestones?.some((milestone: any) => milestone.name === 'LoadingScreen_1.swf served'),
        tcpSocketAttemptObserved: !!timeline?.tcpObservedAt || hasEvent('socket-connect-attempt'),
        ruffleRuntimeLoaded: hasEvent('ruffle-runtime-loaded'),
        rufflePlayerCreated: hasEvent('ruffle-player-created')
      },
      visualDiagnostics: {
        room20PageViewSeen: this.room20PageViewSeen,
        mcSpecialEffectHolderWarningSeen: this.mcSpecialEffectHolderWarningSeen,
        swfParamsNullSeen: this.swfParamsNullSeen,
        controlPanelVisible: this.controlPanelVisible,
        controlPanelInitialized: this.controlPanelInitialized,
        avatarCreated: this.avatarCreated,
        localUserCreated: this.localUserCreated,
        loadingScreenHidden: this.loadingScreenHidden,
        lastPopupClassName: this.getLastPopupClassName(),
        roomPageViews: [...this.roomPageViews],
        flashAlerts: [...this.flashAlerts],
        lastFlashAlert: this.flashAlerts[this.flashAlerts.length - 1] || null,
        trackEvents: [...this.trackEvents],
        lastTrackEvent: this.trackEvents[this.trackEvents.length - 1] || null,
        missingAssetCounts: { ...this.missingAssetCounts },
        missingMp3Requests: [...this.missingMp3Requests],
        popupOpened: [...this.popupOpened],
        ...this.getSoundDiagnostics(),
        soundLoadErrorSeen: this.soundLoadErrorSeen,
        soundLoadSuccessSeen: this.soundLoadSuccessSeen,
        avatarCreationErrorSeen: this.avatarCreationErrorSeen,
        controlPanelInitErrorSeen: this.controlPanelInitErrorSeen,
        roomChangeEventSeen: this.roomChangeEventSeen,
        userAddedEventSeen: this.userAddedEventSeen,
        avatarEventTraces: [...this.avatarEventTraces]
      },
      room20Txt: this.getRoom20TxtReport(),
      mogoWallTxt: this.getMogoWallReport(),
      roomAssetDiagnostics: this.getRoomAssetDiagnosticsReport(),
      controlPanelAssetDiagnostics: this.getControlPanelAssetDiagnostics(),
      socketDiagnostics: this.getSocketDiagnostics(),
      externalInterfaceTimingDiagnostics: this.getExternalInterfaceTimingDiagnostics(),
      diagnosticTransport: {
        diagnosticReportFailedCount: this.diagnosticReportFailedCount,
        lastDiagnosticReportFailedAt: this.lastDiagnosticReportFailedAt,
        lastDiagnosticReportFailureMessage: this.lastDiagnosticReportFailureMessage
      },
      diagnosticReportFailedCount: this.diagnosticReportFailedCount,
      lastDiagnosticReportFailedAt: this.lastDiagnosticReportFailedAt,
      lastDiagnosticReportFailureMessage: this.lastDiagnosticReportFailureMessage,
      userExperienceCtorShimEnabled: this.userExperienceCtorShimEnabled,
      userExperienceCtorShimAppliedCount: this.userExperienceCtorShimAppliedCount,
      userExperienceCtorShimSkippedCount: this.userExperienceCtorShimSkippedCount,
      lastUserExperienceCtorShimAt: this.lastUserExperienceCtorShimAt,
      lastUserExperienceCtorShimSkipReason: this.lastUserExperienceCtorShimSkipReason,
      lastUserExperienceCtorShimArgTypes: [...this.lastUserExperienceCtorShimArgTypes],
      lastUserExperienceCtorShimDroppedArgType: this.lastUserExperienceCtorShimDroppedArgType,
      lastUserExperienceCtorShimArgValuesPreview: { ...this.lastUserExperienceCtorShimArgValuesPreview },
      lastUserExperienceCtorShimTextFieldScoreApplied: this.lastUserExperienceCtorShimTextFieldScoreApplied,
      textFlowEditorCtorShimEnabled: this.textFlowEditorCtorShimEnabled,
      textFlowEditorCtorShimAppliedCount: this.textFlowEditorCtorShimAppliedCount,
      textFlowEditorCtorShimSkippedCount: this.textFlowEditorCtorShimSkippedCount,
      lastTextFlowEditorCtorShimAt: this.lastTextFlowEditorCtorShimAt,
      lastTextFlowEditorCtorShimSkipReason: this.lastTextFlowEditorCtorShimSkipReason,
      lastTextFlowEditorCtorShimArgTypes: [...this.lastTextFlowEditorCtorShimArgTypes],
      lastTextFlowEditorCtorShimArgValuesPreview: { ...this.lastTextFlowEditorCtorShimArgValuesPreview },
      lastTextFlowEditorCtorShimDroppedArgTypes: [...this.lastTextFlowEditorCtorShimDroppedArgTypes],
      lastTextFlowEditorCtorShimCallSiteMethod: this.lastTextFlowEditorCtorShimCallSiteMethod,
      lastTextFlowEditorCtorShimCallerSwf: this.lastTextFlowEditorCtorShimCallerSwf,
      textFlowEditorCtorMismatchSeen: this.textFlowEditorCtorMismatchSeen,
      textFlowEditorCtorMismatchReceiverClassLoadedFromSwf: this.textFlowEditorCtorMismatchReceiverClassLoadedFromSwf,
      controlPanelMethodsSeen: [...this.controlPanelMethodsSeen],
      controlPanelButtonClickSeen: this.controlPanelButtonClickSeen,
      controlPanelClickedButtonName: this.controlPanelClickedButtonName,
      controlPanelClickedButtonPath: this.controlPanelClickedButtonPath,
      controlPanelClickedButtonTooltip: this.controlPanelClickedButtonTooltip,
      specialMoveInitSeen: this.specialMoveInitSeen,
      specialEffectInitSeen: this.specialEffectInitSeen,
      specialHolderName: this.specialHolderName,
      specialHolderVisibleAtInit: this.specialHolderVisibleAtInit,
      specialHolderVisibleAfterClick: this.specialHolderVisibleAfterClick,
      specialHolderMouseEnabled: this.specialHolderMouseEnabled,
      specialHolderMouseChildren: this.specialHolderMouseChildren,
      specialInnerButtonCount: this.specialInnerButtonCount,
      specialInnerButtonNames: [...this.specialInnerButtonNames],
      specialInnerButtonMouseEnabledList: [...this.specialInnerButtonMouseEnabledList],
      specialInnerButtonVisibleList: [...this.specialInnerButtonVisibleList],
      ...this.getControlPanelAssetDiagnostics(),
      specialInnerButtonClickSeen: this.specialInnerButtonClickSeen,
      specialInnerButtonClickedName: this.specialInnerButtonClickedName,
      specialInnerButtonClickedPath: this.specialInnerButtonClickedPath,
      magicCompatShimApplied: this.magicCompatShimApplied,
      magicCompatShimReason: this.magicCompatShimReason,
      magicDoEffectOriginalHandler: this.magicDoEffectOriginalHandler,
      magicDoEffectCompatHandler: this.magicDoEffectCompatHandler,
      magicDoEffectRegistrationsSeen: this.magicDoEffectRegistrationsSeen,
      magicDoEffectRegistrationCount: this.magicDoEffectRegistrationCount,
      magicControlPanelShimConfigured: this.magicControlPanelShimConfigured,
      magicControlPanelShimBuilderReceived: this.magicControlPanelShimBuilderReceived,
      magicControlPanelShimPlayerBuilderReceived: this.magicControlPanelShimPlayerBuilderReceived,
      magicControlPanelShimPlayerConstructed: this.magicControlPanelShimPlayerConstructed,
      magicControlPanelShimEventDispatcherFlag: this.magicControlPanelShimEventDispatcherFlag,
      onEffectSendSeen: this.onEffectSendSeen,
      onSpecialMoveSendSeen: this.onSpecialMoveSendSeen,
      EffectOnClickSeen: this.effectOnClickSeen,
      SpecialEffectControlOnSelectEffectSeen: this.specialEffectControlOnSelectEffectSeen,
      magicButtonSeen: this.magicButtonSeen,
      magicButtonVisible: this.magicButtonVisible,
      magicButtonEnabled: this.magicButtonEnabled,
      magicButtonMouseEnabled: this.magicButtonMouseEnabled,
      magicButtonMouseChildren: this.magicButtonMouseChildren,
      magicButtonTooltipText: this.magicButtonTooltipText,
      magicPanelSeen: this.magicPanelSeen,
      magicPanelVisible: this.magicPanelVisible,
      magicPanelInitiallyOpen: this.magicPanelInitiallyOpen,
      magicPanelOpenState: this.magicPanelOpenState,
      magicPanelExpectedClosedAtStartup: this.magicPanelExpectedClosedAtStartup,
      magicPanelParentPath: this.magicPanelParentPath,
      magicPanelBounds: this.magicPanelBounds,
      magicPanelAlpha: this.magicPanelAlpha,
      magicPanelMouseEnabled: this.magicPanelMouseEnabled,
      magicPanelMouseChildren: this.magicPanelMouseChildren,
      magicButtonClickSeen: this.magicButtonClickSeen,
      magicButtonMouseDownSeen: this.magicButtonMouseDownSeen,
      magicButtonMouseUpSeen: this.magicButtonMouseUpSeen,
      magicButtonClickTargetClass: this.magicButtonClickTargetClass,
      magicButtonClickTargetName: this.magicButtonClickTargetName,
      magicButtonClickTargetPath: this.magicButtonClickTargetPath,
      magicPanelClickSeen: this.magicPanelClickSeen,
      magicInnerButtonClickSeen: this.magicInnerButtonClickSeen,
      magicInnerButtonTargetClass: this.magicInnerButtonTargetClass,
      magicInnerButtonTargetName: this.magicInnerButtonTargetName,
      magicInnerButtonTargetPath: this.magicInnerButtonTargetPath,
      magicInnerButtonIndex: this.magicInnerButtonIndex,
      magicInnerButtonEnabled: this.magicInnerButtonEnabled,
      magicInnerButtonMouseEnabled: this.magicInnerButtonMouseEnabled,
      magicInnerButtonVisible: this.magicInnerButtonVisible,
      magicInnerButtonAlpha: this.magicInnerButtonAlpha,
      magicClickBlockedByClass: this.magicClickBlockedByClass,
      magicClickBlockedByName: this.magicClickBlockedByName,
      magicClickBlockedByPath: this.magicClickBlockedByPath,
      magicHitTestTopObjectClass: this.magicHitTestTopObjectClass,
      magicHitTestTopObjectName: this.magicHitTestTopObjectName,
      controlPanelHitTestTopObjectClass: this.controlPanelHitTestTopObjectClass,
      controlPanelHitTestTopObjectName: this.controlPanelHitTestTopObjectName,
      controlPanelHitTestTopObjectPath: this.controlPanelHitTestTopObjectPath,
      controlPanelHitTestTopObjectBounds: this.controlPanelHitTestTopObjectBounds,
      controlPanelHitTestAncestorChain: this.controlPanelHitTestAncestorChain,
      controlPanelClickBlockedByClass: this.controlPanelClickBlockedByClass,
      controlPanelClickBlockedByName: this.controlPanelClickBlockedByName,
      controlPanelClickBlockedByPath: this.controlPanelClickBlockedByPath,
      controlPanelBounds: this.controlPanelBounds,
      magicButtonBounds: this.magicButtonBounds,
      magicButtonGlobalBounds: this.magicButtonGlobalBounds,
      popupLayerTopObject: this.popupLayerTopObject,
      popupLayerBlocksControlPanel: this.popupLayerBlocksControlPanel,
      activePopupClassName: this.activePopupClassName,
      activePopupMouseEnabled: this.activePopupMouseEnabled,
      activePopupMouseChildren: this.activePopupMouseChildren,
      magicLocalExceptionSeen: this.magicLocalExceptionSeen,
      magicLocalExceptionClass: this.magicLocalExceptionClass,
      magicLocalExceptionMessage: this.magicLocalExceptionMessage,
      magicLocalExceptionMethod: this.magicLocalExceptionMethod,
      currentExecutingAvm2Method: this.currentExecutingAvm2Method,
      magicCommandSent: this.magicCommandSent,
      magicCommandName: this.magicCommandName,
      magicCommandPayloadDecoded: this.magicCommandPayloadDecoded,
      magicCommandResponseSeen: this.magicCommandResponseSeen,
      magicCommandResponseShape: this.magicCommandResponseShape,
      magicUnhandledCommandSeen: this.magicUnhandledCommandSeen,
      magicUnhandledCommandName: this.magicUnhandledCommandName,
      buttonDataGridClearShimEnabled: this.buttonDataGridClearShimEnabled,
      buttonDataGridClearShimAppliedCount: this.buttonDataGridClearShimAppliedCount,
      buttonDataGridClearShimMode: this.buttonDataGridClearShimMode,
      buttonDataGridClearShimFallbackReason: this.buttonDataGridClearShimFallbackReason,
      lastButtonDataGridClearShimAt: this.lastButtonDataGridClearShimAt,
      lastButtonDataGridClearShimReceiverClass: this.lastButtonDataGridClearShimReceiverClass,
      lastButtonDataGridClearShimCallerSwf: this.lastButtonDataGridClearShimCallerSwf,
      lastButtonDataGridClearShimCallSiteMethod: this.lastButtonDataGridClearShimCallSiteMethod,
      buttonDataGridClearShimRemovedMcItems: this.buttonDataGridClearShimRemovedMcItems,
      buttonDataGridClearShimRecreatedMcItems: this.buttonDataGridClearShimRecreatedMcItems,
      buttonDataGridClearShimResetSelectedItem: this.buttonDataGridClearShimResetSelectedItem,
      personalCardDestroyErrorSeen: this.personalCardDestroyErrorSeen,
      personalCardDestroyErrorClass: this.personalCardDestroyErrorClass,
      personalCardDestroyErrorMessage: this.personalCardDestroyErrorMessage,
      currentlyExecutingAvm2Method: this.personalCardDestroyErrorMethod,
      lastMogoWallTabBeforeDestroy: this.lastMogoWallTabBeforeDestroy,
      lastMogoWallTabAfterDestroy: this.lastMogoWallTabAfterDestroy,
      lastMogoWallTabClickName: this.lastMogoWallTabClickName,
      lastMogoWallTabClickIndex: this.lastMogoWallTabClickIndex,
      lastMogoWallViewBeforeSwitch: this.lastMogoWallViewBeforeSwitch,
      lastMogoWallViewAfterSwitch: this.lastMogoWallViewAfterSwitch,
      lastMogoWallDestroyViewCalled: this.lastMogoWallDestroyViewCalled,
      lastMogoWallDestroyViewErrorSeen: this.lastMogoWallDestroyViewErrorSeen,
      lastMogoWallDestroyViewErrorMessage: this.lastMogoWallDestroyViewErrorMessage,
      lastMogoWallAddViewCalled: this.lastMogoWallAddViewCalled,
      lastMogoWallAddViewErrorSeen: this.lastMogoWallAddViewErrorSeen,
      lastMogoWallAddViewErrorMessage: this.lastMogoWallAddViewErrorMessage,
      lastMogoWallCommandExpectedAfterTab: this.lastMogoWallCommandExpectedAfterTab,
      lastMogoWallCommandActuallySentAfterTab: this.lastMogoWallCommandActuallySentAfterTab,
      anyMogoWallMouseClickSeen: this.anyMogoWallMouseClickSeen,
      clickedDisplayObjectClass: this.clickedDisplayObjectClass,
      clickedDisplayObjectName: this.clickedDisplayObjectName,
      clickedDisplayObjectPath: this.clickedDisplayObjectPath,
      clickedTooltipText: this.clickedTooltipText,
      clickedTabButtonIndexRaw: this.clickedTabButtonIndexRaw,
      clickedTabButtonMappedPage: this.clickedTabButtonMappedPage,
      gotoPageCalled: this.gotoPageCalled,
      gotoPageIndex: this.gotoPageIndex,
      requestTabViewCalled: this.requestTabViewCalled,
      requestTabViewIndex: this.requestTabViewIndex,
      requestTabViewResolvedName: this.requestTabViewResolvedName,
      tabButtonEnabled: this.tabButtonEnabled,
      tabButtonMouseEnabled: this.tabButtonMouseEnabled,
      tabButtonVisible: this.tabButtonVisible,
      tabButtonAlpha: this.tabButtonAlpha,
      tabButtonHitTestBlockedBy: this.tabButtonHitTestBlockedBy,
      tabClickExceptionSeen: this.tabClickExceptionSeen,
      tabClickExceptionClass: this.tabClickExceptionClass,
      tabClickExceptionMessage: this.tabClickExceptionMessage,
      tabClickExceptionMethod: this.tabClickExceptionMethod,
      composeTabClickedSeen: this.composeTabClickedSeen,
      addComposeViewCalled: this.addComposeViewCalled,
      'WallComposeView.initCalled': this.wallComposeViewInitCalled,
      'WallComposeView.inventoryRequestCount': this.wallComposeViewInventoryRequestCount,
      'WallComposeView.inventoryResponseSeen': this.wallComposeViewInventoryResponseSeen,
      'WallComposeView.inventoryParsedOk': this.wallComposeViewInventoryParsedOk,
      'WallComposeView.templatesRequestExpected': this.wallComposeViewTemplatesRequestExpected,
      'WallComposeView.templatesRequestSent': this.wallComposeViewTemplatesRequestSent,
      WallComposeViewInitCalled: this.wallComposeViewInitCalled,
      WallComposeViewInitContentCalled: this.wallComposeViewInitContentCalled,
      WallComposeViewInitFriendListCalled: this.wallComposeViewInitFriendListCalled,
      WallComposeViewInitTemplatesCalled: this.wallComposeViewInitTemplatesCalled,
      WallComposeViewRequestTemplatesCalled: this.wallComposeViewRequestTemplatesCalled,
      WallComposeViewInventoryRequestCount: this.wallComposeViewInventoryRequestCount,
      WallComposeViewInventoryResponseSeen: this.wallComposeViewInventoryResponseSeen,
      WallComposeViewInventoryParsedOk: this.wallComposeViewInventoryParsedOk,
      WallComposeViewTemplatesRequestExpected: this.wallComposeViewTemplatesRequestExpected,
      WallComposeViewTemplatesRequestSent: this.wallComposeViewTemplatesRequestSent,
      lastInventoryResponseShapeKeys: [...this.lastInventoryResponseShapeKeys],
      lastInventoryItemShapeKeys: [...this.lastInventoryItemShapeKeys],
      composeTabNetworkCommandSent: this.composeTabNetworkCommandSent,
      personalTabClickedSeen: this.personalTabClickedSeen,
      personalTabExitAttemptSeen: this.personalTabExitAttemptSeen,
      mogoWallCloseClickedSeen: this.mogoWallCloseClickedSeen,
      mogoWallCloseHandlerEntered: this.mogoWallCloseHandlerEntered,
      mogoWallCloseCurrentViewClass: this.mogoWallCloseCurrentViewClass,
      mogoWallCloseCurrentTabName: this.mogoWallCloseCurrentTabName,
      mogoWallCloseDestroyViewCalled: this.mogoWallCloseDestroyViewCalled,
      mogoWallCloseRemovePopupCalled: this.mogoWallCloseRemovePopupCalled,
      mogoWallCloseOverlayRemoved: this.mogoWallCloseOverlayRemoved,
      mogoWallCloseStageChildrenBefore: this.mogoWallCloseStageChildrenBefore,
      mogoWallCloseStageChildrenAfter: this.mogoWallCloseStageChildrenAfter,
      mogoWallCloseBlockedStateRemaining: this.mogoWallCloseBlockedStateRemaining,
      mogoWallCloseExceptionSeen: this.mogoWallCloseExceptionSeen,
      mogoWallCloseExceptionMessage: this.mogoWallCloseExceptionMessage,
      mogoWallLocalExceptionSeen: this.mogoWallLocalExceptionSeen,
      mogoWallLocalExceptionClass: this.mogoWallLocalExceptionClass,
      mogoWallLocalExceptionMessage: this.mogoWallLocalExceptionMessage,
      mogoWallLocalExceptionMethod: this.mogoWallLocalExceptionMethod,
      mogoWallCompatibilityMismatchSeen: this.mogoWallCompatibilityMismatchSeen,
      mismatchCallerSwf: this.mismatchCallerSwf,
      mismatchCallerClass: this.mismatchCallerClass,
      mismatchCallerMethod: this.mismatchCallerMethod,
      mismatchExpectedReceiverClass: this.mismatchExpectedReceiverClass,
      mismatchMissingMethod: this.mismatchMissingMethod,
      mismatchReceiverClassLoadedFromSwf: this.mismatchReceiverClassLoadedFromSwf,
      mismatchReceiverClassDefiningMovie: this.mismatchReceiverClassDefiningMovie,
      mismatchLikelyCause: this.mismatchLikelyCause,
      mismatchSuggestedAction: this.mismatchSuggestedAction,
      languageDiagnostics: {
        languageSetCalls: langCalls,
        languageChangedToZero: langCalls.includes('0'),
        languageChangedToDefault: langCalls.includes(String(defaultLanguage)),
        firstLanguageValue: langCalls[0] || null,
        finalLanguageValue: langCalls[langCalls.length - 1] || null,
        defaultLanguage,
        // lastLangIdRequested: the lang= parameter actually used by the SWF when requesting lang.aspx
        // Expected: '1' (Hebrew). If '4' or null, the Lang FlashVar was not received by the SWF.
        lastLangIdRequested: this.lastLangIdRequested,
        languageAssetRequests: [...this.languageAssetRequests],
        languageAssetMissing: [...this.languageAssetMissing],
        languageAssetServed: [...this.languageAssetServed],
        lastLanguageXmlKeys: this.lastLanguageXmlKeys,
        missingLocalizationKeys: [...this.missingLocalizationKeys],
        serverNameHoverText: this.serverNameHoverText,
        // languageSectionsPresent: which critical XML sections exist in the served lang.aspx.
        // 'Buttuns' must be true after the alias injection fix (SWF getButtonAlt typo workaround).
        languageSectionsPresent: { ...this.languageSectionsPresent }
      },
      compatLoadingScreenTextMode: this.compatLoadingScreenTextMode,
      compatLoadingScreenTextApplied: this.compatLoadingScreenTextApplied,
      compatLoadingScreenOriginalWasTlf: this.compatLoadingScreenOriginalWasTlf,
      compatLoadingScreenOriginalLength: this.compatLoadingScreenOriginalLength,
      compatLoadingScreenExtractedPlainText: this.compatLoadingScreenExtractedPlainText,
      compatLoadingScreenReplacementLength: this.compatLoadingScreenReplacementLength,
      loadingScreenCompatResolvedMessage: this.loadingScreenCompatResolvedMessage,
      loadingScreenCompatResolvedMessageLength: this.loadingScreenCompatResolvedMessageLength,
      loadingScreenCompatResolvedMessagePreview: this.loadingScreenCompatResolvedMessagePreview,
      fontClassCreateTextLayoutInputKind: this.fontClassCreateTextLayoutInputKind,
      fontClassCreateTextLayoutInputLength: this.fontClassCreateTextLayoutInputLength,
      loadingScreenInputModeActuallyUsed: this.loadingScreenInputModeActuallyUsed,
      fontClassCreateTextLayoutReturnedObjectType: this.fontClassCreateTextLayoutReturnedObjectType,
      loadingScreenCreateTextLayoutReturnedNull: this.loadingScreenCreateTextLayoutReturnedNull,
      loadingScreenCreateTextLayoutError: this.loadingScreenCreateTextLayoutError,
      loadingScreenTextAddedToDisplayList: this.loadingScreenTextAddedToDisplayList,
      loadingScreenTextDisplayObjectBounds: this.loadingScreenTextDisplayObjectBounds,
      loadingScreenTextAlphaVisible: this.loadingScreenTextAlphaVisible,
      loadingScreenTextEnvelopeBuilt: this.loadingScreenTextEnvelopeBuilt,
      loadingScreenTextEnvelopeSource: this.loadingScreenTextEnvelopeSource,
      loadingScreenTextEnvelopeCandidateCount: this.loadingScreenTextEnvelopeCandidateCount,
      loadingScreenTextEnvelopePreviewSafe: this.loadingScreenTextEnvelopePreviewSafe,
      loadingScreenTextEnvelopeDecoded: this.loadingScreenTextEnvelopeDecoded,
      loadingScreenTextSelectedPreview: this.loadingScreenTextSelectedPreview,
      loadingScreenTextEnvelopeDecodeError: this.loadingScreenTextEnvelopeDecodeError,
      loadingScreenTextCompatShimConfigured: this.loadingScreenTextCompatShimConfigured,
      loadingScreenTextCompatFallbackTextLength: this.loadingScreenTextCompatFallbackTextLength,
      loadingScreenTextCompatShimEnabled: this.loadingScreenTextCompatShimEnabled,
      loadingScreenTextFieldCompatApplied: this.loadingScreenTextFieldCompatApplied,
      loadingScreenTextRenderPath: this.loadingScreenTextRenderPath,
      loadingScreenTextFieldCompatReason: this.loadingScreenTextFieldCompatReason,
      loadingScreenTextFieldBoundsBefore: this.loadingScreenTextFieldBoundsBefore,
      loadingScreenTextFieldBoundsAfter: this.loadingScreenTextFieldBoundsAfter,
      loadingScreenTextFieldTextLength: this.loadingScreenTextFieldTextLength,
      loadingScreenTextFieldFont: this.loadingScreenTextFieldFont,
      loadingScreenTextFieldColor: this.loadingScreenTextFieldColor,
      loadingScreenTextCallStackMatched: this.loadingScreenTextCallStackMatched,
      // ruffleConfig: active Ruffle font/renderer settings applied to the served play-ruffle.html page.
      // hebrewFontWorkaroundEnabled: true means CSS @font-face Hebrew unicode-range was injected.
      // rendererPreference: requested renderer hint (Ruffle 0.2.0 may not honour it directly).
      ruffleConfig: {
        ...this.rufflePageConfig,
        ruffleVersion: '0.2.0',
        ruffleDefaultFonts: { ...this.ruffleDefaultFonts },
        ruffleDeviceFontRenderer: this.ruffleDeviceFontRenderer,
        ruffleFontSources: [...this.ruffleFontSources],
        fontSourceRequests: [...this.fontSourceRequests],
        fontSourceServed: [...this.fontSourceServed],
        fontSourceMissing: [...this.fontSourceMissing]
      },
      ruffleDefaultFonts: { ...this.ruffleDefaultFonts },
      ruffleDeviceFontRenderer: this.ruffleDeviceFontRenderer,
      ruffleFontSources: [...this.ruffleFontSources],
      fontSourceRequests: [...this.fontSourceRequests],
      fontSourceServed: [...this.fontSourceServed],
      fontSourceMissing: [...this.fontSourceMissing],
      ...this.getCanvasTextDiagnosticsReport(),
      rtlTextWorkaroundEnabled: this.rtlTextWorkaroundEnabled,
      rtlWrappedStringCount: this.rtlWrappedStringCount,
      rtlWrapMode: this.rtlWrapMode,
      sampleRtlWrappedKeys: [...this.sampleRtlWrappedKeys],
      rtlTextMode: this.rtlTextMode,
      rtlVisualReverseCount: this.rtlVisualReverseCount,
      sampleVisualReverseBeforeAfter: [...this.sampleVisualReverseBeforeAfter],
      rtlTransformScope: this.rtlTransformScope,
      rtlAllowlistedKeys: [...this.rtlAllowlistedKeys],
      rtlTransformedKeys: [...this.rtlTransformedKeys],
      rtlSkippedBecauseNotAllowlisted: [...this.rtlSkippedBecauseNotAllowlisted],
      errors: events.filter((event) => event.level === 'error'),
      warnings: events.filter((event) => event.level === 'warn'),
      events,
      timeline
    };
  }

  public clear(): void {
    this.events = [];
    this.languageSetCalls = [];
    this.room20PageViewSeen = false;
    this.mcSpecialEffectHolderWarningSeen = false;
    this.swfParamsNullSeen = false;
    this.flashAlerts = [];
    this.roomPageViews = [];
    this.trackEvents = [];
    this.room20TxtRequested = false;
    this.room20TxtServed = false;
    this.room20TxtSizeBytes = 0;
    this.room20TxtJsonValid = false;
    this.room20TxtTopLevelKeys = [];
    this.room20TxtParseError = null;
    this.mogoWallSwfRequested = false;
    this.mogoWallSwfServed = false;
    this.mogoWallTxtRequested = false;
    this.mogoWallTxtServed = false;
    this.mogoWallTxtJsonValid = false;
    this.mogoWallConfigKeys = [];
    this.controlPanelVisible = null;
    this.controlPanelInitialized = null;
    this.avatarCreated = null;
    this.localUserCreated = null;
    this.exactRoomAssetRequests = [];
    this.roomLoaderRequestedNames = [];
    this.roomSwfRequestedNames = [];
    this.roomTxtRequestedNames = [];
    this.lastRoomLoaded = null;
    this.anyRequestContainingRoomRoom20 = false;
    this.anyRequestContainingRoom20 = false;
    this.loadingScreenHidden = null;
    this.missingAssetCounts = {};
    this.missingMp3Requests = [];
    this.popupOpened = [];
    this.soundRequests = [];
    this.soundServed = [];
    this.soundMissing = [];
    this.soundResolvedPath = {};
    this.soundContentType = {};
    this.soundLoadErrorSeen = false;
    this.soundLoadSuccessSeen = false;
    this.roomSoundConfigField = null;
    this.roomSoundConfigValue = null;
    this.roomSoundExpectedUrl = null;
    this.roomSoundRequested = false;
    this.roomSoundServed = false;
    this.roomSoundLoadError = false;
    this.roomSoundPlayAttemptSeen = false;
    this.roomSoundChannelCreated = false;
    this.roomSoundLoopRequested = null;
    this.roomSoundVolume = null;
    this.roomSoundMuted = null;
    this.roomSoundStoppedOnTransition = false;
    this.roomSoundStartedAfterTransition = false;
    this.lastRoomSoundRoomName = null;
    this.roomBackSoundVarSent = false;
    this.roomBackSoundVarValue = null;
    this.roomBackSoundExpectedUrl = null;
    this.roomBackSoundExpectedRequestUrl = null;
    this.roomBackSoundRequested = false;
    this.roomBackSoundServed = false;
    this.roomBackSoundLoadError = false;
    this.roomBackSoundPlayAttemptSeen = false;
    this.roomBackSoundStarted = false;
    this.roomBackSoundStoppedOnTransition = false;
    this.roomBackSoundVolume = null;
    this.roomBackSoundLoop = null;
    this.lastRoomBackSoundRoomName = null;
    this.roomBackSoundActualRequestUrl = null;
    this.roomBackSoundMalformedRequestUrl = null;
    this.roomBackSoundRequestSeen = false;
    this.roomBackSoundPlayCalled = false;
    this.roomBackSoundChannelNonNull = false;
    this.roomBackSoundAudibleLikely = false;
    this.roomBackSoundStoppedImmediately = false;
    this.avatarCreationErrorSeen = false;
    this.controlPanelInitErrorSeen = false;
    this.roomChangeEventSeen = false;
    this.userAddedEventSeen = false;
    this.avatarEventTraces = [];
    this.socketConnectAttemptSeen = false;
    this.socketFallbackToBlueBoxSeen = false;
    this.missingWebSocketProxySeen = false;
    this.socketFailureTraces = [];
    this.externalInterfaceHookCounts = {};
    this.externalInterfaceHookMaxDurationMs = {};
    this.externalInterfaceHookTimingSamples = [];
    this.languageAssetRequests = [];
    this.languageAssetMissing = [];
    this.languageAssetServed = [];
    this.lastLanguageXmlKeys = 0;
    this.lastLangIdRequested = null;
    this.missingLocalizationKeys = [];
    this.serverNameHoverText = 'שרת שימור מקומי';
    this.languageSectionsPresent = {};
    this.compatLoadingScreenTextMode = 'off';
    this.compatLoadingScreenTextApplied = false;
    this.compatLoadingScreenOriginalWasTlf = false;
    this.compatLoadingScreenOriginalLength = 0;
    this.compatLoadingScreenExtractedPlainText = null;
    this.compatLoadingScreenReplacementLength = 0;
    this.loadingScreenCompatResolvedMessage = null;
    this.loadingScreenCompatResolvedMessageLength = 0;
    this.loadingScreenCompatResolvedMessagePreview = null;
    this.fontClassCreateTextLayoutInputKind = 'unknown';
    this.fontClassCreateTextLayoutInputLength = 0;
    this.loadingScreenInputModeActuallyUsed = null;
    this.fontClassCreateTextLayoutReturnedObjectType = null;
    this.loadingScreenCreateTextLayoutReturnedNull = null;
    this.loadingScreenCreateTextLayoutError = null;
    this.loadingScreenTextAddedToDisplayList = null;
    this.loadingScreenTextDisplayObjectBounds = null;
    this.loadingScreenTextAlphaVisible = null;
    this.loadingScreenTextEnvelopeBuilt = false;
    this.loadingScreenTextEnvelopeSource = null;
    this.loadingScreenTextEnvelopeCandidateCount = 0;
    this.loadingScreenTextEnvelopePreviewSafe = null;
    this.loadingScreenTextEnvelopeDecoded = false;
    this.loadingScreenTextSelectedPreview = null;
    this.loadingScreenTextEnvelopeDecodeError = null;
    this.loadingScreenTextCompatShimConfigured = false;
    this.loadingScreenTextCompatFallbackTextLength = 0;

    this.loadingScreenTextCompatShimEnabled = false;
    this.loadingScreenTextFieldCompatApplied = false;
    this.loadingScreenTextRenderPath = 'unknown';
    this.loadingScreenTextFieldCompatReason = null;
    this.loadingScreenTextFieldBoundsBefore = null;
    this.loadingScreenTextFieldBoundsAfter = null;
    this.loadingScreenTextFieldTextLength = null;
    this.loadingScreenTextFieldFont = null;
    this.loadingScreenTextFieldColor = null;
    this.loadingScreenTextCallStackMatched = null;

    this.rufflePageConfig = { hebrewFontWorkaroundEnabled: false, rendererPreference: 'auto' };
    this.ruffleFontSources = [];
    this.ruffleDefaultFonts = {};
    this.ruffleDeviceFontRenderer = null;
    this.fontSourceRequests = [];
    this.fontSourceServed = [];
    this.fontSourceMissing = [];
    this.canvasTextInterceptorActive = false;
    this.canvasTextTotalDrawCount = 0;
    this.canvasHebrewTextDrawCount = 0;
    this.canvasTextFontsSeen = {};
    this.canvasTextMethodCounts = {};
    this.canvasHebrewTextSamples = [];
    this.diagnosticReportFailedCount = 0;
    this.lastDiagnosticReportFailedAt = null;
    this.lastDiagnosticReportFailureMessage = null;
    this.userExperienceCtorShimEnabled = false;
    this.userExperienceCtorShimAppliedCount = 0;
    this.userExperienceCtorShimSkippedCount = 0;
    this.lastUserExperienceCtorShimAt = null;
    this.lastUserExperienceCtorShimSkipReason = null;
    this.lastUserExperienceCtorShimArgTypes = [];
    this.lastUserExperienceCtorShimDroppedArgType = null;
    this.lastUserExperienceCtorShimArgValuesPreview = {};
    this.lastUserExperienceCtorShimTextFieldScoreApplied = null;
    this.textFlowEditorCtorShimEnabled = false;
    this.textFlowEditorCtorShimAppliedCount = 0;
    this.textFlowEditorCtorShimSkippedCount = 0;
    this.lastTextFlowEditorCtorShimAt = null;
    this.lastTextFlowEditorCtorShimSkipReason = null;
    this.lastTextFlowEditorCtorShimArgTypes = [];
    this.lastTextFlowEditorCtorShimArgValuesPreview = {};
    this.lastTextFlowEditorCtorShimDroppedArgTypes = [];
    this.lastTextFlowEditorCtorShimCallSiteMethod = null;
    this.lastTextFlowEditorCtorShimCallerSwf = null;
    this.textFlowEditorCtorMismatchSeen = false;
    this.textFlowEditorCtorMismatchReceiverClassLoadedFromSwf = null;
    this.buttonDataGridClearShimEnabled = false;
    this.buttonDataGridClearShimAppliedCount = 0;
    this.buttonDataGridClearShimMode = null;
    this.buttonDataGridClearShimFallbackReason = null;
    this.lastButtonDataGridClearShimAt = null;
    this.lastButtonDataGridClearShimReceiverClass = null;
    this.lastButtonDataGridClearShimCallerSwf = null;
    this.lastButtonDataGridClearShimCallSiteMethod = null;
    this.buttonDataGridClearShimRemovedMcItems = false;
    this.buttonDataGridClearShimRecreatedMcItems = false;
    this.buttonDataGridClearShimResetSelectedItem = false;
    this.personalCardDestroyErrorSeen = false;
    this.personalCardDestroyErrorClass = null;
    this.personalCardDestroyErrorMessage = null;
    this.personalCardDestroyErrorMethod = null;
    this.lastMogoWallTabBeforeDestroy = null;
    this.lastMogoWallTabAfterDestroy = null;
    this.lastMogoWallTabClickName = null;
    this.lastMogoWallTabClickIndex = null;
    this.lastMogoWallViewBeforeSwitch = null;
    this.lastMogoWallViewAfterSwitch = null;
    this.lastMogoWallDestroyViewCalled = false;
    this.lastMogoWallDestroyViewErrorSeen = false;
    this.lastMogoWallDestroyViewErrorMessage = null;
    this.lastMogoWallAddViewCalled = null;
    this.lastMogoWallAddViewErrorSeen = false;
    this.lastMogoWallAddViewErrorMessage = null;
    this.lastMogoWallCommandExpectedAfterTab = null;
    this.lastMogoWallCommandActuallySentAfterTab = null;
    this.anyMogoWallMouseClickSeen = false;
    this.clickedDisplayObjectClass = null;
    this.clickedDisplayObjectName = null;
    this.clickedDisplayObjectPath = null;
    this.clickedTooltipText = null;
    this.clickedTabButtonIndexRaw = null;
    this.clickedTabButtonMappedPage = null;
    this.gotoPageCalled = false;
    this.gotoPageIndex = null;
    this.requestTabViewCalled = false;
    this.requestTabViewIndex = null;
    this.requestTabViewResolvedName = null;
    this.tabButtonEnabled = null;
    this.tabButtonMouseEnabled = null;
    this.tabButtonVisible = null;
    this.tabButtonAlpha = null;
    this.tabButtonHitTestBlockedBy = null;
    this.tabClickExceptionSeen = false;
    this.tabClickExceptionClass = null;
    this.tabClickExceptionMessage = null;
    this.tabClickExceptionMethod = null;
    this.composeTabClickedSeen = false;
    this.addComposeViewCalled = false;
    this.wallComposeViewInitCalled = false;
    this.wallComposeViewInitContentCalled = false;
    this.wallComposeViewInitFriendListCalled = false;
    this.wallComposeViewInitTemplatesCalled = false;
    this.wallComposeViewRequestTemplatesCalled = false;
    this.wallComposeViewTemplatesRequestExpected = false;
    this.wallComposeViewTemplatesRequestSent = false;
    this.wallComposeViewInventoryRequestCount = 0;
    this.wallComposeViewInventoryResponseSeen = false;
    this.wallComposeViewInventoryParsedOk = null;
    this.lastInventoryResponseShapeKeys = [];
    this.lastInventoryItemShapeKeys = [];
    this.composeTabNetworkCommandSent = false;
    this.personalTabClickedSeen = false;
    this.personalTabExitAttemptSeen = false;
    this.mogoWallCloseClickedSeen = false;
    this.mogoWallCloseHandlerEntered = false;
    this.mogoWallCloseCurrentViewClass = null;
    this.mogoWallCloseCurrentTabName = null;
    this.mogoWallCloseDestroyViewCalled = false;
    this.mogoWallCloseRemovePopupCalled = false;
    this.mogoWallCloseOverlayRemoved = null;
    this.mogoWallCloseStageChildrenBefore = null;
    this.mogoWallCloseStageChildrenAfter = null;
    this.mogoWallCloseBlockedStateRemaining = null;
    this.mogoWallCloseExceptionSeen = false;
    this.mogoWallCloseExceptionMessage = null;
    this.mogoWallLocalExceptionSeen = false;
    this.mogoWallLocalExceptionClass = null;
    this.mogoWallLocalExceptionMessage = null;
    this.mogoWallLocalExceptionMethod = null;
    this.mogoWallCompatibilityMismatchSeen = false;
    this.controlPanelMethodsSeen = [];
    this.controlPanelButtonClickSeen = false;
    this.controlPanelClickedButtonName = null;
    this.controlPanelClickedButtonPath = null;
    this.controlPanelClickedButtonTooltip = null;
    this.specialMoveInitSeen = false;
    this.specialEffectInitSeen = false;
    this.specialHolderName = null;
    this.specialHolderVisibleAtInit = null;
    this.specialHolderVisibleAfterClick = null;
    this.specialHolderMouseEnabled = null;
    this.specialHolderMouseChildren = null;
    this.specialInnerButtonCount = null;
    this.specialInnerButtonNames = [];
    this.specialInnerButtonMouseEnabledList = [];
    this.specialInnerButtonVisibleList = [];
    this.controlPanelEffectConfigRequested = false;
    this.controlPanelEffectConfigServed = false;
    this.controlPanelEffectConfigResolvedPath = null;
    this.controlPanelEffectButtonRequests = [];
    this.controlPanelEffectButtonServed = [];
    this.controlPanelEffectButtonMissing = [];
    this.controlPanelSwfRequestedUrl = null;
    this.controlPanelSwfResolvedPath = null;
    this.controlPanelSwfServed = false;
    this.controlPanelSwfHash = null;
    this.controlPanelSwfCandidateHashes = {};
    this.controlPanelTxtParsed = false;
    this.controlPanelTxtEffectNames = [];
    this.controlPanelTxtExpectedButtonUrls = [];
    this.controlPanelTxtExpectedLinkageNames = [];
    this.controlPanelTxtMissingButtonFiles = [];
    this.controlPanelTxtFieldsSeen = [];
    this.controlPanelAssetBridgeApplied = false;
    this.controlPanelAssetBridgeReason = null;
    this.controlPanelAssetVersionMismatchLikely = false;
    this.controlPanelExpectedConfigPath = null;
    this.controlPanelExpectedEffectButtonPathPattern = null;
    this.controlPanelResolvedConfigPath = null;
    this.controlPanelResolvedEffectsDir = null;
    this.specialInnerButtonClickSeen = false;
    this.specialInnerButtonClickedName = null;
    this.specialInnerButtonClickedPath = null;
    this.magicCompatShimApplied = false;
    this.magicCompatShimReason = null;
    this.magicDoEffectOriginalHandler = null;
    this.magicDoEffectCompatHandler = null;
    this.magicDoEffectRegistrationsSeen = [];
    this.magicDoEffectRegistrationCount = 0;
    this.magicControlPanelShimConfigured = null;
    this.magicControlPanelShimBuilderReceived = null;
    this.magicControlPanelShimPlayerBuilderReceived = null;
    this.magicControlPanelShimPlayerConstructed = null;
    this.magicControlPanelShimEventDispatcherFlag = null;
    this.onEffectSendSeen = false;
    this.onSpecialMoveSendSeen = false;
    this.effectOnClickSeen = false;
    this.specialEffectControlOnSelectEffectSeen = false;
    this.magicButtonSeen = false;
    this.magicButtonVisible = null;
    this.magicButtonEnabled = null;
    this.magicButtonMouseEnabled = null;
    this.magicButtonMouseChildren = null;
    this.magicButtonTooltipText = null;
    this.magicPanelSeen = false;
    this.magicPanelVisible = null;
    this.magicPanelInitiallyOpen = null;
    this.magicPanelOpenState = null;
    this.magicPanelExpectedClosedAtStartup = null;
    this.magicPanelParentPath = null;
    this.magicPanelBounds = null;
    this.magicPanelAlpha = null;
    this.magicPanelMouseEnabled = null;
    this.magicPanelMouseChildren = null;
    this.magicButtonClickSeen = false;
    this.magicButtonMouseDownSeen = false;
    this.magicButtonMouseUpSeen = false;
    this.magicButtonClickTargetClass = null;
    this.magicButtonClickTargetName = null;
    this.magicButtonClickTargetPath = null;
    this.magicPanelClickSeen = false;
    this.magicInnerButtonClickSeen = false;
    this.magicInnerButtonTargetClass = null;
    this.magicInnerButtonTargetName = null;
    this.magicInnerButtonTargetPath = null;
    this.magicInnerButtonIndex = null;
    this.magicInnerButtonEnabled = null;
    this.magicInnerButtonMouseEnabled = null;
    this.magicInnerButtonVisible = null;
    this.magicInnerButtonAlpha = null;
    this.magicClickBlockedByClass = null;
    this.magicClickBlockedByName = null;
    this.magicClickBlockedByPath = null;
    this.magicHitTestTopObjectClass = null;
    this.magicHitTestTopObjectName = null;
    this.controlPanelHitTestTopObjectClass = null;
    this.controlPanelHitTestTopObjectName = null;
    this.controlPanelHitTestTopObjectPath = null;
    this.controlPanelHitTestTopObjectBounds = null;
    this.controlPanelHitTestAncestorChain = null;
    this.controlPanelClickBlockedByClass = null;
    this.controlPanelClickBlockedByName = null;
    this.controlPanelClickBlockedByPath = null;
    this.controlPanelBounds = null;
    this.magicButtonBounds = null;
    this.magicButtonGlobalBounds = null;
    this.popupLayerTopObject = null;
    this.popupLayerBlocksControlPanel = null;
    this.activePopupClassName = null;
    this.activePopupMouseEnabled = null;
    this.activePopupMouseChildren = null;
    this.magicLocalExceptionSeen = false;
    this.magicLocalExceptionClass = null;
    this.magicLocalExceptionMessage = null;
    this.magicLocalExceptionMethod = null;
    this.currentExecutingAvm2Method = null;
    this.magicCommandSent = false;
    this.magicCommandName = null;
    this.magicCommandPayloadDecoded = null;
    this.magicCommandResponseSeen = false;
    this.magicCommandResponseShape = null;
    this.magicUnhandledCommandSeen = false;
    this.magicUnhandledCommandName = null;
    this.mismatchCallerSwf = null;
    this.mismatchCallerClass = null;
    this.mismatchCallerMethod = null;
    this.mismatchExpectedReceiverClass = null;
    this.mismatchMissingMethod = null;
    this.mismatchReceiverClassLoadedFromSwf = null;
    this.mismatchReceiverClassDefiningMovie = null;
    this.mismatchLikelyCause = null;
    this.mismatchSuggestedAction = null;
    this.rtlTextWorkaroundEnabled = false;
    this.rtlWrappedStringCount = 0;
    this.rtlWrapMode = 'RLE';
    this.sampleRtlWrappedKeys = [];
    this.rtlTextMode = 'wrap';
    this.rtlVisualReverseCount = 0;
    this.sampleVisualReverseBeforeAfter = [];
    this.rtlTransformScope = 'selected-keys';
    this.rtlAllowlistedKeys = [];
    this.rtlTransformedKeys = [];
    this.rtlSkippedBecauseNotAllowlisted = [];
  }
}

export const ruffleDiagnosticsManager = new RuffleDiagnosticsManager();
