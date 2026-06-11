import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import { logger } from './logger';

export const ConfigSchema = z.object({
  httpPort: z.number().int().min(1).max(65535).default(8080),
  socketPort: z.number().int().min(1).max(65535).default(9339),
  policyPort: z.number().int().min(1).max(65535).default(843),
  assetsPath: z.string().min(1),
  runtimeMode: z.enum(['web-container', 'projector', 'ruffle', 'ruffle-local']).default('web-container'),
  entrySwf: z.string().default('Mogo.swf'),
  publicHost: z.string().default('127.0.0.1'),
  
  // SmartFox socket login options
  acceptAnyLogin: z.boolean().default(true),
  defaultUserModerator: z.boolean().default(true),
  sendRoomListAfterLogin: z.boolean().default(false), // Reverted to false as default
  defaultRoomName: z.string().default('room_20'),
  defaultRoomId: z.number().int().default(1),
  verboseHttp: z.boolean().default(false),
  verboseBlueboxPolls: z.boolean().default(false),
  verboseRuffleEvents: z.boolean().default(false),
  debugAssetsPath: z.string().default('./debug-assets'),
  ruffleRuntimeDir: z.string().nullable().default(null),
  compatFixLanguageXml: z.boolean().default(true),
  compatLoginGraphicsAlias: z.string().nullable().default(null),
  sendLoginExtensionAfterLogOk: z.boolean().default(false),
  compatLoginFirstLoadingScreensMode: z.enum(['clean-single', 'repeated-wrapper']).default('clean-single'),
  compatLoadingScreenTextMode: z.enum(['off', 'plain', 'fallback-plain', 'simple', 'empty', 'minimal-tlf']).default('off'),
  defaultLanguage: z.number().int().default(1),
  blueboxLoginExtensionOnly: z.boolean().default(false),
  blueboxLoginMode: z.enum([
    'deferred',
    'same-response',
    'extension-only',
    'same-response-logko',
    'rmList-login-logko',
    'rmList-login',
    'rmList-login-combined',
    'rmList-login-split-poll',
    'rmList-login-split-command',
    'login-rmList-split-poll',
    'rmList-only-then-xt-login-on-poll',
    'xt-login-only',
    'split-rmList-xtLogin'
  ]).default('deferred'),
  blueboxJoinMode: z.enum([
    'joinOK-uLs-embedded',
    'legacy-separate-uList',
    'joinOK-uList-combined',
    'joinOK-uList-split-poll',
    'uList-joinOK-split-poll',
    'joinOK-uList-delayed-poll',
    'joinOK-uList-after-room-asset'
  ]).default('joinOK-uLs-embedded'),
  blueboxUlistDelayMs: z.number().int().min(0).default(1000),
  blueboxApiOkDelayMs: z.number().int().min(0).default(0),
  flashDebug: z.boolean().default(true),
  serverList: z.boolean().default(true),
  /** fR field in rooms__getStaticRoomList – seconds the client waits before joining the first room. Default 0 to skip the delay. */
  staticRoomFirstRoomDelay: z.number().int().min(0).max(300).default(0),
  roomBackSoundMap: z.record(z.string()).default({}),
  compatStaticRoomNameStripPrefix: z.boolean().optional().default(false),
  /**
   * When true, injects a CSS @font-face block into the Ruffle HTML page that maps
   * the Hebrew Unicode range (U+0590-U+05FF) to the system Arial font.
   * This allows Ruffle's canvas renderer to fall back to a Hebrew-capable device font
   * for TextFields that use embedFonts=true but whose embedded font lacks Hebrew glyphs.
   * Bundled Ruffle 0.2.0 does not support fontSources/defaultFontFaces natively;
   * this CSS-level workaround is the most effective approach for that version.
   */
  ruffleHebrewFontWorkaround: z.boolean().default(false),
  /**
   * Preferred Ruffle renderer hint. Passed as a comment in diagnostics; Ruffle 0.2.0
   * does not expose this as a public config key, so this serves as a future-proofing
   * slot and a diagnostic label.
   * Values: 'auto' | 'webgl' | 'canvas' | 'software'
   */
  ruffleRendererPreference: z.enum(['auto', 'webgl', 'canvas', 'software']).default('auto'),
  ruffleFontSources: z.array(z.string()).default([]),
  ruffleDefaultFonts: z.record(z.array(z.string())).optional(),
  ruffleDeviceFontRenderer: z.string().nullable().default(null),
  ruffleHebrewRtlWorkaround: z.boolean().default(false),
  ruffleRtlLayoutDiagnostics: z.boolean().default(false),
  ruffleFastFailSocketWithoutProxy: z.boolean().default(false),
  rufflePreloginCallTrace: z.boolean().default(false),
  ruffleUserExperienceCtorShim: z.boolean().default(false),
  ruffleTextFlowEditorCtorShim: z.boolean().default(false),
  ruffleButtonGridClearShim: z.boolean().default(false),
  ruffleMagicControlPanelShim: z.boolean().default(false),
  ruffleLoadingScreenTextCompatShim: z.boolean().default(false),
  ruffleLoadingScreenTextCompatFallbackText: z.string().optional(),
  canvasTextDiagnostics: z.boolean().default(false),
  canvasRtlRenderWorkaround: z.boolean().default(false),
  rtlTextWorkaround: z.boolean().default(false),
  rtlWrapMode: z.enum(['RLE', 'RLM', 'VISUAL_REVERSE']).default('RLE'),
  hebrewFontWorkaround: z.boolean().default(false),
  rtlTransformScope: z.enum(['all', 'selected-keys']).default('selected-keys'),
  rtlTransformKeys: z.array(z.string()).default([])
});

export type ServerConfig = Omit<
  z.infer<typeof ConfigSchema>,
  | 'compatStaticRoomNameStripPrefix'
  | 'roomBackSoundMap'
  | 'verboseBlueboxPolls'
  | 'verboseRuffleEvents'
  | 'blueboxJoinMode'
  | 'blueboxUlistDelayMs'
  | 'blueboxApiOkDelayMs'
  | 'compatLoadingScreenTextMode'
  | 'ruffleHebrewFontWorkaround'
  | 'ruffleRendererPreference'
  | 'ruffleFontSources'
  | 'ruffleDefaultFonts'
  | 'ruffleDeviceFontRenderer'
  | 'ruffleHebrewRtlWorkaround'
  | 'ruffleRtlLayoutDiagnostics'
  | 'ruffleFastFailSocketWithoutProxy'
  | 'rufflePreloginCallTrace'
  | 'ruffleUserExperienceCtorShim'
  | 'ruffleTextFlowEditorCtorShim'
  | 'ruffleButtonGridClearShim'
  | 'ruffleMagicControlPanelShim'
  | 'ruffleLoadingScreenTextCompatShim'
  | 'ruffleLoadingScreenTextCompatFallbackText'
  | 'canvasTextDiagnostics'
  | 'canvasRtlRenderWorkaround'
  | 'rtlTextWorkaround'
  | 'rtlWrapMode'
  | 'hebrewFontWorkaround'
  | 'rtlTransformScope'
  | 'rtlTransformKeys'
> & {
  compatStaticRoomNameStripPrefix?: boolean;
  roomBackSoundMap?: Record<string, string>;
  verboseBlueboxPolls?: boolean;
  verboseRuffleEvents?: boolean;
  blueboxJoinMode?: 'joinOK-uLs-embedded' | 'legacy-separate-uList' | 'joinOK-uList-combined' | 'joinOK-uList-split-poll' | 'uList-joinOK-split-poll' | 'joinOK-uList-delayed-poll' | 'joinOK-uList-after-room-asset';
  blueboxUlistDelayMs?: number;
  blueboxApiOkDelayMs?: number;
  compatLoadingScreenTextMode?: 'off' | 'plain' | 'fallback-plain' | 'simple' | 'empty' | 'minimal-tlf';
  ruffleHebrewFontWorkaround?: boolean;
  ruffleRendererPreference?: 'auto' | 'webgl' | 'canvas' | 'software';
  ruffleFontSources?: string[];
  ruffleDefaultFonts?: Record<string, string[]>;
  ruffleDeviceFontRenderer?: string | null;
  ruffleHebrewRtlWorkaround?: boolean;
  ruffleRtlLayoutDiagnostics?: boolean;
  ruffleFastFailSocketWithoutProxy?: boolean;
    rufflePreloginCallTrace?: boolean;
    ruffleUserExperienceCtorShim?: boolean;
    ruffleTextFlowEditorCtorShim?: boolean;
    ruffleButtonGridClearShim?: boolean;
    ruffleMagicControlPanelShim?: boolean;
  ruffleLoadingScreenTextCompatShim?: boolean;
  ruffleLoadingScreenTextCompatFallbackText?: string;
  canvasTextDiagnostics?: boolean;
  canvasRtlRenderWorkaround?: boolean;
  rtlTextWorkaround?: boolean;
  rtlWrapMode?: 'RLE' | 'RLM' | 'VISUAL_REVERSE';
  hebrewFontWorkaround?: boolean;
  rtlTransformScope?: 'all' | 'selected-keys';
  rtlTransformKeys?: string[];
};

/**
 * Parses arguments and loads configuration from either CLI, config file, or environment.
 */
export function loadConfig(): ServerConfig {
  const args = process.argv.slice(2);
  const cliParams: Record<string, any> = {};
  let configPath: string | null = null;

  // Simple manual CLI arg parser
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--assets' || arg === '-a') {
      cliParams.assetsPath = args[++i];
    } else if (arg === '--http-port' || arg === '--hp') {
      cliParams.httpPort = parseInt(args[++i], 10);
    } else if (arg === '--socket-port' || arg === '--sp') {
      cliParams.socketPort = parseInt(args[++i], 10);
    } else if (arg === '--policy-port' || arg === '--pp') {
      cliParams.policyPort = parseInt(args[++i], 10);
    } else if (arg === '--entry-swf') {
      cliParams.entrySwf = args[++i];
    } else if (arg === '--public-host') {
      cliParams.publicHost = args[++i];
    } else if (arg === '--runtime-mode' || arg === '--adapter') {
      cliParams.runtimeMode = args[++i];
    } else if (arg === '--config' || arg === '-c') {
      configPath = args[++i];
    } else if (arg === '--verbose-http') {
      cliParams.verboseHttp = true;
    } else if (arg === '--verbose-bluebox-polls') {
      cliParams.verboseBlueboxPolls = true;
    } else if (arg === '--verbose-ruffle-events') {
      cliParams.verboseRuffleEvents = true;
    } else if (arg === '--debug-assets') {
      cliParams.debugAssetsPath = args[++i];
    } else if (arg === '--ruffle-runtime-dir') {
      cliParams.ruffleRuntimeDir = args[++i];
    } else if (arg === '--compat-fix-language-xml') {
      cliParams.compatFixLanguageXml = true;
    } else if (arg === '--no-compat-fix-language-xml') {
      cliParams.compatFixLanguageXml = false;
    } else if (arg === '--compat-login-graphics-alias') {
      cliParams.compatLoginGraphicsAlias = args[++i];
    } else if (arg === '--send-login-extension-after-log-ok') {
      cliParams.sendLoginExtensionAfterLogOk = true;
    } else if (arg === '--bluebox-login-extension-only') {
      cliParams.blueboxLoginExtensionOnly = true;
    } else if (arg === '--bluebox-login-mode') {
      cliParams.blueboxLoginMode = args[++i];
    } else if (arg === '--bluebox-join-mode') {
      cliParams.blueboxJoinMode = args[++i];
    } else if (arg === '--bluebox-ulist-delay-ms') {
      cliParams.blueboxUlistDelayMs = parseInt(args[++i], 10);
    } else if (arg === '--bluebox-apiok-delay-ms') {
      cliParams.blueboxApiOkDelayMs = parseInt(args[++i], 10);
    } else if (arg === '--compat-login-first-loading-screens-mode') {
      cliParams.compatLoginFirstLoadingScreensMode = args[++i];
    } else if (arg === '--compat-loading-screen-text-mode') {
      cliParams.compatLoadingScreenTextMode = args[++i];
    } else if (arg === '--default-language') {
      cliParams.defaultLanguage = parseInt(args[++i], 10);
    } else if (arg === '--flash-debug') {
      const nextArg = args[i + 1];
      if (nextArg && (nextArg === 'true' || nextArg === 'false' || nextArg === '1' || nextArg === '0')) {
        cliParams.flashDebug = nextArg === 'true' || nextArg === '1';
        i++;
      } else {
        cliParams.flashDebug = true;
      }
    } else if (arg === '--suppress-flash-alerts') {
      cliParams.flashDebug = false;
    } else if (arg === '--server-list') {
      const nextArg = args[i + 1];
      if (nextArg && (nextArg === 'true' || nextArg === 'false' || nextArg === '1' || nextArg === '0')) {
        cliParams.serverList = nextArg === 'true' || nextArg === '1';
        i++;
      } else {
        cliParams.serverList = true;
      }
    } else if (arg === '--static-room-first-room-delay') {
      cliParams.staticRoomFirstRoomDelay = parseInt(args[++i], 10);
    } else if (arg === '--room-back-sound') {
      const value = args[++i];
      const separator = value.indexOf('=');
      if (separator > 0) {
        const roomName = value.slice(0, separator).trim();
        const soundValue = value.slice(separator + 1).trim();
        cliParams.roomBackSoundMap = {
          ...(cliParams.roomBackSoundMap || {}),
          [roomName]: soundValue
        };
      }
    } else if (arg === '--compat-static-room-name-strip-prefix') {
      cliParams.compatStaticRoomNameStripPrefix = true;
    } else if (arg === '--no-compat-static-room-name-strip-prefix') {
      cliParams.compatStaticRoomNameStripPrefix = false;
    } else if (arg === '--ruffle-hebrew-font-workaround') {
      cliParams.ruffleHebrewFontWorkaround = true;
    } else if (arg === '--no-ruffle-hebrew-font-workaround') {
      cliParams.ruffleHebrewFontWorkaround = false;
    } else if (arg === '--ruffle-renderer-preference') {
      cliParams.ruffleRendererPreference = args[++i];
    } else if (arg === '--ruffle-font-sources') {
      cliParams.ruffleFontSources = args[++i].split(',').map(s => s.trim());
    } else if (arg === '--ruffle-default-fonts') {
      cliParams.ruffleDefaultFonts = JSON.parse(args[++i]);
    } else if (arg === '--ruffle-device-font-renderer') {
      const val = args[++i];
      cliParams.ruffleDeviceFontRenderer = val === 'none' || val === 'null' ? null : val;
    } else if (arg === '--ruffle-hebrew-rtl-workaround') {
      cliParams.ruffleHebrewRtlWorkaround = true;
    } else if (arg === '--no-ruffle-hebrew-rtl-workaround') {
      cliParams.ruffleHebrewRtlWorkaround = false;
    } else if (arg === '--ruffle-rtl-layout-diagnostics') {
      cliParams.ruffleRtlLayoutDiagnostics = true;
    } else if (arg === '--no-ruffle-rtl-layout-diagnostics') {
      cliParams.ruffleRtlLayoutDiagnostics = false;
    } else if (arg === '--ruffle-fast-fail-socket-without-proxy') {
      cliParams.ruffleFastFailSocketWithoutProxy = true;
    } else if (arg === '--no-ruffle-fast-fail-socket-without-proxy') {
      cliParams.ruffleFastFailSocketWithoutProxy = false;
    } else if (arg === '--ruffle-prelogin-call-trace') {
      cliParams.rufflePreloginCallTrace = true;
    } else if (arg === '--no-ruffle-prelogin-call-trace') {
      cliParams.rufflePreloginCallTrace = false;
    } else if (arg === '--ruffle-userexperience-ctor-shim') {
      cliParams.ruffleUserExperienceCtorShim = true;
    } else if (arg === '--no-ruffle-userexperience-ctor-shim') {
      cliParams.ruffleUserExperienceCtorShim = false;
    } else if (arg === '--ruffle-textfloweditor-ctor-shim') {
      cliParams.ruffleTextFlowEditorCtorShim = true;
    } else if (arg === '--no-ruffle-textfloweditor-ctor-shim') {
      cliParams.ruffleTextFlowEditorCtorShim = false;
    } else if (arg === '--ruffle-buttongrid-clear-shim') {
      cliParams.ruffleButtonGridClearShim = true;
    } else if (arg === '--no-ruffle-buttongrid-clear-shim') {
      cliParams.ruffleButtonGridClearShim = false;
    } else if (arg === '--ruffle-magic-controlpanel-shim') {
      cliParams.ruffleMagicControlPanelShim = true;
    } else if (arg === '--no-ruffle-magic-controlpanel-shim') {
      cliParams.ruffleMagicControlPanelShim = false;
    } else if (arg === '--ruffle-loadingscreen-text-compat-shim') {
      cliParams.ruffleLoadingScreenTextCompatShim = true;
    } else if (arg === '--no-ruffle-loadingscreen-text-compat-shim') {
      cliParams.ruffleLoadingScreenTextCompatShim = false;
    } else if (arg === '--ruffle-loadingscreen-text-compat-fallback-text') {
      cliParams.ruffleLoadingScreenTextCompatFallbackText = args[++i];
    } else if (arg === '--canvas-text-diagnostics') {
      cliParams.canvasTextDiagnostics = true;
    } else if (arg === '--no-canvas-text-diagnostics') {
      cliParams.canvasTextDiagnostics = false;
    } else if (arg === '--canvas-rtl-render-workaround') {
      cliParams.canvasRtlRenderWorkaround = true;
    } else if (arg === '--no-canvas-rtl-render-workaround') {
      cliParams.canvasRtlRenderWorkaround = false;
    } else if (arg === '--rtl-text-workaround') {
      cliParams.rtlTextWorkaround = true;
    } else if (arg === '--no-rtl-text-workaround') {
      cliParams.rtlTextWorkaround = false;
    } else if (arg === '--rtl-wrap-mode') {
      cliParams.rtlWrapMode = args[++i];
    } else if (arg === '--hebrew-font-workaround') {
      cliParams.hebrewFontWorkaround = true;
    } else if (arg === '--no-hebrew-font-workaround') {
      cliParams.hebrewFontWorkaround = false;
    } else if (arg === '--rtl-transform-scope') {
      cliParams.rtlTransformScope = args[++i];
    } else if (arg === '--rtl-transform-keys') {
      cliParams.rtlTransformKeys = args[++i].split(',').map(s => s.trim());
    }
  }

  let fileParams: Record<string, any> = {};

  // If config path is provided, try to load it (YAML or JSON)
  if (configPath) {
    const resolvedPath = path.resolve(configPath);
    if (fs.existsSync(resolvedPath)) {
      try {
        const fileContent = fs.readFileSync(resolvedPath, 'utf8');
        if (resolvedPath.endsWith('.yml') || resolvedPath.endsWith('.yaml')) {
          fileParams = yaml.load(fileContent) as Record<string, any>;
        } else {
          fileParams = JSON.parse(fileContent);
        }
        logger.info('config', `Loaded configuration file from: ${resolvedPath}`);
      } catch (err: any) {
        logger.error('config', `Failed to parse config file: ${err.message}`);
        process.exit(1);
      }
    } else {
      logger.error('config', `Configuration file does not exist at: ${resolvedPath}`);
      process.exit(1);
    }
  } else {
    // Try to load default server.yml or server.json if they exist in the root CWD
    const defaultYaml = path.join(process.cwd(), 'server.yml');
    const defaultYaml2 = path.join(process.cwd(), 'server.yaml');
    const targetDefault = fs.existsSync(defaultYaml) ? defaultYaml : fs.existsSync(defaultYaml2) ? defaultYaml2 : null;
    
    if (targetDefault) {
      try {
        const fileContent = fs.readFileSync(targetDefault, 'utf8');
        fileParams = yaml.load(fileContent) as Record<string, any>;
        logger.info('config', `Loaded default configuration from: ${targetDefault}`);
      } catch (err) {}
    }
  }

  // Environment variables fallback (prefixed with FSS_)
  const envParams: Record<string, any> = {};
  if (process.env.FSS_ASSETS_PATH) envParams.assetsPath = process.env.FSS_ASSETS_PATH;
  if (process.env.FSS_HTTP_PORT) envParams.httpPort = parseInt(process.env.FSS_HTTP_PORT, 10);
  if (process.env.FSS_SOCKET_PORT) envParams.socketPort = parseInt(process.env.FSS_SOCKET_PORT, 10);
  if (process.env.FSS_POLICY_PORT) envParams.policyPort = parseInt(process.env.FSS_POLICY_PORT, 10);
  if (process.env.FSS_ENTRY_SWF) envParams.entrySwf = process.env.FSS_ENTRY_SWF;
  if (process.env.FSS_PUBLIC_HOST) envParams.publicHost = process.env.FSS_PUBLIC_HOST;
  if (process.env.FSS_RUNTIME_MODE) envParams.runtimeMode = process.env.FSS_RUNTIME_MODE;
  if (process.env.FSS_VERBOSE_HTTP) envParams.verboseHttp = process.env.FSS_VERBOSE_HTTP === 'true';
  if (process.env.FSS_VERBOSE_BLUEBOX_POLLS) envParams.verboseBlueboxPolls = process.env.FSS_VERBOSE_BLUEBOX_POLLS === 'true' || process.env.FSS_VERBOSE_BLUEBOX_POLLS === '1';
  if (process.env.FSS_VERBOSE_RUFFLE_EVENTS) envParams.verboseRuffleEvents = process.env.FSS_VERBOSE_RUFFLE_EVENTS === 'true' || process.env.FSS_VERBOSE_RUFFLE_EVENTS === '1';
  if (process.env.FSS_DEBUG_ASSETS_PATH) envParams.debugAssetsPath = process.env.FSS_DEBUG_ASSETS_PATH;
  if (process.env.FSS_RUFFLE_RUNTIME_DIR) envParams.ruffleRuntimeDir = process.env.FSS_RUFFLE_RUNTIME_DIR;
  if (process.env.FSS_COMPAT_FIX_LANGUAGE_XML) envParams.compatFixLanguageXml = process.env.FSS_COMPAT_FIX_LANGUAGE_XML === 'true';
  if (process.env.FSS_COMPAT_LOGIN_GRAPHICS_ALIAS) envParams.compatLoginGraphicsAlias = process.env.FSS_COMPAT_LOGIN_GRAPHICS_ALIAS;
  if (process.env.FSS_SEND_LOGIN_EXTENSION_AFTER_LOG_OK) envParams.sendLoginExtensionAfterLogOk = process.env.FSS_SEND_LOGIN_EXTENSION_AFTER_LOG_OK === 'true';
  if (process.env.FSS_BLUEBOX_LOGIN_EXTENSION_ONLY) envParams.blueboxLoginExtensionOnly = process.env.FSS_BLUEBOX_LOGIN_EXTENSION_ONLY === 'true';
  if (process.env.FSS_BLUEBOX_LOGIN_MODE) envParams.blueboxLoginMode = process.env.FSS_BLUEBOX_LOGIN_MODE;
  if (process.env.FSS_BLUEBOX_JOIN_MODE) envParams.blueboxJoinMode = process.env.FSS_BLUEBOX_JOIN_MODE;
  if (process.env.FSS_BLUEBOX_ULIST_DELAY_MS) envParams.blueboxUlistDelayMs = parseInt(process.env.FSS_BLUEBOX_ULIST_DELAY_MS, 10);
  if (process.env.FSS_BLUEBOX_APIOK_DELAY_MS) envParams.blueboxApiOkDelayMs = parseInt(process.env.FSS_BLUEBOX_APIOK_DELAY_MS, 10);
  if (process.env.FSS_COMPAT_LOGIN_FIRST_LOADING_SCREENS_MODE) envParams.compatLoginFirstLoadingScreensMode = process.env.FSS_COMPAT_LOGIN_FIRST_LOADING_SCREENS_MODE;
  if (process.env.FSS_COMPAT_LOADING_SCREEN_TEXT_MODE) envParams.compatLoadingScreenTextMode = process.env.FSS_COMPAT_LOADING_SCREEN_TEXT_MODE;
  if (process.env.FSS_DEFAULT_LANGUAGE) envParams.defaultLanguage = parseInt(process.env.FSS_DEFAULT_LANGUAGE, 10);
  if (process.env.FSS_FLASH_DEBUG) envParams.flashDebug = process.env.FSS_FLASH_DEBUG === 'true';
  if (process.env.FSS_SUPPRESS_FLASH_ALERTS) {
    if (process.env.FSS_SUPPRESS_FLASH_ALERTS === 'true' || process.env.FSS_SUPPRESS_FLASH_ALERTS === '1') {
      envParams.flashDebug = false;
    }
  }
  if (process.env.FSS_SERVER_LIST) {
    envParams.serverList = process.env.FSS_SERVER_LIST === 'true' || process.env.FSS_SERVER_LIST === '1';
  }
  if (process.env.FSS_STATIC_ROOM_FIRST_ROOM_DELAY) envParams.staticRoomFirstRoomDelay = parseInt(process.env.FSS_STATIC_ROOM_FIRST_ROOM_DELAY, 10);
  if (process.env.FSS_ROOM_BACK_SOUND_MAP) {
    try {
      envParams.roomBackSoundMap = JSON.parse(process.env.FSS_ROOM_BACK_SOUND_MAP);
    } catch (e: any) {
      logger.error('config', `Failed to parse FSS_ROOM_BACK_SOUND_MAP env: ${e.message}`);
    }
  }
  if (process.env.FSS_COMPAT_STATIC_ROOM_NAME_STRIP_PREFIX) {
    envParams.compatStaticRoomNameStripPrefix = process.env.FSS_COMPAT_STATIC_ROOM_NAME_STRIP_PREFIX === 'true' || process.env.FSS_COMPAT_STATIC_ROOM_NAME_STRIP_PREFIX === '1';
  }
  if (process.env.FSS_RUFFLE_HEBREW_FONT_WORKAROUND) {
    envParams.ruffleHebrewFontWorkaround = process.env.FSS_RUFFLE_HEBREW_FONT_WORKAROUND === 'true' || process.env.FSS_RUFFLE_HEBREW_FONT_WORKAROUND === '1';
  }
  if (process.env.FSS_RUFFLE_RENDERER_PREFERENCE) {
    envParams.ruffleRendererPreference = process.env.FSS_RUFFLE_RENDERER_PREFERENCE;
  }
  if (process.env.FSS_RUFFLE_FONT_SOURCES) {
    envParams.ruffleFontSources = process.env.FSS_RUFFLE_FONT_SOURCES.split(',').map(s => s.trim());
  }
  if (process.env.FSS_RUFFLE_DEFAULT_FONTS) {
    try {
      envParams.ruffleDefaultFonts = JSON.parse(process.env.FSS_RUFFLE_DEFAULT_FONTS);
    } catch (e: any) {
      logger.error('config', `Failed to parse FSS_RUFFLE_DEFAULT_FONTS env: ${e.message}`);
    }
  }
  if (process.env.FSS_RUFFLE_DEVICE_FONT_RENDERER) {
    const val = process.env.FSS_RUFFLE_DEVICE_FONT_RENDERER;
    envParams.ruffleDeviceFontRenderer = val === 'none' || val === 'null' ? null : val;
  }
  if (process.env.FSS_RUFFLE_HEBREW_RTL_WORKAROUND) {
    envParams.ruffleHebrewRtlWorkaround = process.env.FSS_RUFFLE_HEBREW_RTL_WORKAROUND === 'true' || process.env.FSS_RUFFLE_HEBREW_RTL_WORKAROUND === '1';
  }
  if (process.env.FSS_RUFFLE_RTL_LAYOUT_DIAGNOSTICS) {
    envParams.ruffleRtlLayoutDiagnostics = process.env.FSS_RUFFLE_RTL_LAYOUT_DIAGNOSTICS === 'true' || process.env.FSS_RUFFLE_RTL_LAYOUT_DIAGNOSTICS === '1';
  }
  if (process.env.FSS_RUFFLE_FAST_FAIL_SOCKET_WITHOUT_PROXY) {
    envParams.ruffleFastFailSocketWithoutProxy = process.env.FSS_RUFFLE_FAST_FAIL_SOCKET_WITHOUT_PROXY === 'true' || process.env.FSS_RUFFLE_FAST_FAIL_SOCKET_WITHOUT_PROXY === '1';
  }
  if (process.env.FSS_RUFFLE_PRELOGIN_CALL_TRACE) {
    envParams.rufflePreloginCallTrace = process.env.FSS_RUFFLE_PRELOGIN_CALL_TRACE === 'true' || process.env.FSS_RUFFLE_PRELOGIN_CALL_TRACE === '1';
  }
  if (process.env.FSS_RUFFLE_USEREXPERIENCE_CTOR_SHIM) {
    envParams.ruffleUserExperienceCtorShim = process.env.FSS_RUFFLE_USEREXPERIENCE_CTOR_SHIM === 'true' || process.env.FSS_RUFFLE_USEREXPERIENCE_CTOR_SHIM === '1';
  }
  if (process.env.FSS_RUFFLE_TEXTFLOWEDITOR_CTOR_SHIM) {
    envParams.ruffleTextFlowEditorCtorShim = process.env.FSS_RUFFLE_TEXTFLOWEDITOR_CTOR_SHIM === 'true' || process.env.FSS_RUFFLE_TEXTFLOWEDITOR_CTOR_SHIM === '1';
  }
  if (process.env.FSS_RUFFLE_BUTTONGRID_CLEAR_SHIM) {
    envParams.ruffleButtonGridClearShim = process.env.FSS_RUFFLE_BUTTONGRID_CLEAR_SHIM === 'true' || process.env.FSS_RUFFLE_BUTTONGRID_CLEAR_SHIM === '1';
  }
  if (process.env.FSS_RUFFLE_MAGIC_CONTROLPANEL_SHIM) {
    envParams.ruffleMagicControlPanelShim = process.env.FSS_RUFFLE_MAGIC_CONTROLPANEL_SHIM === 'true' || process.env.FSS_RUFFLE_MAGIC_CONTROLPANEL_SHIM === '1';
  }
  if (process.env.FSS_RUFFLE_LOADINGSCREEN_TEXT_COMPAT_SHIM) {
    envParams.ruffleLoadingScreenTextCompatShim = process.env.FSS_RUFFLE_LOADINGSCREEN_TEXT_COMPAT_SHIM === 'true' || process.env.FSS_RUFFLE_LOADINGSCREEN_TEXT_COMPAT_SHIM === '1';
  }
  if (process.env.FSS_RUFFLE_LOADINGSCREEN_TEXT_COMPAT_FALLBACK_TEXT) {
    envParams.ruffleLoadingScreenTextCompatFallbackText = process.env.FSS_RUFFLE_LOADINGSCREEN_TEXT_COMPAT_FALLBACK_TEXT;
  }
  if (process.env.FSS_CANVAS_TEXT_DIAGNOSTICS) {
    envParams.canvasTextDiagnostics = process.env.FSS_CANVAS_TEXT_DIAGNOSTICS === 'true' || process.env.FSS_CANVAS_TEXT_DIAGNOSTICS === '1';
  }
  if (process.env.FSS_CANVAS_RTL_RENDER_WORKAROUND) {
    envParams.canvasRtlRenderWorkaround = process.env.FSS_CANVAS_RTL_RENDER_WORKAROUND === 'true' || process.env.FSS_CANVAS_RTL_RENDER_WORKAROUND === '1';
  }
  if (process.env.FSS_RTL_TEXT_WORKAROUND) {
    envParams.rtlTextWorkaround = process.env.FSS_RTL_TEXT_WORKAROUND === 'true' || process.env.FSS_RTL_TEXT_WORKAROUND === '1';
  }
  if (process.env.FSS_RTL_WRAP_MODE) {
    envParams.rtlWrapMode = process.env.FSS_RTL_WRAP_MODE;
  }
  if (process.env.FSS_HEBREW_FONT_WORKAROUND) {
    envParams.hebrewFontWorkaround = process.env.FSS_HEBREW_FONT_WORKAROUND === 'true' || process.env.FSS_HEBREW_FONT_WORKAROUND === '1';
  }
  if (process.env.FSS_RTL_TRANSFORM_SCOPE) {
    envParams.rtlTransformScope = process.env.FSS_RTL_TRANSFORM_SCOPE;
  }
  if (process.env.FSS_RTL_TRANSFORM_KEYS) {
    envParams.rtlTransformKeys = process.env.FSS_RTL_TRANSFORM_KEYS.split(',').map(s => s.trim());
  }

  // Combine params in order of priority: CLI > Environment > File > Defaults
  const combined = {
    ...fileParams,
    ...envParams,
    ...cliParams
  };

  // Fallback: If blueboxLoginExtensionOnly is true, and blueboxLoginMode was not explicitly provided, use extension-only
  if (combined.blueboxLoginExtensionOnly === true && !combined.blueboxLoginMode) {
    combined.blueboxLoginMode = 'extension-only';
  }

  if (combined.blueboxLoginMode === 'rmList-login') {
    combined.blueboxLoginMode = 'rmList-login-combined';
  }
  if (combined.blueboxLoginMode === 'rmList-only-then-xt-login-on-poll') {
    combined.blueboxLoginMode = 'rmList-login-split-poll';
  }
  if (combined.blueboxLoginMode === 'split-rmList-xtLogin') {
    combined.blueboxLoginMode = 'rmList-login-split-command';
  }

  if (combined.hebrewFontWorkaround === true) {
    combined.ruffleHebrewFontWorkaround = true;
    if (combined.ruffleDeviceFontRenderer === undefined || combined.ruffleDeviceFontRenderer === null) {
      combined.ruffleDeviceFontRenderer = 'canvas';
    }
  }

  // Convert types if loaded loosely
  if (typeof combined.httpPort === 'string') combined.httpPort = parseInt(combined.httpPort, 10);
  if (typeof combined.socketPort === 'string') combined.socketPort = parseInt(combined.socketPort, 10);
  if (typeof combined.policyPort === 'string') combined.policyPort = parseInt(combined.policyPort, 10);
  if (typeof combined.blueboxUlistDelayMs === 'string') combined.blueboxUlistDelayMs = parseInt(combined.blueboxUlistDelayMs, 10);
  if (typeof combined.blueboxApiOkDelayMs === 'string') combined.blueboxApiOkDelayMs = parseInt(combined.blueboxApiOkDelayMs, 10);

  // Validate using Zod schema
  const parsed = ConfigSchema.safeParse(combined);

  if (!parsed.success) {
    logger.error('config', 'Configuration validation failed:');
    const formatted = parsed.error.format();
    for (const [key, val] of Object.entries(formatted)) {
      if (key !== '_errors') {
        const errors = (val as any)._errors?.join(', ');
        logger.error('config', `  - \x1b[33m${key}\x1b[0m: ${errors}`);
      }
    }
    
    // Custom check for assets path
    if (!combined.assetsPath) {
      logger.warn('config', '\n\x1b[36mHow to fix:\x1b[0m Pass the assets path via CLI:');
      logger.warn('config', '  pnpm dev -- --assets "C:\\PROJ\\sfs-emu\\CLINET-CLEAN"\n');
    }
    
    process.exit(1);
  }

  // Resolve assets path to absolute
  const rawAssetsPath = parsed.data.assetsPath;
  parsed.data.assetsPath = path.resolve(rawAssetsPath);

  const rawDebugAssetsPath = parsed.data.debugAssetsPath;
  parsed.data.debugAssetsPath = path.resolve(rawDebugAssetsPath);

  if (parsed.data.ruffleRuntimeDir) {
    parsed.data.ruffleRuntimeDir = path.resolve(parsed.data.ruffleRuntimeDir);
  }

  return parsed.data;
}
