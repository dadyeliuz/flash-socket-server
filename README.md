# Flash Socket Preservation Server

A clean-room Node.js & TypeScript monorepo designed to preserve and execute legacy Flash MMO client applications without altering or distributing proprietary client files.

---

## 🔒 Legal and Clean-Room Boundaries

This project adheres strictly to **clean-room reverse engineering standards**:
- **No Copyrighted Files**: The repository does *not* contain `.swf`, `.png`, `.jpg`, `.mp3`, `.wav`, or `.xml` assets from the game client.
- **No Player Binaries**: The repository does *not* contain Adobe Flash Player binaries, web plugins, or DLL files.
- **Segregated Working Directory**: All development occurs strictly under `flash-socket-server/`.
- **Pre-commit Cleanliness Checks**: The server triggers an automated validation script `scripts/validate-cleanliness.js` on compile/startup, crashing immediately if any forbidden binary or media asset file is detected inside the codebase.

---

## 🚀 Setup & Installation

### 1. Install Dependencies
This project uses **pnpm workspaces**. Ensure you have Node.js (22+) and pnpm installed:

```bash
pnpm install
```

### 2. Prepare Your Local Assets Folder
Create an external assets folder on your local system (e.g. `C:\PROJ\sfs-emu\assets`) and copy your legally obtained Flash client assets there.

---

## 💻 Development Commands

Start the unified HTTP, TCP game socket, and optional policy servers in watch/development mode:

```bash
pnpm dev -- --assets "C:\PROJ\sfs-emu\CLINET-CLEAN"
```

### Options
You can configure the server via command line arguments:
- `--assets <path>` / `-a <path>`: (Required) Path to the folder containing your legally obtained game files.
- `--http-port <port>` / `--hp <port>`: Port for the HTTP Express/Fastify server (default: `8080`).
- `--socket-port <port>` / `--sp <port>`: Port for the SFS TCP server (default: `9339`).
- `--policy-port <port>` / `--pp <port>`: Port for the Flash socket policy server (default: `843`).
- `--entry-swf <name>`: Configurable entrypoint Flash animation/application SWF file (default: `Login.swf`).
- `--public-host <host>`: Configurable Host value served inside Servers.aspx XML (default: `127.0.0.1`).
- `--runtime-mode <mode>` / `--adapter <mode>`: Options: `web-container` (default), `projector`, `ruffle`, `ruffle-local`.

Experimental Ruffle flow is documented in [docs/RUFFLE_EXPERIMENT.md](/C:/PROJ/sfs-emu/flash-socket-server/docs/RUFFLE_EXPERIMENT.md).

Or rename `configs/server.example.yml` to `server.yml` in the root folder and edit configuration values there.

---

## 🧪 Testing

Run standard unit tests with Vitest:

```bash
pnpm test
```
