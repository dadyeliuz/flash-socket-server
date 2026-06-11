const fs = require('fs');
const path = require('path');

const runtimeDir = path.resolve(
  process.argv[2] || path.join(__dirname, '..', 'tools', 'runtime', 'ruffle')
);

const requiredPublicKeys = [
  'hebrewRtlWorkaround',
  'rtlTextWorkaround',
  'textFlowEditorCtorShim',
  'buttonGridClearShim',
  'userExperienceCtorShim',
  'magicControlPanelShim',
  'loadingScreenTextCompatShim',
  'loadingScreenTextCompatFallbackText'
];

const requiredInternalMarkers = [
  'hebrew_rtl',
  'rtl_text_workaround',
  'text_flow_editor',
  'button_data_grid_clear_shim',
  'user_experience_ctor_shim',
  'magic_controlpanel_shim',
  'magic_trace',
  'loading_screen_shim'
];

if (!fs.existsSync(runtimeDir)) {
  console.error(`[ruffle-runtime-sanity] Runtime directory does not exist: ${runtimeDir}`);
  process.exit(1);
}

const runtimeFiles = fs
  .readdirSync(runtimeDir)
  .filter((name) => /\.(js|wasm)$/i.test(name))
  .map((name) => ({
    name,
    content: fs.readFileSync(path.join(runtimeDir, name)).toString('utf8')
  }));

if (runtimeFiles.length === 0) {
  console.error(`[ruffle-runtime-sanity] No JS/WASM files found in: ${runtimeDir}`);
  process.exit(1);
}

const combined = runtimeFiles.map((file) => file.content).join('\n');
const requiredTerms = [...requiredPublicKeys, ...requiredInternalMarkers];
const missing = requiredTerms.filter((term) => !combined.includes(term));

if (missing.length > 0) {
  console.error('[ruffle-runtime-sanity] Required local Ruffle patch terms are missing:');
  for (const term of missing) {
    console.error(`- ${term}`);
  }
  console.error(`[ruffle-runtime-sanity] Checked: ${runtimeDir}`);
  process.exit(1);
}

console.log(
  `[ruffle-runtime-sanity] OK: ${requiredTerms.length} required terms found in ${runtimeDir}`
);
