# Ruffle Experiment

This repository is testing Ruffle as a modern replacement for Flash runtime containers because the current client reaches post-login flow but the standalone Flash projector fails on unguarded `ExternalInterface.call(...)` usage.

This is an isolated experiment:
- No SWFs are modified.
- No Adobe Flash Player binaries are used.
- No Basilisk binaries are added here.
- No external game traffic should be used.
- `basilisk-local` remains the fallback plan if Ruffle cannot support this client.

## Install The Local Ruffle Package

Option 1:
- Run `npm run setup:ruffle`

Option 2:
- Download the official self-hosted Ruffle web package and extract it into `tools/runtime/ruffle`
- Required local file: `tools/runtime/ruffle/ruffle.js`

As of June 5, 2026, Ruffle lists stable `0.2.0` and nightly `2026-06-05`, both with a self-hosted web package option:
- [Ruffle downloads](https://ruffle.rs/downloads)
- [Ruffle releases](https://github.com/ruffle-rs/ruffle/releases)

If you want the nightly build instead of stable:
- Run `npm run setup:ruffle -- --channel nightly`

Downloaded local metadata is written to `tools/runtime/ruffle/metadata.json`.

## Run

```bash
npm run dev --workspace=@flash-socket-server/cli -- --adapter ruffle-local --assets "C:\PROJ\sfs-emu\CLINET-CLEAN" --verbose-http --public-host localhost
```

Then open:
- `http://localhost:8080/play-ruffle.html`
- `http://localhost:8080/debug/ruffle-report`
- `http://localhost:8080/debug/runtime-timeline`

## What To Look For

The Ruffle report is meant to answer:
- Ruffle page served: yes/no
- `Mogo.swf` requested: yes/no
- `Login.swf` requested: yes/no
- `loginGR.swf` requested: yes/no
- `LoginU.aspx` requested: yes/no
- `LoadingScreen_1.swf` requested: yes/no
- TCP/socket attempt observed: yes/no
- Captured client/runtime errors: present/absent

`play-ruffle.html` also installs safe no-op JavaScript hooks for known `ExternalInterface` targets:
- `onSetVar`
- `onTrackEvent`
- `onPageView`
- `setLanguage`
- `reloadPage`
- `clientTrace`
- `sendLog`
- `trace`
- `openWindow`
- `openUrl`
- `closeWindow`
- `setTitle`
- `onFlashReady`

## Interpreting Results

Signs Ruffle is viable:
- `/play-ruffle.html` loads the local package.
- The page reaches `Mogo.swf`, `Login.swf`, `loginGR.swf`, `LoginU.aspx`, and `LoadingScreen_1.swf`.
- The timeline shows a TCP connection after `Servers.aspx`.
- No blocking Ruffle errors appear in the page log or `/debug/ruffle-report`.

Signs Ruffle is not viable:
- The local package fails to load.
- Ruffle errors on unsupported AS3 behavior.
- The flow stalls before or shortly after login.
- SmartFox TCP/policy flow never begins.
- ExternalInterface, AVM2, or socket support errors appear in diagnostics.

Known risk:
- AS3 plus SmartFox TCP sockets may still not work in Ruffle even if asset loading and browser hooks succeed.

## Cleanup

To remove only generated local Ruffle runtime files:

```bash
npm run clean:ruffle
```

This cleanup must not remove:
- user assets
- SWFs
- `CLINET-CLEAN`
- emulator source code
- other adapters
