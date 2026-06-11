# Compatibility Doctor

The Compatibility Doctor is a non-invasive diagnostic engine that validates mixed or incomplete MMO client assets, parses Flash Player trace logs, and produces structured reports on asset version mismatches.

## Command Usage

```bash
npm run doctor -- --assets <assets_path> [--flashlog <path_to_flashlog.txt>] [--http-log <http_gateway.log>] [--ffdec <decompiler_cli_path>] [--json] [--out <output_path>]
```

### Options

| Option | Required | Description |
|---|---|---|
| `--assets` | Yes | Path to the directory containing user client files (`Swf/`, `Xmls/`, etc.). |
| `--flashlog` | No | Path to local `%APPDATA%\Macromedia\Flash Player\Logs\flashlog.txt` debug traces. |
| `--http-log` | No | Path to gateway HTTP logs to check for asset 404s. |
| `--ffdec` | No | Path to JPEXS CLI executable (`ffdec-cli.exe`) for on-demand link analysis. |
| `--json` | No | Outputs report formatted strictly as JSON. |
| `--out` | No | Saves report file to the path (must be outside the `--assets` directory). |

---

## Active Diagnostic Rules

### RULE A: Missing Linkage Symbol
* **Severity**: `BLOCKER`
* **Trigger**: A class linkage definition like `mlLoginScreenHeb` is requested (found in `flashlog.txt` or parsed from SWF tags) but is absent from the graphic files (like `loginGR.swf`).
* **Fix**: Replace `loginGR.swf` with a version that defines the missing symbol, or use a matching `Login.swf`.

### RULE B: MovieClip Structure Mismatch
* **Severity**: `BLOCKER`
* **Trigger**: A runtime null reference (`Error #1009`) occurs inside button layouts (like `LoginScreen.addLangText`).
* **Fix**: Ensure code files (`Login.swf`) and graphic files (`loginGR.swf`) are from matching version releases.

### RULE C: Missing AS3 Class
* **Severity**: `BLOCKER`
* **Trigger**: Flash VM fails to load a compiled class definition (`VerifyError: Error #1014: Class ... not found`) referenced by `Main.swf`.
* **Fix**: Re-supply the original compiled SWF or add the missing class definitions to a shared library.

### RULE D: Invalid XML Syntax
* **Severity**: `FIXED_BY_COMPAT`
* **Trigger**: Unclosed HTML tags (like `<br>` inside text nodes) break standard ActionScript XML parsing (`Error #1085` / `Error #1088`).
* **Fix**: Active runtime preservation layer auto-corrects tags.

### RULE E: SharedObject Flush Blocked
* **Severity**: `WARNING`
* **Trigger**: STANDALONE Projector throws write crash `Error #2130` when trying to save cookies to disk.
* **Fix**: Launch with `debug=false` (Release Projector Mode) to bypass stand-alone flush crashes, or configure Flash Trust paths.

### RULE F: Missing HTTP Asset Gateway 404s
* **Severity**: `WARNING`
* **Trigger**: The server log registers a request that returned a `404 Not Found`.
* **Fix**: Place the missing file under the expected directory path in `--assets`.

### RULE G: Missing getSwfParams Method
* **Severity**: `BLOCKER`
* **Trigger**: 
  - A runtime `TypeError: Error #1006: getSwfParams is not a function` is triggered in `flashlog.txt` during initialization of login or screen modules.
  - Or the decompress scan of `loginGR.swf` confirms the string `getSwfParams` is missing from the compiled symbols.
* **Flash vs JS Bridge Mismatch Distinction**:
  - **ExternalInterface missing function**: If `ExternalInterface.call("someFunction")` fails, it is a browser/container bridge issue (JS side).
  - **mc.getSwfParams is not a function**: If the error occurs on an ActionScript MovieClip instance (e.g. `this.mc.getSwfParams()`), it is a Flash MovieClip/library asset mismatch. A JavaScript container function will **not** fix this crash because JS cannot return references to dynamic MovieClip instances inside Flash.
* **Fix**: Use a compatible `loginGR.swf` asset whose exported login screen symbol implements the `getSwfParams()` method.

### RULE H: Linkage Symbol Namespace/Package Mismatch
* **Severity**: `BLOCKER`
* **Trigger**:
  - The client expects a linkage symbol (e.g. `mlLoginScreen` for the login graphic) in the global namespace/package, but the active graphics library defines it inside a package prefix (e.g. `mogoTab:mlLoginScreen`).
  - Or the user configured `compatLoginGraphicsAlias` is scanned and found to have this package mismatch (partial candidate).
* **Fix**: Locate a matching `loginGR.swf` that compiles the `mlLoginScreen` symbol in the global namespace, or use a matching `Login.swf` that expects the `mogoTab:` namespaced class prefix. Do not attempt to use partial runtime-aliased candidates as a final fix.


