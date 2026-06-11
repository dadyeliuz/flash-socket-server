# Compatibility Flags Audit

## Scope

This document maps the current compatibility and diagnostics flags from:

1. CLI / env parsing in [`packages/core/src/config.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/core/src/config.ts)
2. HTML generation in [`packages/http-gateway/src/routes/playRuffle.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/http-gateway/src/routes/playRuffle.ts)
3. Ruffle JS public config in `web/packages/core/src/public/config/load-options.ts`
4. Ruffle JS->Rust bridge in `web/packages/core/src/internal/builder.ts` and `web/src/builder.rs`
5. Ruffle runtime state in `core/src/player.rs`, `core/src/context.rs`, and AVM2 hook files

The goal is cleanup planning, not behavior change.

## Decision Summary

| Flag | Current decision | Rationale |
|---|---|---|
| `--hebrew-font-workaround` | Keep temporarily, deprecate later | Legacy umbrella alias; still useful for recovery, but duplicates more explicit Ruffle font flags. |
| `--ruffle-hebrew-rtl-workaround` | Candidate to become default | Hebrew UI correctness depends on it; scope is narrow and runtime-only. |
| `--ruffle-userexperience-ctor-shim` | Candidate to become default | Personal Card breaks without it in the mixed-version client. |
| `--ruffle-buttongrid-clear-shim` | Candidate to become default | Personal Card close path breaks without it; narrow mixed-version bridge. |
| `--ruffle-textfloweditor-ctor-shim` | Candidate to become default | Compose tab compatibility depends on it in the mixed-version asset set. |
| `--ruffle-magic-controlpanel-shim` | Keep as flag only | Not yet proven as the final fix. Do not default. |
| `--ruffle-prelogin-call-trace` | Diagnostic-only | Useful for root-cause tracing, not for normal runs. |
| `--compat-loading-screen-text-mode` | Keep as flag | Still under active validation; likely future default once text visibility is fully verified. |
| `--suppress-flash-alerts` | Keep as flag | User-facing behavior choice, not a compatibility primitive. |
| `--bluebox-login-mode` | Candidate to change default to `rmList-login-split-poll` | Best-known fix for post-login delay. |
| `--static-room-first-room-delay` | Keep current default `0` | Already effectively cleanup-complete. |
| `--ruffle-fast-fail-socket-without-proxy` | Diagnostic-only / likely remove later | Proven not to solve the main freeze in the current flow. |
| `--ruffle-loadingscreen-text-compat-shim` | Internal only | Low-level runtime flag; should not be primary public operator surface. |
| `--ruffle-loadingscreen-text-compat-fallback-text` | Internal only | Transport for extracted envelope text; not a user-facing tuning knob. |

## Flag Inventory

### `--hebrew-font-workaround`

- Public CLI flag: `--hebrew-font-workaround`
- Env: `FSS_HEBREW_FONT_WORKAROUND`
- Config field: `hebrewFontWorkaround`
- Generated `playRuffle.ts` config key: no direct Ruffle config key; affects page-level CSS font workaround and config normalization.
- Ruffle JS public config key: none directly
- Rust/web builder field: none directly
- PlayerBuilder field: none directly
- Final Player / UpdateContext / AVM2 field: none directly
- Default value: `false`
- Current command-line usage: historical/manual recovery flag; not the preferred long-term surface.
- What it enables: legacy shortcut that turns on Hebrew device-font visibility support and, if no renderer is set, forces `ruffleDeviceFontRenderer = 'canvas'`.
- Whether it is still needed: temporarily yes, as an operator shorthand.
- Whether it should become default: no
- Whether it is safe/legal: yes for local compatibility work; it does not patch assets or redistribute content.
- Related tests: [`packages/core/src/__tests__/config.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/core/src/__tests__/config.test.ts), [`packages/http-gateway/src/__tests__/playRuffle.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/http-gateway/src/__tests__/playRuffle.test.ts)
- Related diagnostics: `/debug/ruffle-report` fields under page/font config such as `hebrewFontWorkaroundEnabled`, `deviceFontRenderer`, `fontSources`, `defaultFonts`
- Cleanup recommendation: keep for now, mark as legacy alias, and eventually replace with explicit `--ruffle-hebrew-font-workaround` plus renderer/font flags.

### `--ruffle-hebrew-font-workaround`

- Public CLI flag: `--ruffle-hebrew-font-workaround`
- Env: `FSS_RUFFLE_HEBREW_FONT_WORKAROUND`
- Config field: `ruffleHebrewFontWorkaround`
- Generated `playRuffle.ts` config key: none directly; drives CSS `@font-face` workaround and diagnostics
- Ruffle JS public config key: none
- Rust/web builder field: none
- PlayerBuilder field: none
- Final Player / UpdateContext / AVM2 field: none
- Default value: `false`
- Current command-line usage: manual Hebrew visibility runs
- What it enables: CSS-level font-family workaround for Hebrew glyph availability in Ruffle 0.2.0, which does not support the desired font source pipeline natively.
- Whether it is still needed: yes, where glyph availability still depends on CSS fallback.
- Whether it should become default: probably yes for Hebrew-first deployments, but only after one broader regression pass.
- Whether it is safe/legal: yes; local runtime compatibility only, no asset mutation.
- Related tests: [`packages/core/src/__tests__/config.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/core/src/__tests__/config.test.ts), [`packages/http-gateway/src/__tests__/playRuffle.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/http-gateway/src/__tests__/playRuffle.test.ts)
- Related diagnostics: `hebrewFontWorkaroundEnabled`, `fontSources`, `deviceFontRenderer`
- Cleanup recommendation: keep as the canonical font visibility flag; plan a future default-on decision for Hebrew deployments.

### `--ruffle-hebrew-rtl-workaround`

- Public CLI flag: `--ruffle-hebrew-rtl-workaround`
- Env: `FSS_RUFFLE_HEBREW_RTL_WORKAROUND`
- Config field: `ruffleHebrewRtlWorkaround`
- Generated `playRuffle.ts` config key: `hebrewRtlWorkaround`
- Ruffle JS public config key: `hebrewRtlWorkaround`
- Rust/web builder field: `hebrew_rtl_workaround`
- PlayerBuilder field: `hebrew_rtl_workaround`
- Final Player / UpdateContext / AVM2 field: `Player.hebrew_rtl_workaround`, `UpdateContext.hebrew_rtl_workaround`
- Default value: `false`
- Current command-line usage: part of the current patched Ruffle manual runs
- What it enables: narrow RTL reordering workaround in patched Ruffle for problematic Hebrew `EditText` / layout paths.
- Whether it is still needed: yes
- Whether it should become default: strong candidate, because core Hebrew UI correctness depends on it.
- Whether it is safe/legal: yes within the project’s local compatibility boundary; runtime-only, no SWF mutation.
- Related tests: [`packages/core/src/__tests__/ruffleConfig.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/core/src/__tests__/ruffleConfig.test.ts), [`packages/http-gateway/src/__tests__/playRuffle.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/http-gateway/src/__tests__/playRuffle.test.ts)
- Related diagnostics: `playerConfigHebrewRtlWorkaround`, `generatedHebrewRtlWorkaround`, RTL diagnostics in `/debug/ruffle-report`
- Cleanup recommendation: keep; likely default-on after final Hebrew regression verification.

### `--ruffle-userexperience-ctor-shim`

- Public CLI flag: `--ruffle-userexperience-ctor-shim`
- Env: `FSS_RUFFLE_USEREXPERIENCE_CTOR_SHIM`
- Config field: `ruffleUserExperienceCtorShim`
- Generated `playRuffle.ts` config key: `userExperienceCtorShim`
- Ruffle JS public config key: `userExperienceCtorShim`
- Rust/web builder field: `user_experience_ctor_shim`
- PlayerBuilder field: `user_experience_ctor_shim`
- Final Player / UpdateContext / AVM2 field: `Player.user_experience_ctor_shim`, `UpdateContext.user_experience_ctor_shim`, constructor shim in AVM2 class construction path
- Default value: `false`
- Current command-line usage: enabled in mixed-version MogoWall runs
- What bug/fix it enables: bridges `worlds4u.view::UserExperience` constructor arity mismatch for Personal Card.
- Whether it is still needed: yes for current asset set
- Whether it should become default: likely yes for this project’s known mixed-version client bundle
- Whether it is safe/legal: yes if kept narrow and local; runtime argument rewrite only
- Related tests: [`packages/core/src/__tests__/ruffleConfig.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/core/src/__tests__/ruffleConfig.test.ts), [`packages/http-gateway/src/__tests__/playRuffle.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/http-gateway/src/__tests__/playRuffle.test.ts)
- Related diagnostics: `userExperienceCtorShimEnabled`, `userExperienceCtorShimAppliedCount`, `lastUserExperienceCtorShimArgTypes`, `lastUserExperienceCtorShimDroppedArgType`
- Cleanup recommendation: keep and likely default-on once final MogoWall completion is confirmed.

### `--ruffle-buttongrid-clear-shim`

- Public CLI flag: `--ruffle-buttongrid-clear-shim`
- Env: `FSS_RUFFLE_BUTTONGRID_CLEAR_SHIM`
- Config field: `ruffleButtonGridClearShim`
- Generated `playRuffle.ts` config key: `buttonGridClearShim`
- Ruffle JS public config key: `buttonGridClearShim`
- Rust/web builder field: `button_data_grid_clear_shim`
- PlayerBuilder field: `button_data_grid_clear_shim`
- Final Player / UpdateContext / AVM2 field: `Player.button_data_grid_clear_shim`, `UpdateContext.button_data_grid_clear_shim`, AVM2 value/method hook paths
- Default value: `false`
- Current command-line usage: enabled in working Personal Card runs
- What bug/fix it enables: emulates missing `ButtonDataGrid.clear()` behavior so Personal Card can close and tab-switch cleanly.
- Whether it is still needed: yes
- Whether it should become default: likely yes for this mixed-version bundle
- Whether it is safe/legal: yes; narrow runtime compatibility bridge, no SWF edits
- Related tests: [`packages/core/src/__tests__/ruffleConfig.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/core/src/__tests__/ruffleConfig.test.ts), [`packages/http-gateway/src/__tests__/playRuffle.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/http-gateway/src/__tests__/playRuffle.test.ts)
- Related diagnostics: `buttonDataGridClearShimEnabled`, `buttonDataGridClearShimAppliedCount`, `buttonDataGridClearShimMode`, `buttonDataGridClearShimRemovedMcItems`, `buttonDataGridClearShimRecreatedMcItems`, `buttonDataGridClearShimResetSelectedItem`
- Cleanup recommendation: keep and likely default-on with the current asset bundle.

### `--ruffle-textfloweditor-ctor-shim`

- Public CLI flag: `--ruffle-textfloweditor-ctor-shim`
- Env: `FSS_RUFFLE_TEXTFLOWEDITOR_CTOR_SHIM`
- Config field: `ruffleTextFlowEditorCtorShim`
- Generated `playRuffle.ts` config key: `textFlowEditorCtorShim`
- Ruffle JS public config key: `textFlowEditorCtorShim`
- Rust/web builder field: `text_flow_editor_ctor_shim`
- PlayerBuilder field: `text_flow_editor_ctor_shim`
- Final Player / UpdateContext / AVM2 field: `Player.text_flow_editor_ctor_shim`, `UpdateContext.text_flow_editor_ctor_shim`
- Default value: `false`
- Current command-line usage: enabled in Compose/MogoWall compatibility runs
- What bug/fix it enables: bridges `TextFlowEditor` constructor arity mismatch so Compose can initialize.
- Whether it is still needed: yes for the mixed-version bundle
- Whether it should become default: likely yes if Compose remains part of the supported baseline
- Whether it is safe/legal: yes; local, narrow runtime-only rewrite
- Related tests: [`packages/core/src/__tests__/ruffleConfig.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/core/src/__tests__/ruffleConfig.test.ts), [`packages/http-gateway/src/__tests__/playRuffle.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/http-gateway/src/__tests__/playRuffle.test.ts)
- Related diagnostics: `textFlowEditorCtorShimEnabled`, `textFlowEditorCtorShimAppliedCount`, mismatch receiver/caller diagnostics in `/debug/ruffle-report`
- Cleanup recommendation: keep and likely default-on with the current asset set.

### `--ruffle-magic-controlpanel-shim`

- Public CLI flag: `--ruffle-magic-controlpanel-shim`
- Env: `FSS_RUFFLE_MAGIC_CONTROLPANEL_SHIM`
- Config field: `ruffleMagicControlPanelShim`
- Generated `playRuffle.ts` config key: `magicControlPanelShim`
- Ruffle JS public config key: `magicControlPanelShim`
- Rust/web builder field: `magic_control_panel_shim`
- PlayerBuilder field: `magic_control_panel_shim`
- Final Player / UpdateContext / AVM2 field: `Player.magic_control_panel_shim`, `UpdateContext.magic_control_panel_shim`
- Default value: `false`
- Current command-line usage: experimental only
- What bug/fix it enables: intended to bridge Magic/ControlPanel mixed-version event wiring, but not yet proven as the final fix.
- Whether it is still needed: yes for investigation, no as a stable requirement
- Whether it should become default: no
- Whether it is safe/legal: yes if kept narrow and local
- Related tests: [`packages/core/src/__tests__/ruffleConfig.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/core/src/__tests__/ruffleConfig.test.ts), [`packages/http-gateway/src/__tests__/playRuffle.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/http-gateway/src/__tests__/playRuffle.test.ts), [`packages/http-gateway/src/__tests__/debug.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/http-gateway/src/__tests__/debug.test.ts)
- Related diagnostics: `magicControlPanelShimConfigured`, `magicControlPanelShimBuilderReceived`, `magicDoEffectRegistrationsSeen`, `controlPanelMethodsSeen`, `magicCompatShimApplied`
- Cleanup recommendation: keep as explicit flag only. If later proven unnecessary, remove.

### `--ruffle-prelogin-call-trace`

- Public CLI flag: `--ruffle-prelogin-call-trace`
- Env: `FSS_RUFFLE_PRELOGIN_CALL_TRACE`
- Config field: `rufflePreloginCallTrace`
- Generated `playRuffle.ts` config key: `preloginCallTrace`
- Ruffle JS public config key: `preloginCallTrace`
- Rust/web builder field: `prelogin_call_trace` path in the Ruffle web builder/runtime integration
- PlayerBuilder field: propagated in patched runtime builder path
- Final Player / UpdateContext / AVM2 field: trace-only instrumentation
- Default value: `false`
- Current command-line usage: temporary investigative runs only
- What bug/fix it enables: no fix; exposes pre-login / timer / AVM2 call timing for freeze analysis.
- Whether it is still needed: yes for diagnostics, not for normal operation
- Whether it should become default: no
- Whether it is safe/legal: yes
- Related tests: [`packages/core/src/__tests__/config.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/core/src/__tests__/config.test.ts), [`packages/http-gateway/src/__tests__/playRuffle.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/http-gateway/src/__tests__/playRuffle.test.ts)
- Related diagnostics: `playerConfigPreloginCallTrace`, `generatedPreloginCallTrace`, trace events routed through `/debug/ruffle-event`
- Cleanup recommendation: diagnostic-only.

### `--compat-loading-screen-text-mode`

- Public CLI flag: `--compat-loading-screen-text-mode`
- Env: `FSS_COMPAT_LOADING_SCREEN_TEXT_MODE`
- Config field: `compatLoadingScreenTextMode`
- Generated `playRuffle.ts` config key: indirectly drives `loadingScreenTextCompatShim` and `loadingScreenTextCompatFallbackText`
- Ruffle JS public config key: none directly from CLI name; it is translated into `loadingScreenTextCompatShim` and `loadingScreenTextCompatFallbackText`
- Rust/web builder field: `loading_screen_text_compat_shim`, `loading_screen_text_compat_fallback_text`
- PlayerBuilder field: `loading_screen_text_compat_shim`, `loading_screen_text_compat_fallback_text`
- Final Player / UpdateContext / AVM2 field: `Player.loading_screen_text_compat_shim`, `UpdateContext.loading_screen_text_compat_shim`, AVM2 LoadingScreen text replacement path
- Default value: `off`
- Current command-line usage: `plain` is the current best-known mode under test
- What bug/fix it enables: prevents the 15-second TLF/MXML LoadingScreen freeze by serving a lighter runtime text form.
- Whether it is still needed: yes
- Whether it should become default: likely yes after visible text is fully verified in browser
- Whether it is safe/legal: yes; uses local extracted text / neutral fallback only, no asset mutation
- Related tests: [`packages/core/src/__tests__/config.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/core/src/__tests__/config.test.ts), [`packages/http-gateway/src/__tests__/playRuffle.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/http-gateway/src/__tests__/playRuffle.test.ts), [`packages/http-gateway/src/__tests__/assets.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/http-gateway/src/__tests__/assets.test.ts)
- Related diagnostics: `compatLoadingScreenTextMode`, `loadingScreenTextEnvelopeBuilt`, `loadingScreenTextEnvelopeSource`, `loadingScreenTextEnvelopeCandidateCount`, `loadingScreenTextCompatShimConfigured`, `loadingScreenTextCompatShimEnabled`, `loadingScreenTextRenderPath`
- Cleanup recommendation: keep as the public operator switch until text visibility is confirmed stable. Then consider making `plain` the default.

### `--ruffle-loadingscreen-text-compat-shim`

- Public CLI flag: `--ruffle-loadingscreen-text-compat-shim`
- Env: `FSS_RUFFLE_LOADINGSCREEN_TEXT_COMPAT_SHIM`
- Config field: `ruffleLoadingScreenTextCompatShim`
- Generated `playRuffle.ts` config key: `loadingScreenTextCompatShim`
- Ruffle JS public config key: `loadingScreenTextCompatShim`
- Rust/web builder field: `loading_screen_text_compat_shim`
- PlayerBuilder field: `loading_screen_text_compat_shim`
- Final Player / UpdateContext / AVM2 field: `Player.loading_screen_text_compat_shim`, `UpdateContext.loading_screen_text_compat_shim`
- Default value: `false`
- Current command-line usage: internal/low-level override, usually driven indirectly by `--compat-loading-screen-text-mode`
- What bug/fix it enables: turns on the AVM2 LoadingScreen text replacement hook.
- Whether it is still needed: yes internally
- Whether it should become default: not as a public top-level flag
- Whether it is safe/legal: yes
- Related tests: [`packages/http-gateway/src/__tests__/playRuffle.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/http-gateway/src/__tests__/playRuffle.test.ts)
- Related diagnostics: `loadingScreenTextCompatShimConfigured`, `loadingScreenTextCompatShimEnabled`
- Cleanup recommendation: keep as an internal/runtime flag, not as the main operator interface.

### `--ruffle-loadingscreen-text-compat-fallback-text`

- Public CLI flag: `--ruffle-loadingscreen-text-compat-fallback-text`
- Env: `FSS_RUFFLE_LOADINGSCREEN_TEXT_COMPAT_FALLBACK_TEXT`
- Config field: `ruffleLoadingScreenTextCompatFallbackText`
- Generated `playRuffle.ts` config key: `loadingScreenTextCompatFallbackText`
- Ruffle JS public config key: `loadingScreenTextCompatFallbackText`
- Rust/web builder field: `loading_screen_text_compat_fallback_text`
- PlayerBuilder field: `loading_screen_text_compat_fallback_text`
- Final Player / UpdateContext / AVM2 field: `Player.loading_screen_text_compat_fallback_text`, `UpdateContext.loading_screen_text_compat_fallback_text`
- Default value: unset
- Current command-line usage: internal transport/debug use only
- What bug/fix it enables: supplies extracted `[LS_TEXT_V1]` envelope or explicit fallback text to the runtime shim.
- Whether it is still needed: yes internally
- Whether it should become default: no public default
- Whether it is safe/legal: yes if sourced from local extracted content or neutral fallback only
- Related tests: [`packages/http-gateway/src/__tests__/playRuffle.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/http-gateway/src/__tests__/playRuffle.test.ts)
- Related diagnostics: `loadingScreenTextCompatFallbackTextLength`, `loadingScreenTextEnvelopeDecoded`, `loadingScreenTextSelectedPreview`, `loadingScreenTextEnvelopeDecodeError`
- Cleanup recommendation: internal only.

### `--suppress-flash-alerts`

- Public CLI flag: `--suppress-flash-alerts`
- Env: `FSS_SUPPRESS_FLASH_ALERTS`
- Config field: implemented by forcing `flashDebug = false`
- Generated `playRuffle.ts` config key: none; affects runtime/UI behavior through server config and FlashVars/debug choices
- Ruffle JS public config key: none
- Rust/web builder field: none
- PlayerBuilder field: none
- Final Player / UpdateContext / AVM2 field: none
- Default value: off unless explicitly requested; `flashDebug` defaults to `true`
- Current command-line usage: frequently enabled in manual user-facing runs
- What bug/fix it enables: suppresses noisy Flash alerts/popups while compatibility work is in progress.
- Whether it is still needed: yes as a user-facing noise control
- Whether it should become default: no
- Whether it is safe/legal: yes
- Related tests: [`packages/core/src/__tests__/config.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/core/src/__tests__/config.test.ts)
- Related diagnostics: indirect only
- Cleanup recommendation: keep as a user-facing flag.

### `--bluebox-login-mode`

- Public CLI flag: `--bluebox-login-mode`
- Env: `FSS_BLUEBOX_LOGIN_MODE`
- Config field: `blueboxLoginMode`
- Generated `playRuffle.ts` config key: none
- Ruffle JS public config key: none
- Rust/web builder field: none
- PlayerBuilder field: none
- Final Player / UpdateContext / AVM2 field: none
- Default value: `deferred`
- Current command-line usage: the current best mode is `rmList-only-then-xt-login-on-poll`, normalized to `rmList-login-split-poll`
- What bug/fix it enables: determines BlueBox login packet delivery timing; `rmList-login-split-poll` fixes the post-login 15-second delay.
- Whether it is still needed: yes
- Whether it should become default: yes, default should likely move from `deferred` to `rmList-login-split-poll`
- Whether it is safe/legal: yes
- Related tests: [`packages/core/src/__tests__/ruffleConfig.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/core/src/__tests__/ruffleConfig.test.ts), [`packages/http-gateway/src/__tests__/blueBox.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/http-gateway/src/__tests__/blueBox.test.ts)
- Related diagnostics: `/debug/bluebox-summary` fields around `loginResponsePackets`, `xtLoginToStaticRoomListRequestMs`, `firstPollAfterLoginResponsePackets`
- Cleanup recommendation: make `rmList-login-split-poll` the default after one final compatibility pass.

### `--static-room-first-room-delay`

- Public CLI flag: `--static-room-first-room-delay`
- Env: `FSS_STATIC_ROOM_FIRST_ROOM_DELAY`
- Config field: `staticRoomFirstRoomDelay`
- Generated `playRuffle.ts` config key: none
- Ruffle JS public config key: none
- Rust/web builder field: none
- PlayerBuilder field: none
- Final Player / UpdateContext / AVM2 field: none
- Default value: `0`
- Current command-line usage: explicitly passed as `0` in most manual runs, matching the current default
- What bug/fix it enables: controls the `fR` value in static room list responses
- Whether it is still needed: yes as a server behavior knob
- Whether it should become default: already defaulted correctly at `0`
- Whether it is safe/legal: yes
- Related tests: [`packages/core/src/__tests__/config.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/core/src/__tests__/config.test.ts), [`packages/sfs-emulator/src/__tests__/room.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/sfs-emulator/src/__tests__/room.test.ts)
- Related diagnostics: `/debug/bluebox-summary` first-room timing and room flow metrics
- Cleanup recommendation: keep as-is.

### `--ruffle-fast-fail-socket-without-proxy`

- Public CLI flag: `--ruffle-fast-fail-socket-without-proxy`
- Env: `FSS_RUFFLE_FAST_FAIL_SOCKET_WITHOUT_PROXY`
- Config field: `ruffleFastFailSocketWithoutProxy`
- Generated `playRuffle.ts` config key: `fastFailSocketWithoutProxy`
- Ruffle JS public config key: `fastFailSocketWithoutProxy`
- Rust/web builder field: `fast_fail_socket_without_proxy` path in patched runtime integration
- PlayerBuilder field: propagated in patched runtime builder path
- Final Player / UpdateContext / AVM2 field: runtime socket connect path
- Default value: `false`
- Current command-line usage: diagnostic/experimental only
- What bug/fix it enables: intended to fail socket connections quickly when no proxy exists, to accelerate BlueBox fallback.
- Whether it is still needed: only for diagnostics; it did not solve the main freeze in the current client path.
- Whether it should become default: no
- Whether it is safe/legal: yes
- Related tests: [`packages/core/src/__tests__/ruffleConfig.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/core/src/__tests__/ruffleConfig.test.ts), [`packages/http-gateway/src/__tests__/playRuffle.test.ts`](/abs/path/C:/PROJ/sfs-emu/flash-socket-server/packages/http-gateway/src/__tests__/playRuffle.test.ts)
- Related diagnostics: `playerConfigFastFailSocketWithoutProxy`, `generatedFastFailSocketWithoutProxy`, socket fast-fail console traces
- Cleanup recommendation: diagnostic-only now; remove later if no longer useful.

### Additional related flags

These are not in the minimum requested list but are part of the same compatibility surface and should be tracked in cleanup:

- `--ruffle-rtl-layout-diagnostics`
  - Status: diagnostic-only
  - Why: verbose per-fragment RTL gating inspection

- `--canvas-text-diagnostics`
  - Status: diagnostic-only
  - Why: proved useful to show per-glyph canvas rendering, but not a fix path

- `--canvas-rtl-render-workaround`
  - Status: remove later
  - Why: canvas-level RTL correction was disproven because Ruffle renders Hebrew as individual glyph draw calls

- `--rtl-text-workaround`
  - Status: keep as server-side legacy compatibility flag for now
  - Why: still covered by tests and diagnostics, but superseded in many paths by the Ruffle RTL workaround

- `--rtl-wrap-mode`
  - Status: keep only while `rtlTextWorkaround` exists
  - Why: parameter for legacy server text transform scope

## Cleanup Plan

### Keep As Flag

- `--hebrew-font-workaround`
- `--ruffle-hebrew-font-workaround`
- `--compat-loading-screen-text-mode`
- `--suppress-flash-alerts`
- `--static-room-first-room-delay`
- `--ruffle-magic-controlpanel-shim`
- `--rtl-text-workaround`
- `--rtl-wrap-mode`

### Make Default

- `--bluebox-login-mode`
  - Proposed new default: `rmList-login-split-poll`
- `--ruffle-hebrew-rtl-workaround`
  - Proposed after one final Hebrew regression pass
- `--ruffle-userexperience-ctor-shim`
  - Proposed for the current mixed-version asset bundle
- `--ruffle-buttongrid-clear-shim`
  - Proposed for the current mixed-version asset bundle
- `--ruffle-textfloweditor-ctor-shim`
  - Proposed if Compose remains in scope for supported completion

### Diagnostic Only

- `--ruffle-prelogin-call-trace`
- `--ruffle-fast-fail-socket-without-proxy`
- `--ruffle-rtl-layout-diagnostics`
- `--canvas-text-diagnostics`
- `--ruffle-loadingscreen-text-compat-shim`
- `--ruffle-loadingscreen-text-compat-fallback-text`

### Remove Later

- `--canvas-rtl-render-workaround`
  - Reason: disproven as a viable correction point
- `--hebrew-font-workaround`
  - Long-term only after explicit font/Ruffle flags fully replace it

## Recommended Next Cleanup Sequence

1. Change `blueboxLoginMode` default to `rmList-login-split-poll` and keep the old aliases normalized for compatibility.
2. Decide whether the three proven mixed-version shims should become default-on for `ruffle-local`:
   `userExperienceCtorShim`, `buttonGridClearShim`, `textFlowEditorCtorShim`.
3. Keep LoadingScreen in flagged mode until one browser pass confirms visible text and no regressions.
4. After Hebrew regression confirmation, default `ruffleHebrewRtlWorkaround` on for Hebrew runs.
5. Move `prelogin-call-trace`, `fast-fail-socket-without-proxy`, and canvas diagnostics into a clearly documented diagnostics-only section of CLI help.
