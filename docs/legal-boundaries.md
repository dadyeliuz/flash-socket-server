# Legal Boundaries and Clean-Room Compliance

This document outlines the strict guidelines governing the development and contribution rules of this repository.

---

## 1. Strict Asset Separation

* **No Copyrighted Files**: Absolutely no proprietary client assets (including `.swf`, `.png`, `.jpg`, `.mp3`, `.wav`, `.xml` game data, or `.as` script decompiles) are committed or stored in this repository.
* **No Adobe Player Binaries**: The repository does *not* contain the standalone Flash Player executable, Pepper Flash DLL (`pepflashplayer.dll`), or active web plugins. These are exclusively user-provided dependencies.
* **Clean Workspaces**: The folder `flash-socket-server` is the only working directory for implementation. Folders like `CLINET-CLEAN` and the Adobe runtimes directory (`C:\PROJ\sfs-emu\Adobe`) are external, user-supplied resources.
* **No Patches**: The client-side SWF files are treated as *immutable read-only binaries*. The runtime does not edit or patch them. All integrations are resolved via HTML5 container stubs and standard network emulation.

---

## 2. Automated Cleanliness Checking

To prevent any accidental commit of forbidden assets, we have integrated:
1. **Strict Gitignore Rules**: Expressly bans binary, script, and media extensions.
2. ** Clean-Room Validator (`scripts/validate-cleanliness.js`)**: An automated script that executes prior to any development compilation. It parses all files and crashes immediately if any forbidden binary or media asset file is present in the codebase.

---

## 3. Reverse Engineering Compliance

* **Clean-Room Protocols**: The TCP server relies entirely on clean-room network emulation based on observed network packets and standard SmartFoxServer documentation.
* **Read-Only Inspiration**: The prototype code folder `server-old-readonly` is treated as a read-only conceptual reference. No code, configuration lines, or decompiled assets may be reproduced or copied from it.
