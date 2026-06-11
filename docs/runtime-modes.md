# Preservation Container Runtime Modes

This document explains the runtime strategies supported by the preservation workspace.

---

## 1. Web Container (`web-container`)

* **Primary Mode (Strongly Recommended)**
* **How it works**: The preservation server spins up a local Express/Fastify gateway that serves a wrapper page `/play.html`. 
* **Key advantage**: Flash SWFs frequently invoke standard `ExternalInterface.call("...")` queries to interface with browser integrations (e.g. tracing messages, setting titles, resizing elements). The web container provides broad, safe JavaScript stubs to satisfy these requests, preventing client crashes or `Error #2067` exceptions.
* **Target environment**: Flash-enabled browsers (e.g., via Pepper Flash DLL loaded in Electron/Flashpoint-style environments).

---

## 2. Ruffle Emulator (`ruffle`, `ruffle-local`)

* **Experimental Preservation Mode**
* **How it works**: Serves the game inside Ruffle, the open-source WebAssembly Flash Player Emulator, using a locally hosted self-contained web package.
* **Status**: Experimental. Use `ruffle-local` for the explicit localhost-only adapter. `ruffle` currently aliases that mode for backward compatibility.
* **Risk**: AS3 compatibility and SmartFox TCP sockets may still fail. Treat `/play-ruffle.html` and `/debug/ruffle-report` as diagnostics, not proof of runtime parity.

---

## 3. Standalone Flash Projector (`projector`)

* **Local Debugging Mode Only (Fallback)**
* **How it works**: Launches the Flash SWF directly inside standalone runtimes (such as `flashplayer_32_sa.exe`).
* **Limitations**: Lacks web browser bindings. Any `ExternalInterface` call invoked by the SWF will immediately fail. Useful exclusively for checking raw connection protocols or early asset loading diagnostics.
