import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import * as child_process from 'child_process';
import * as os from 'os';

const KNOWN_AVATAR_EVENT_CONSTANTS = [
  'AVTAR_REQUEST_MOVE_EVT',
  'ASK_DATA_EVT',
  'BUY_ITEM_EVT',
  'TRADE_EVT',
  'SENDPRIVATE',
  'YOU_BEEN_KICKED',
  'CHATMODE',
  'LOGIN_TWICE',
  'SHOW_AVATAR',
  'SHOW_PRIVATECHAT',
  'SHOW_TRADE',
  'AVTARMOVE_EVT',
  'DANCEMOVES',
  'SPECIALMOVE',
  'PETSPECIALMOVE',
  'SPECIALEFECT',
  'SPECIALEFFECT',
  'AVTARCHANGEROOM_EVT',
  'AVTARCHANGEROOMPASS_EVT',
  'ENTRYMULTIGAME_EVT',
  'AVTARCHANGEROOMAREA_EVT',
  'AVTARCHANGEROOMAREAPASS_EVT',
  'INTRACT_WITH_EVT',
  'INTRACT_SHOP_EVT',
  'INTRACT_POPUP_EVT',
  'INTRACT_FOREST_POPUP_EVT',
  'INTRACT_LIBRARY_POPUP_EVT',
  'INTRACT_BOOK_POPUP_EVT',
  'INTRACT_GAME_POPUP_EVT',
  'INTRACT_ELEVATOR_POPUP_EVT',
  'INTRACT_APP_POPUP_EVT',
  'INTRACT_HALLOFFAME_EVT',
  'INTRACT_WEAR_ITEM_EVT',
  'INTRACT_GIFT_EVT',
  'INTRACT_ADVEN_EVT',
  'INTRACT_SB_EVT',
  'INTRACT_WISH_WELL_EVT',
  'INTRACT_BULL_EVT',
  'INTRACT_DYNAMIC_BULL_EVT',
  'INTRACT_AVATAR_ACT_EVT',
  'INTRACT_FOOD_STAND_EVT',
  'INTRACT_ADVENTURE_PORTAL_EVT',
  'SEND_MSG',
  'SEND_ACTION',
  'ITEMS_CHANGE_EVT',
  'DELTEAVATAR_EVT',
  'USERDELETED_EVT',
  'USERADDED_EVT',
  'COMPETITION_EVT',
  'BODDY_LIST',
  'BE_A_MEMBER',
  'WORLD_SCORE_EVT',
  'WHISTLE_GROUP_PASSOK_EVT',
  'POOL',
  'DISABLEUSERCARD_EVT',
  'AVATAR_ACTION_EVT',
  'IN_TRADE',
  'IN_CHAT',
  'WAIT_FOR_GAMER',
  'FIND_PROGRESS_ITEM',
  'WORLDS_INFO',
  'TIP_OF_DAY',
  'CONTROL_STATE',
  'PETS_CACON',
  'PETS_BUY',
  'GET_PET_TO_BUY',
  'AVATAR_CHANGE_COLOR',
  'INTRACT_PRIZE_EVT'
];

export interface CompatMatrixOptions {
  loginDir: string;
  mainDir: string;
  assetsPath: string;
  loginGrDir?: string;
  mogoDir?: string;
  showCopyForIncompatible?: boolean;
  ffdecPath?: string;
  json?: boolean;
  outPath?: string;
  deep?: boolean;
  top?: number;
  strict?: boolean;
  requireProvenStartup?: boolean;
  inspectMogo?: boolean;
}

export interface MogoFingerprint {
  path: string;
  filename: string;
  size: number;
  sha256: string;
  expectsLoginInit: boolean;
  loginLoadDetected: boolean;
  docClass?: string | null;
  appVer?: string | null;
  isAS3?: boolean;
  hasOnCompleteHandler?: boolean;
  expectsLoginInitStatus?: 'YES' | 'NO' | 'UNKNOWN';
  asVersion?: 'AS1/AS2' | 'AS3';
  loadsLoginStatus?: 'YES' | 'NO' | 'UNKNOWN';
  callsLoginInitStatus?: 'YES' | 'NO' | 'UNKNOWN';
  evidenceLine?: string | null;
  deepScanPerformed?: boolean;
}

export interface LoginGrFingerprint {
  path: string;
  filename: string;
  size: number;
  sha256: string;
  hasGlobalMlLoginScreen: boolean;
  hasMlLoginScreenHeb: boolean;
  hasMlLoginMultiUsers: boolean;
  hasMlAvatarBig: boolean;
  hasGetSwfParams: boolean;
  hasRequiredLoginChildren: boolean;
  hasNamespacedMlLoginScreen: boolean;
}

export interface LoginFingerprint {
  path: string;
  filename: string;
  size: number;
  sha256: string;
  appVer: string | null;
  dateMarker: string | null;
  definesLoginClass: boolean;
  exposesInitMethod: boolean;
  exposesInitMethodStatus: 'OK' | 'BLOCKED' | 'UNKNOWN';
  onAddedOrEddedDetected?: boolean;
  baseloginFlowDetected: boolean;
  requiresGetSwfParams: boolean;
  requiresMlLoginScreen: boolean;
  requiresMlLoginScreenHeb: boolean;
  requiresMlLoginMultiUsers: boolean;
  providesFirstLoadingScreens: boolean;
  externalInterfaceCount: number;
  definedClasses: string[];
  
  // Legacy / reference helpers
  referencesFirstLoadingScreens: boolean;
  referencesLoadingScreenTO: boolean;
  referencesXmlToList: boolean;
  referencesLoadingScreens: boolean;
  referencesMainSwf: boolean;
  referencesStartMainApp: boolean;
  referencesGetSwfParams: boolean;
  referencesLoginEvent: boolean;
  usesModernServerList: boolean;
  deepScanPerformed?: boolean;
  providesAvatarEventTipOfDay?: boolean;
  avatarEventConstants?: string[];
}

export interface MainFingerprint {
  path: string;
  filename: string;
  size: number;
  sha256: string;
  appVer: string | null;
  dateMarker: string | null;
  definesMain: boolean;
  definesRequestHandler: boolean;
  definesSmartConector: boolean;
  definesScreenManager: boolean;
  definesLoadingScreenManager: boolean;
  referencesLoadingScreenTO: boolean;
  referencesFirstLoadingScreens: boolean;
  referencesLoadingScreens: boolean;
  referencesLoginEvent: boolean;
  referencesBlueBox: boolean;
  referencesVerChk: boolean;
  requiresFirstLoadingScreens: boolean;
  definesLoginEvent: boolean;
  appearsComplete: boolean;
  definedClasses: string[];
  requiresAvatarEventTipOfDay?: boolean;
  requiresAvatarEventSpecialEfect?: boolean;
  requiresAvatarEventSpecialEffect?: boolean;
  avatarEventConstants?: string[];
  deepScanPerformed?: boolean;
}

export interface PairResult {
  rank: number;
  score: number;
  classification: 'EXCELLENT' | 'LIKELY_COMPATIBLE' | 'POSSIBLE' | 'RISKY' | 'INCOMPATIBLE';
  loginFile: string;
  loginPath: string;
  loginSize: number;
  mainFile: string;
  mainPath: string;
  mainSize: number;
  loginGrFile?: string;
  loginGrPath?: string;
  loginGrSize?: number;
  mogoFile?: string;
  mogoPath?: string;
  mogoSize?: number;
  mogoLoginCompatible: boolean;
  loginExposesInit: boolean;
  loginLoginGrCompatible: boolean;
  mainLoginCompatible: boolean;
  mogoLoginStatus?: 'OK' | 'BLOCKED' | 'UNKNOWN';
  mogoExpectsLoginInitStatus?: 'YES' | 'NO' | 'UNKNOWN';
  positives: string[];
  risks: string[];
  recommendation: string;
  avatarEventCompatible?: boolean;
  missingAvatarEventConstants?: string[];
}

export interface SummaryStats {
  totalPairs: number;
  countExcellent: number;
  countLikelyCompatible: number;
  countPossible: number;
  countRisky: number;
  countIncompatible: number;
  countBlockedMogoLoginInitMissing: number;
  countBlockedMogoLoginInitUnknown: number;
  countBlockedLoginGrGetSwfParamsMissing: number;
  countBlockedLoginLoginGrLinkageMismatch: number;
  countBlockedFirstLoadingScreensMismatch: number;
  countBlockedLoginEventMissing: number;
  countLoginMainOkMogoLoginFailed: number;
  countLoginMainOkLoginLoginGrFailed: number;
  mogoCandidatesExpectInitYes?: number;
  mogoCandidatesExpectInitNo?: number;
  mogoCandidatesExpectInitUnknown?: number;
}

export interface CompatMatrixReport {
  mode?: 'matrix' | 'inspect-mogo';
  mogoInspection?: MogoFingerprint[];
  loginCandidatesCount: number;
  mainCandidatesCount: number;
  loginGrCandidatesCount?: number;
  mogoCandidatesCount?: number;
  totalPairsScored: number;
  topPairs: PairResult[];
  bestLoginForActiveMain: PairResult | null;
  bestMainForActiveLogin: PairResult | null;
  bestMogoForActiveSet?: PairResult | null;
  activeLoginFilename?: string;
  activeMainFilename?: string;
  activeLoginGrFilename?: string;
  activeMogoFilename?: string;
  assetsPath: string;
  loginGrDir?: string;
  mogoDir?: string;
  showCopyForIncompatible?: boolean;
  requireProvenStartup?: boolean;
  summaryStats?: SummaryStats;
}

const DEFAULT_FFDEC_PATH = 'C:\\PROJ\\sfs-emu\\SWF-decompiler-mcp\\ffdec_26.2.1\\ffdec-cli.exe';

function findFfdec(customPath?: string): string | undefined {
  if (customPath && fs.existsSync(customPath)) return customPath;
  if (process.env.JPEXS_PATH && fs.existsSync(process.env.JPEXS_PATH)) return process.env.JPEXS_PATH;
  if (fs.existsSync(DEFAULT_FFDEC_PATH)) return DEFAULT_FFDEC_PATH;
  
  try {
    const isWin = os.platform() === 'win32';
    const cmd = isWin ? 'where ffdec-cli.exe' : 'which ffdec-cli';
    const systemPath = child_process.execSync(cmd, { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
    if (fs.existsSync(systemPath)) return systemPath;
  } catch (e) {
    // Ignore
  }
  return undefined;
}

function getSwfBuffer(filePath: string, ffdecPath?: string): Buffer {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 8) return buffer;
  
  const signature = buffer.toString('utf8', 0, 3);
  if (signature === 'FWS') {
    return buffer;
  }
  if (signature === 'CWS') {
    try {
      const decompressed = zlib.inflateSync(buffer.slice(8));
      return Buffer.concat([buffer.slice(0, 8), decompressed]);
    } catch (err) {
      // Fallback
    }
  }
  
  const resolvedFfdec = findFfdec(ffdecPath);
  if (resolvedFfdec && fs.existsSync(resolvedFfdec)) {
    const tempFile = path.join(
      os.tmpdir(),
      `compat_matrix_temp_${Date.now()}_${Math.floor(Math.random() * 100000)}.swf`
    );
    try {
      child_process.execSync(`"${resolvedFfdec}" -decompress "${filePath}" "${tempFile}"`, { stdio: 'ignore' });
      if (fs.existsSync(tempFile)) {
        const decompressedBuffer = fs.readFileSync(tempFile);
        try { fs.unlinkSync(tempFile); } catch (e) {}
        return decompressedBuffer;
      }
    } catch (err) {
      // Ignore
    } finally {
      if (fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch (e) {}
      }
    }
  }
  
  return buffer;
}

function extractAppVer(filename: string, decompressedString: string): string | null {
  const fileMatch = filename.match(/_(Alph_[\d.]+)/);
  if (fileMatch) return fileMatch[1];
  
  const bufMatch = decompressedString.match(/Alph_\d+\.\d+\.\d+(\.\d+)?/);
  if (bufMatch) return bufMatch[0];
  
  return null;
}

function extractDateMarker(filename: string): string | null {
  const match = filename.match(/_(20\d{6})/);
  return match ? match[1] : null;
}

function parseDefinedClasses(output: string): string[] {
  const classes: string[] = [];
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^([\w.]+)\s+\d+$/);
    if (match) {
      classes.push(match[1]);
    }
  }
  return classes;
}

function getDefinedClassesViaFfdec(filePath: string, ffdecPath?: string): string[] {
  const resolvedFfdec = findFfdec(ffdecPath);
  if (!resolvedFfdec || !fs.existsSync(resolvedFfdec)) {
    return [];
  }
  try {
    const output = child_process.execSync(`"${resolvedFfdec}" -dumpAS3 "${filePath}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    return parseDefinedClasses(output);
  } catch (err) {
    return [];
  }
}

export function extractAbcStrings(swfBuffer: Buffer): string[] {
  const strings: string[] = [];
  if (swfBuffer.length < 8) return strings;
  
  let swfData = swfBuffer;
  const signature = swfBuffer.toString('utf8', 0, 3);
  if (signature === 'CWS') {
    try {
      const decompressed = zlib.inflateSync(swfBuffer.slice(8));
      swfData = Buffer.concat([swfBuffer.slice(0, 8), decompressed]);
    } catch (err) {
      // Ignore
    }
  }
  
  let pos = 8;
  if (pos >= swfData.length) return strings;
  const firstByte = swfData[pos];
  const nBits = firstByte >> 3;
  const totalBits = 5 + nBits * 4;
  const rectBytes = Math.ceil(totalBits / 8);
  pos += rectBytes;
  if (pos + 4 > swfData.length) return strings;
  pos += 4; // Skip frame rate + frame count
  
  while (pos < swfData.length) {
    if (pos + 2 > swfData.length) break;
    const tagCodeAndLength = swfData.readUInt16LE(pos);
    pos += 2;
    const type = tagCodeAndLength >> 6;
    let length = tagCodeAndLength & 0x3F;
    if (length === 0x3F) {
      if (pos + 4 > swfData.length) break;
      length = swfData.readUInt32LE(pos);
      pos += 4;
    }
    if (pos + length > swfData.length) break;
    
    if (type === 72 || type === 82) { // DoABC
      const tagData = swfData.slice(pos, pos + length);
      try {
        let abcPos = 4;
        while (abcPos < tagData.length && tagData[abcPos] !== 0) {
          abcPos++;
        }
        abcPos++; // skip null terminator
        
        const buf = tagData.slice(abcPos);
        let p = 0;
        
        function readU30(): number {
          let result = 0;
          let shift = 0;
          while (p < buf.length) {
            const b = buf[p++];
            result |= (b & 0x7f) << shift;
            if ((b & 0x80) === 0) break;
            shift += 7;
          }
          return result;
        }
        
        if (p + 4 <= buf.length) {
          p += 4; // skip minor + major version
          
          const intCount = readU30();
          for (let i = 0; i < intCount - 1; i++) readU30();
          
          const uintCount = readU30();
          for (let i = 0; i < uintCount - 1; i++) readU30();
          
          const doubleCount = readU30();
          if (doubleCount > 0 && p + (doubleCount - 1) * 8 <= buf.length) {
            p += (doubleCount - 1) * 8;
          }
          
          const stringCount = readU30();
          for (let i = 1; i < stringCount; i++) {
            const len = readU30();
            if (p + len <= buf.length) {
              const str = buf.toString('utf8', p, p + len);
              p += len;
              strings.push(str);
            }
          }
        }
      } catch (err) {
        // Ignore
      }
    }
    pos += length;
    if (type === 0) break;
  }
  return strings;
}

interface AbcInstance {
  name: string;
  ns: string;
  superName: string;
  superNs: string;
  traits: { name: string; kind: number; methodIndex: number }[];
}

function getDocumentClass(swfBuffer: Buffer): string | null {
  if (swfBuffer.length < 8) return null;
  
  let swfData = swfBuffer;
  const signature = swfBuffer.toString('utf8', 0, 3);
  if (signature === 'CWS') {
    try {
      const decompressed = zlib.inflateSync(swfBuffer.slice(8));
      swfData = Buffer.concat([swfBuffer.slice(0, 8), decompressed]);
    } catch (err) {
      // Ignore
    }
  }
  
  let pos = 8;
  if (pos >= swfData.length) return null;
  const firstByte = swfData[pos];
  const nBits = firstByte >> 3;
  const totalBits = 5 + nBits * 4;
  const rectBytes = Math.ceil(totalBits / 8);
  pos += rectBytes;
  if (pos + 4 > swfData.length) return null;
  pos += 4; // Skip frame rate + frame count
  
  while (pos < swfData.length) {
    if (pos + 2 > swfData.length) break;
    const tagCodeAndLength = swfData.readUInt16LE(pos);
    pos += 2;
    const type = tagCodeAndLength >> 6;
    let length = tagCodeAndLength & 0x3F;
    if (length === 0x3F) {
      if (pos + 4 > swfData.length) break;
      length = swfData.readUInt32LE(pos);
      pos += 4;
    }
    if (pos + length > swfData.length) break;
    
    if (type === 76) { // SymbolClass
      try {
        const tagData = swfData.slice(pos, pos + length);
        if (tagData.length >= 2) {
          const numSymbols = tagData.readUInt16LE(0);
          let offset = 2;
          for (let i = 0; i < numSymbols; i++) {
            if (offset + 2 > tagData.length) break;
            const tagId = tagData.readUInt16LE(offset);
            offset += 2;
            
            // Find null terminator for class name
            let nameEnd = offset;
            while (nameEnd < tagData.length && tagData[nameEnd] !== 0) {
              nameEnd++;
            }
            if (nameEnd >= tagData.length) break;
            
            const name = tagData.toString('utf8', offset, nameEnd);
            offset = nameEnd + 1; // skip null terminator
            
            if (tagId === 0) {
              return name;
            }
          }
        }
      } catch (err) {
        // Ignore
      }
    }
    
    pos += length;
    if (type === 0) break;
  }
  return null;
}

function parseAbc(tagData: Buffer): AbcInstance[] | null {
  let abcPos = 4;
  while (abcPos < tagData.length && tagData[abcPos] !== 0) abcPos++;
  abcPos++; // skip null terminator for name
  
  const buf = tagData.slice(abcPos);
  let p = 0;
  
  function readU30(): number {
    let result = 0;
    let shift = 0;
    while (p < buf.length) {
      const b = buf[p++];
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    return result;
  }
  
  if (p + 4 > buf.length) return null;
  p += 4; // skip minor + major version
  
  const intCount = readU30();
  for (let i = 1; i < intCount; i++) readU30();
  const uintCount = readU30();
  for (let i = 1; i < uintCount; i++) readU30();
  const doubleCount = readU30();
  if (doubleCount > 0) p += (doubleCount - 1) * 8;
  
  const stringCount = readU30();
  const strings: string[] = [''];
  for (let i = 1; i < stringCount; i++) {
    const len = readU30();
    if (p + len > buf.length) return null;
    const str = buf.toString('utf8', p, p + len);
    p += len;
    strings.push(str);
  }
  
  const nsCount = readU30();
  const namespaces: ({ kind: number; name: string } | null)[] = [null];
  for (let i = 1; i < nsCount; i++) {
    if (p >= buf.length) return null;
    const kind = buf[p++];
    const nameIndex = readU30();
    namespaces.push({ kind, name: strings[nameIndex] || '' });
  }
  
  const nsSetCount = readU30();
  for (let i = 1; i < nsSetCount; i++) {
    const count = readU30();
    for (let j = 0; j < count; j++) readU30();
  }
  
  const multinameCount = readU30();
  const multinames: ({ kind: number; name: string; ns: string } | null)[] = [null];
  for (let i = 1; i < multinameCount; i++) {
    if (p >= buf.length) return null;
    const kind = buf[p++];
    if (kind === 0x07 || kind === 0x0D) {
      const ns = readU30();
      const nameIdx = readU30();
      const nsObj = namespaces[ns];
      multinames.push({ kind, name: strings[nameIdx] || '', ns: nsObj ? nsObj.name : '' });
    } else if (kind === 0x0F || kind === 0x10) {
      const nameIdx = readU30();
      multinames.push({ kind, name: strings[nameIdx] || '', ns: '' });
    } else if (kind === 0x11 || kind === 0x12) {
      multinames.push({ kind, name: '', ns: '' });
    } else if (kind === 0x09 || kind === 0x0E) {
      const nameIdx = readU30();
      const ns = readU30();
      multinames.push({ kind, name: strings[nameIdx] || '', ns: '' });
    } else if (kind === 0x1B || kind === 0x1C) {
      const ns = readU30();
      multinames.push({ kind, name: '', ns: '' });
    } else if (kind === 0x1D) {
      const name = readU30();
      const pc = readU30();
      for (let j = 0; j < pc; j++) readU30();
      const baseMultiname = multinames[name];
      multinames.push({ kind, name: baseMultiname ? baseMultiname.name : '', ns: baseMultiname ? baseMultiname.ns : '' });
    } else {
      multinames.push({ kind, name: '', ns: '' });
    }
  }
  
  // Methods
  const methodCount = readU30();
  for (let i = 0; i < methodCount; i++) {
    const pc = readU30();
    readU30();
    for (let j = 0; j < pc; j++) readU30();
    readU30();
    if (p >= buf.length) return null;
    const flags = buf[p++];
    if (flags & 0x08) {
      const oc = readU30();
      for (let j = 0; j < oc; j++) { readU30(); p++; }
    }
    if (flags & 0x80) {
      for (let j = 0; j < pc; j++) readU30();
    }
  }
  
  // Metadata
  const metadataCount = readU30();
  for (let i = 0; i < metadataCount; i++) {
    readU30();
    const itemCount = readU30();
    for (let j = 0; j < itemCount; j++) {
      readU30();
      readU30();
    }
  }
  
  // Instances
  const instanceCount = readU30();
  const instances: AbcInstance[] = [];
  for (let i = 0; i < instanceCount; i++) {
    const nameIndex = readU30();
    const superIndex = readU30();
    if (p >= buf.length) return null;
    const flags = buf[p++];
    if (flags & 0x08) readU30();
    const ic = readU30();
    for (let j = 0; j < ic; j++) readU30();
    readU30();
    
    const traitCount = readU30();
    const traits: { name: string; kind: number; methodIndex: number }[] = [];
    for (let j = 0; j < traitCount; j++) {
      const traitNameIdx = readU30();
      if (p >= buf.length) return null;
      const kind = buf[p++];
      const traitKind = kind & 0x0F;
      const traitAttrs = kind >> 4;
      
      let dispId = 0, methodIdx = 0, slotId = 0, typeNameIdx = 0, vindex = 0, vkind = 0, classi = 0, funcIdx = 0;
      if (traitKind === 0 || traitKind === 6) {
        slotId = readU30();
        typeNameIdx = readU30();
        vindex = readU30();
        if (vindex !== 0) {
          if (p >= buf.length) return null;
          vkind = buf[p++];
        }
      } else if (traitKind === 1 || traitKind === 2 || traitKind === 3) {
        dispId = readU30();
        methodIdx = readU30();
      } else if (traitKind === 4) {
        slotId = readU30();
        classi = readU30();
      } else if (traitKind === 5) {
        slotId = readU30();
        funcIdx = readU30();
      }
      
      if (traitAttrs & 0x04) {
        const metaCount = readU30();
        for (let k = 0; k < metaCount; k++) readU30();
      }
      
      const traitName = multinames[traitNameIdx] ? multinames[traitNameIdx]!.name : '';
      traits.push({ name: traitName, kind: traitKind, methodIndex: methodIdx });
    }
    
    const className = multinames[nameIndex] ? multinames[nameIndex]!.name : '';
    const classNs = multinames[nameIndex] ? multinames[nameIndex]!.ns : '';
    const superName = multinames[superIndex] ? multinames[superIndex]!.name : '';
    const superNs = multinames[superIndex] ? multinames[superIndex]!.ns : '';
    instances.push({ name: className, ns: classNs, superName, superNs, traits });
  }
  
  return instances;
}

function checkAbcInit(swfBuffer: Buffer, docClass: string): boolean {
  let pos = 8;
  if (pos >= swfBuffer.length) return false;
  const firstByte = swfBuffer[pos];
  const nBits = firstByte >> 3;
  const totalBits = 5 + nBits * 4;
  const rectBytes = Math.ceil(totalBits / 8);
  pos += rectBytes;
  if (pos + 4 > swfBuffer.length) return false;
  pos += 4; // Skip frame rate + frame count
  
  const allInstances: AbcInstance[] = [];
  
  while (pos < swfBuffer.length) {
    if (pos + 2 > swfBuffer.length) break;
    const tagCodeAndLength = swfBuffer.readUInt16LE(pos);
    pos += 2;
    const type = tagCodeAndLength >> 6;
    let length = tagCodeAndLength & 0x3F;
    if (length === 0x3F) {
      if (pos + 4 > swfBuffer.length) break;
      length = swfBuffer.readUInt32LE(pos);
      pos += 4;
    }
    if (pos + length > swfBuffer.length) break;
    
    if (type === 72 || type === 82) { // DoABC
      try {
        const tagData = swfBuffer.slice(pos, pos + length);
        const insts = parseAbc(tagData);
        if (insts) {
          allInstances.push(...insts);
        }
      } catch (err) {
        // Ignore
      }
    }
    
    pos += length;
    if (type === 0) break;
  }
  
  // Recursively search the inheritance chain starting with the document class
  let current = allInstances.find(inst => inst.name === docClass);
  while (current) {
    const hasInit = current.traits.some(t => t.name === 'init' && (t.kind === 1 || t.kind === 2));
    if (hasInit) {
      return true;
    }
    const superName = current.superName;
    if (superName) {
      current = allInstances.find(inst => inst.name === superName);
    } else {
      break;
    }
  }
  
  return false;
}

function getDefinedClassesFromAbc(swfBuffer: Buffer): string[] {
  let pos = 8;
  if (pos >= swfBuffer.length) return [];
  const firstByte = swfBuffer[pos];
  const nBits = firstByte >> 3;
  const totalBits = 5 + nBits * 4;
  const rectBytes = Math.ceil(totalBits / 8);
  pos += rectBytes;
  if (pos + 4 > swfBuffer.length) return [];
  pos += 4; // Skip frame rate + frame count
  
  const classes: string[] = [];
  
  while (pos < swfBuffer.length) {
    if (pos + 2 > swfBuffer.length) break;
    const tagCodeAndLength = swfBuffer.readUInt16LE(pos);
    pos += 2;
    const type = tagCodeAndLength >> 6;
    let length = tagCodeAndLength & 0x3F;
    if (length === 0x3F) {
      if (pos + 4 > swfBuffer.length) break;
      length = swfBuffer.readUInt32LE(pos);
      pos += 4;
    }
    if (pos + length > swfBuffer.length) break;
    
    if (type === 72 || type === 82) { // DoABC
      try {
        const tagData = swfBuffer.slice(pos, pos + length);
        const insts = parseAbc(tagData);
        if (insts) {
          for (const inst of insts) {
            if (inst.name) {
              const fullName = inst.ns ? `${inst.ns}.${inst.name}` : inst.name;
              classes.push(fullName);
            }
          }
        }
      } catch (err) {
        // Ignore
      }
    }
    
    pos += length;
    if (type === 0) break;
  }
  return classes;
}

export function checkInitInDumpAS3(dumpText: string): { definesLoginClass: boolean, exposesInitMethod: boolean } {
  const classRegex = /(?:class|interface)\s+([\w.]+)?Login\b/i;
  const match = dumpText.match(classRegex);
  if (!match) {
    return { definesLoginClass: false, exposesInitMethod: false };
  }
  
  const classIndex = match.index!;
  const rest = dumpText.slice(classIndex);
  const nextClassMatch = rest.slice(1).match(/(?:class|interface)\s+[\w.]+/i);
  const classBody = nextClassMatch ? rest.slice(0, nextClassMatch.index! + 1) : rest;
  
  const initRegex = /\bfunction\s+init\b/i;
  const exposesInitMethod = initRegex.test(classBody);
  
  return {
    definesLoginClass: true,
    exposesInitMethod
  };
}

function extractMethodBody(code: string, methodName: string): string | null {
  const methodIndex = code.search(new RegExp(`\\bfunction\\s+${methodName}\\b`));
  if (methodIndex === -1) return null;
  const startBraceIdx = code.indexOf('{', methodIndex);
  if (startBraceIdx === -1) return null;
  
  let braceCount = 1;
  let i = startBraceIdx + 1;
  while (i < code.length && braceCount > 0) {
    if (code[i] === '{') braceCount++;
    else if (code[i] === '}') braceCount--;
    i++;
  }
  if (braceCount === 0) {
    return code.substring(startBraceIdx, i);
  }
  return null;
}

export function checkHasDoAbc(swfBuffer: Buffer): boolean {
  if (swfBuffer.length < 8) return false;
  
  let swfData = swfBuffer;
  const signature = swfBuffer.toString('utf8', 0, 3);
  if (signature === 'CWS') {
    try {
      const decompressed = zlib.inflateSync(swfBuffer.slice(8));
      swfData = Buffer.concat([swfBuffer.slice(0, 8), decompressed]);
    } catch (err) {
      // Ignore
    }
  }
  
  let pos = 8;
  if (pos >= swfData.length) return false;
  const firstByte = swfData[pos];
  const nBits = firstByte >> 3;
  const totalBits = 5 + nBits * 4;
  const rectBytes = Math.ceil(totalBits / 8);
  pos += rectBytes;
  if (pos + 4 > swfData.length) return false;
  pos += 4; // Skip frame rate + frame count
  
  while (pos < swfData.length) {
    if (pos + 2 > swfData.length) break;
    const tagCodeAndLength = swfData.readUInt16LE(pos);
    pos += 2;
    const type = tagCodeAndLength >> 6;
    let length = tagCodeAndLength & 0x3F;
    if (length === 0x3F) {
      if (pos + 4 > swfData.length) break;
      length = swfData.readUInt32LE(pos);
      pos += 4;
    }
    if (pos + length > swfData.length) break;
    
    if (type === 72 || type === 82) { // DoABC
      return true;
    }
    pos += length;
    if (type === 0) break;
  }
  return false;
}

function findAsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...findAsFiles(fullPath));
    } else if (file.toLowerCase().endsWith('.as')) {
      results.push(fullPath);
    }
  }
  return results;
}

export function buildMogoFingerprint(
  filePath: string,
  ffdecPath?: string,
  deep = false
): MogoFingerprint {
  const stats = fs.statSync(filePath);
  const size = stats.size;
  const rawBytes = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(rawBytes).digest('hex');
  
  const decompressed = getSwfBuffer(filePath, ffdecPath);
  const filename = path.basename(filePath);
  
  const hasDoAbc = checkHasDoAbc(decompressed);
  const asVersion: 'AS1/AS2' | 'AS3' = hasDoAbc ? 'AS3' : 'AS1/AS2';
  const isAS3 = hasDoAbc;
  
  const docClass = getDocumentClass(decompressed);
  const decompStr = decompressed.toString('utf8');
  const appVer = extractAppVer(filename, decompStr);
  const hasOnCompleteHandler = decompStr.includes('onCompleteHandler');
  const loginLoadDetected = decompStr.toLowerCase().includes('login.swf');
  
  const abcStrings = isAS3 ? extractAbcStrings(decompressed) : [];
  
  let loadsLoginStatus: 'YES' | 'NO' | 'UNKNOWN' = loginLoadDetected ? 'YES' : 'NO';
  let callsLoginInitStatus: 'YES' | 'NO' | 'UNKNOWN' = 'UNKNOWN';
  let evidenceLine: string | null = null;
  
  if (loadsLoginStatus === 'NO') {
    callsLoginInitStatus = 'NO';
  } else if (isAS3) {
    if (!abcStrings.includes('init')) {
      callsLoginInitStatus = 'NO';
    } else {
      callsLoginInitStatus = 'UNKNOWN';
    }
  } else {
    callsLoginInitStatus = 'UNKNOWN';
  }
  
  const resolvedFfdec = findFfdec(ffdecPath);
  if (deep && resolvedFfdec && fs.existsSync(resolvedFfdec)) {
    const tempDir = path.join(
      os.tmpdir(),
      `compat_matrix_mogo_decompile_${Date.now()}_${Math.floor(Math.random() * 100000)}`
    );
    try {
      fs.mkdirSync(tempDir, { recursive: true });
      child_process.execSync(`"${resolvedFfdec}" -export script "${tempDir}" "${filePath}"`, { stdio: 'ignore' });
      
      const asFiles = findAsFiles(tempDir);
      if (asFiles.length > 0) {
        let foundLoadsLogin = false;
        let foundCallsInit = false;
        let foundLoadsLoginLine = '';
        let foundCallsInitLine = '';
        
        for (const asFile of asFiles) {
          const content = fs.readFileSync(asFile, 'utf8');
          const lines = content.split(/\r?\n/);
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            
            // Check loading pattern
            const isLoaderLine = /login\.swf/i.test(trimmed) || 
                                 /\bloadMovie\b/i.test(trimmed) || 
                                 /\bMovieClipLoader\b/i.test(trimmed) || 
                                 /\.load\s*\(\s*new\s+URLRequest\b/i.test(trimmed);
            if (isLoaderLine && !foundLoadsLogin) {
              foundLoadsLogin = true;
              foundLoadsLoginLine = trimmed;
            }
            
            // Check init calling pattern
            const isInitCall = /\.init\s*\(/i.test(trimmed) || 
                               /["']init["']\s+in\b/i.test(trimmed) || 
                               (/\binit\s*\(/i.test(trimmed) && !/\bfunction\s+init\b/i.test(trimmed) && !/\bfunction\s+\w+\.init\b/i.test(trimmed));
            if (isInitCall && !foundCallsInit) {
              foundCallsInit = true;
              foundCallsInitLine = trimmed;
            }
          }
        }
        
        if (foundLoadsLogin) {
          loadsLoginStatus = 'YES';
        } else {
          if (loadsLoginStatus !== 'YES') {
            loadsLoginStatus = 'NO';
          }
        }
        
        if (loadsLoginStatus === 'NO') {
          callsLoginInitStatus = 'NO';
        } else {
          callsLoginInitStatus = foundCallsInit ? 'YES' : 'NO';
          evidenceLine = foundCallsInit ? foundCallsInitLine : (foundLoadsLogin ? foundLoadsLoginLine : null);
        }
      }
    } catch (e) {
      // Ignore
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (err) {}
    }
  }
  
  const expectsLoginInit = callsLoginInitStatus === 'YES';
  
  return {
    path: filePath,
    filename,
    size,
    sha256,
    expectsLoginInit,
    loginLoadDetected,
    docClass,
    appVer,
    isAS3,
    hasOnCompleteHandler,
    expectsLoginInitStatus: callsLoginInitStatus,
    asVersion,
    loadsLoginStatus,
    callsLoginInitStatus,
    evidenceLine,
    deepScanPerformed: deep
  };
}

export function buildLoginGrFingerprint(filePath: string, ffdecPath?: string): LoginGrFingerprint {
  const stats = fs.statSync(filePath);
  const size = stats.size;
  const rawBytes = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(rawBytes).digest('hex');
  
  const decompressed = getSwfBuffer(filePath, ffdecPath);
  const decompStr = decompressed.toString('utf8');
  
  const definedClasses = getDefinedClassesFromAbc(decompressed);
  
  const hasGlobalMlLoginScreen = definedClasses.some(c => c === 'mlLoginScreen' || c.endsWith('.mlLoginScreen'));
  const hasMlLoginScreenHeb = definedClasses.some(c => c === 'mlLoginScreenHeb' || c.endsWith('.mlLoginScreenHeb'));
  const hasMlLoginMultiUsers = definedClasses.some(c => c === 'mlLoginMultiUsers' || c.endsWith('.mlLoginMultiUsers'));
  const hasMlAvatarBig = definedClasses.some(c => c === 'mlAvatarBig' || c.endsWith('.mlAvatarBig'));
  
  const hasGetSwfParams = decompStr.includes('getSwfParams');
  const hasRequiredLoginChildren = decompStr.includes('txtUserName') && decompStr.includes('txtPassword') && decompStr.includes('btnLogin');
  const hasNamespacedMlLoginScreen = decompStr.includes('mogoTab');
  
  return {
    path: filePath,
    filename: path.basename(filePath),
    size,
    sha256,
    hasGlobalMlLoginScreen,
    hasMlLoginScreenHeb,
    hasMlLoginMultiUsers,
    hasMlAvatarBig,
    hasGetSwfParams,
    hasRequiredLoginChildren,
    hasNamespacedMlLoginScreen
  };
}

function findAsFile(dir: string, name: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (!stat.isDirectory() && file === name) {
      return fullPath;
    }
  }
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const found = findAsFile(fullPath, name);
      if (found) return found;
    }
  }
  return null;
}

export function buildLoginFingerprint(
  filePath: string,
  ffdecPath?: string,
  deep = false,
  initDetectionUnreliable = false
): LoginFingerprint {
  const stats = fs.statSync(filePath);
  const size = stats.size;
  
  const rawBytes = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(rawBytes).digest('hex');
  
  const decompressed = getSwfBuffer(filePath, ffdecPath);
  const decompStr = decompressed.toString('utf8');
  
  const filename = path.basename(filePath);
  const appVer = extractAppVer(filename, decompStr);
  const dateMarker = extractDateMarker(filename);
  
  const abcStrings = extractAbcStrings(decompressed);
  
  const docClass = getDocumentClass(decompressed);
  let definesLoginClass = docClass !== null;
  let exposesInitMethod = false;
  let onAddedOrEddedDetected = abcStrings.includes('onAdded') || abcStrings.includes('onEdded');
  let referencesStartMainApp = abcStrings.includes('startMainApp');
  
  const baseloginFlowDetected = abcStrings.includes('BaseLoginGR') || abcStrings.includes('baselogin') || decompStr.includes('BaseLoginGR') || decompStr.includes('baselogin');
  
  const resolvedFfdec = findFfdec(ffdecPath);
  if (deep && resolvedFfdec && fs.existsSync(resolvedFfdec)) {
    const tempDir = path.join(
      os.tmpdir(),
      `compat_matrix_decompile_${Date.now()}_${Math.floor(Math.random() * 100000)}`
    );
    try {
      fs.mkdirSync(tempDir, { recursive: true });
      const targetClass = docClass || 'Login';
      child_process.execSync(`"${resolvedFfdec}" -selectclass ${targetClass} -export script "${tempDir}" "${filePath}"`, { stdio: 'ignore' });
      
      const loginAsPath = findAsFile(tempDir, `${targetClass}.as`);
      if (loginAsPath && fs.existsSync(loginAsPath)) {
        const content = fs.readFileSync(loginAsPath, 'utf8');
        definesLoginClass = true;
        exposesInitMethod = /\bpublic\s+(?:override\s+)?function\s+init\b/.test(content) || /\boverride\s+public\s+function\s+init\b/.test(content);
        onAddedOrEddedDetected = content.includes('onAdded') || content.includes('onEdded');
        referencesStartMainApp = content.includes('startMainApp');
      } else {
        definesLoginClass = false;
        exposesInitMethod = false;
      }
    } catch (e) {
      // Ignore
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (err) {}
    }
  } else {
    // Fast scan verification
    if (docClass) {
      exposesInitMethod = checkAbcInit(decompressed, docClass);
    }
  }

  let exposesInitMethodStatus: 'OK' | 'BLOCKED' | 'UNKNOWN' = 'UNKNOWN';
  if (deep && resolvedFfdec && fs.existsSync(resolvedFfdec)) {
    if (definesLoginClass) {
      exposesInitMethodStatus = exposesInitMethod ? 'OK' : 'BLOCKED';
    } else {
      exposesInitMethodStatus = 'UNKNOWN';
    }
  } else {
    if (docClass === null) {
      exposesInitMethodStatus = 'UNKNOWN';
    } else {
      if (exposesInitMethod) {
        exposesInitMethodStatus = 'OK';
      } else {
        if (baseloginFlowDetected) {
          exposesInitMethodStatus = 'BLOCKED';
        } else {
          exposesInitMethodStatus = 'UNKNOWN';
        }
      }
    }
  }
  
  const definedClasses = deep ? getDefinedClassesViaFfdec(filePath, ffdecPath) : getDefinedClassesFromAbc(decompressed);
  if (docClass && !definedClasses.includes(docClass)) {
    definedClasses.push(docClass);
  }
  if (!definesLoginClass && definedClasses.some(c => c === 'Login' || c.endsWith('.Login'))) {
    definesLoginClass = true;
  }
  
  const referencesFirstLoadingScreens = abcStrings.includes('FirstLoadingScreens') || decompStr.includes('FirstLoadingScreens');
  const referencesLoadingScreenTO = abcStrings.includes('LoadingScreenTO') || decompStr.includes('LoadingScreenTO');
  const referencesXmlToList = abcStrings.includes('XmlToList') || decompStr.includes('XmlToList');
  const referencesLoadingScreens = abcStrings.includes('LoadingScreens') || decompStr.includes('LoadingScreens');
  const referencesMainSwf = filename.toLowerCase() === 'login.swf' ? (abcStrings.some(s => s.toLowerCase().includes('main.swf')) || decompStr.toLowerCase().includes('main.swf')) : true;
  const referencesGetSwfParams = abcStrings.includes('getSwfParams') || decompStr.includes('getSwfParams');
  const referencesLoginEvent = abcStrings.includes('LoginEvent') || decompStr.includes('LoginEvent');
  
  const requiresGetSwfParams = referencesGetSwfParams;
  const requiresMlLoginScreen = abcStrings.includes('mlLoginScreen') || decompStr.includes('mlLoginScreen');
  const requiresMlLoginScreenHeb = abcStrings.includes('mlLoginScreenHeb') || decompStr.includes('mlLoginScreenHeb');
  const requiresMlLoginMultiUsers = abcStrings.includes('mlLoginMultiUsers') || decompStr.includes('mlLoginMultiUsers');
  const providesFirstLoadingScreens = referencesFirstLoadingScreens && (referencesLoadingScreenTO || referencesXmlToList);
  
  const usesModernServerList = abcStrings.includes('Servers.aspx') || abcStrings.includes('serverListData') || abcStrings.includes('choseFirstServer') || decompStr.includes('Servers.aspx') || decompStr.includes('serverListData') || decompStr.includes('choseFirstServer');
  const extCalls = (decompStr.match(/ExternalInterface/g) || []).length;

  const providesAvatarEventTipOfDay = abcStrings.includes('TIP_OF_DAY');
  const avatarEventConstants = KNOWN_AVATAR_EVENT_CONSTANTS.filter(c => abcStrings.includes(c));
  
  return {
    path: filePath,
    filename,
    size,
    sha256,
    appVer,
    dateMarker,
    definesLoginClass,
    exposesInitMethod,
    exposesInitMethodStatus,
    onAddedOrEddedDetected,
    baseloginFlowDetected,
    requiresGetSwfParams,
    requiresMlLoginScreen,
    requiresMlLoginScreenHeb,
    requiresMlLoginMultiUsers,
    providesFirstLoadingScreens,
    externalInterfaceCount: extCalls,
    definedClasses,
    
    referencesFirstLoadingScreens,
    referencesLoadingScreenTO,
    referencesXmlToList,
    referencesLoadingScreens,
    referencesMainSwf,
    referencesStartMainApp,
    referencesGetSwfParams,
    referencesLoginEvent,
    usesModernServerList,
    deepScanPerformed: deep,
    providesAvatarEventTipOfDay,
    avatarEventConstants
  };
}

export function buildMainFingerprint(filePath: string, ffdecPath?: string, deep = false): MainFingerprint {
  const stats = fs.statSync(filePath);
  const size = stats.size;
  
  const rawBytes = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(rawBytes).digest('hex');
  
  const decompressed = getSwfBuffer(filePath, ffdecPath);
  const decompStr = decompressed.toString('utf8');
  
  const filename = path.basename(filePath);
  const appVer = extractAppVer(filename, decompStr);
  const dateMarker = extractDateMarker(filename);
  
  const definedClasses = getDefinedClassesFromAbc(decompressed);
  
  const definesMain = definedClasses.some(c => c === 'Main' || c.endsWith('.Main'));
  const definesRequestHandler = definedClasses.some(c => c.endsWith('.RequestHandler'));
  const definesSmartConector = definedClasses.some(c => c.endsWith('.SmartConector'));
  const definesScreenManager = definedClasses.some(c => c.endsWith('.ScreenManager'));
  const definesLoadingScreenManager = definedClasses.some(c => c.endsWith('.LoadingScreenManager'));
  
  const referencesLoadingScreenTO = decompStr.includes('LoadingScreenTO');
  const referencesFirstLoadingScreens = decompStr.includes('FirstLoadingScreens');
  const referencesLoadingScreens = decompStr.includes('LoadingScreens');
  const referencesLoginEvent = decompStr.includes('LoginEvent');
  const referencesBlueBox = decompStr.includes('bluebox.do');
  const referencesVerChk = decompStr.includes('verChk');
  
  const requiresFirstLoadingScreens = referencesFirstLoadingScreens && referencesLoadingScreenTO;
  const definesLoginEvent = definedClasses.some(c => c.endsWith('.LoginEvent'));
  
  const appearsComplete = definesMain && definesRequestHandler && definesSmartConector && definesScreenManager;

  const abcStrings = extractAbcStrings(decompressed);
  let requiresAvatarEventTipOfDay = abcStrings.includes('TIP_OF_DAY') || decompStr.includes('TIP_OF_DAY');
  let requiresAvatarEventSpecialEfect = abcStrings.includes('SPECIALEFECT') || decompStr.includes('SPECIALEFECT');
  let requiresAvatarEventSpecialEffect = abcStrings.includes('SPECIALEFFECT') || decompStr.includes('SPECIALEFFECT');

  const resolvedFfdec = findFfdec(ffdecPath);
  if (deep && resolvedFfdec && fs.existsSync(resolvedFfdec)) {
    const tempDir = path.join(
      os.tmpdir(),
      `compat_matrix_main_decompile_${Date.now()}_${Math.floor(Math.random() * 100000)}`
    );
    try {
      fs.mkdirSync(tempDir, { recursive: true });
      child_process.execSync(`"${resolvedFfdec}" -selectclass worlds4u.control.MainControler -export script "${tempDir}" "${filePath}"`, { stdio: 'ignore' });
      
      const mcPath = findAsFile(tempDir, 'MainControler.as');
      if (mcPath && fs.existsSync(mcPath)) {
        const content = fs.readFileSync(mcPath, 'utf8');
        const enableEventsBody = extractMethodBody(content, 'enableEvents');
        if (enableEventsBody) {
          requiresAvatarEventTipOfDay = enableEventsBody.includes('TIP_OF_DAY');
          requiresAvatarEventSpecialEfect = enableEventsBody.includes('SPECIALEFECT');
          requiresAvatarEventSpecialEffect = enableEventsBody.includes('SPECIALEFFECT');
        } else {
          requiresAvatarEventTipOfDay = content.includes('TIP_OF_DAY');
          requiresAvatarEventSpecialEfect = content.includes('SPECIALEFECT');
          requiresAvatarEventSpecialEffect = content.includes('SPECIALEFFECT');
        }
      }
    } catch (e) {
      // Ignore
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (err) {}
    }
  }

  const avatarEventConstants = KNOWN_AVATAR_EVENT_CONSTANTS.filter(c => abcStrings.includes(c));
  
  return {
    path: filePath,
    filename,
    size,
    sha256,
    appVer,
    dateMarker,
    definesMain,
    definesRequestHandler,
    definesSmartConector,
    definesScreenManager,
    definesLoadingScreenManager,
    referencesLoadingScreenTO,
    referencesFirstLoadingScreens,
    referencesLoadingScreens,
    referencesLoginEvent,
    referencesBlueBox,
    referencesVerChk,
    requiresFirstLoadingScreens,
    definesLoginEvent,
    appearsComplete,
    definedClasses,
    requiresAvatarEventTipOfDay,
    requiresAvatarEventSpecialEfect,
    requiresAvatarEventSpecialEffect,
    avatarEventConstants,
    deepScanPerformed: deep
  };
}

export function scorePair(
  login: LoginFingerprint,
  main: MainFingerprint,
  mogo: MogoFingerprint,
  loginGr: LoginGrFingerprint,
  strictMode = false
): {
  score: number;
  positives: string[];
  risks: string[];
  mogoLoginCompatible: boolean;
  loginExposesInit: boolean;
  loginLoginGrCompatible: boolean;
  mainLoginCompatible: boolean;
  mogoLoginStatus: 'OK' | 'BLOCKED' | 'UNKNOWN';
  avatarEventCompatible: boolean;
  missingAvatarEventConstants: string[];
} {
  let score = 100;
  const positives: string[] = [];
  const risks: string[] = [];

  let mogoLoginStatus: 'OK' | 'BLOCKED' | 'UNKNOWN' = 'OK';
  const mogoExpects = mogo.expectsLoginInitStatus || (mogo.expectsLoginInit ? 'YES' : 'NO');
  if (mogoExpects === 'YES') {
    mogoLoginStatus = login.exposesInitMethodStatus || 'UNKNOWN';
  } else if (mogoExpects === 'UNKNOWN') {
    mogoLoginStatus = 'UNKNOWN';
  } else {
    mogoLoginStatus = 'OK';
  }

  const mogoLoginCompatible = mogoLoginStatus !== 'BLOCKED';
  const loginExposesInit = login.exposesInitMethod;
  const loginLoginGrCompatible = !(login.requiresGetSwfParams && !loginGr.hasGetSwfParams);
  const mainLoginCompatible = !(main.requiresFirstLoadingScreens && !login.providesFirstLoadingScreens);

  // 1. Mogo/Login Scoring:
  if (mogoLoginStatus === 'BLOCKED') {
    score -= 60;
    risks.push('Mogo.swf expects Login.init(), but Login candidate does not expose init().');
  } else if (mogoLoginStatus === 'UNKNOWN') {
    score -= 10;
    risks.push('Mogo expects Login.init(), but Login init detection is uncertain (-10).');
  } else if (mogoExpects === 'YES' && mogoLoginStatus === 'OK') {
    score += 10;
    positives.push('Mogo/Login contract is satisfied (+10)');
  }
  
  if (mogo.loginLoadDetected && !login.definesLoginClass) {
    score -= 25;
    risks.push('Login candidate does not appear to define Login class, but Mogo expects to load it (-25)');
  }
  
  if (login.baseloginFlowDetected) {
    score -= 15;
    risks.push('Login candidate uses baselogin flow, active server fallbacks are not known compatible (-15)');
  }

  // 2. Login/loginGR Scoring:
  if (login.requiresGetSwfParams && !loginGr.hasGetSwfParams) {
    score -= 40;
    risks.push('Login.swf expects loginGR.getSwfParams(), but active loginGR.swf does not provide it.');
  }
  
  if (login.requiresMlLoginScreenHeb && !loginGr.hasMlLoginScreenHeb) {
    score -= 35;
    risks.push('Login requires mlLoginScreenHeb, but active loginGR.swf does not define it (-35)');
  }
  
  if (login.requiresMlLoginMultiUsers && !loginGr.hasMlLoginMultiUsers) {
    score -= 25;
    risks.push('Login requires mlLoginMultiUsers, but active loginGR.swf does not define it (-25)');
  }
  
  if (login.requiresMlLoginScreen && !loginGr.hasGlobalMlLoginScreen && loginGr.hasNamespacedMlLoginScreen) {
    score -= 25;
    risks.push('Login requires global mlLoginScreen, but active loginGR only has namespaced mogoTab:mlLoginScreen (-25)');
  } else if (login.requiresMlLoginScreen && !loginGr.hasGlobalMlLoginScreen && !loginGr.hasNamespacedMlLoginScreen) {
    score -= 20;
    risks.push('Active loginGR lacks mlLoginScreen needed by Login (-20)');
  }
  
  if (login.requiresMlLoginScreen && !loginGr.hasRequiredLoginChildren) {
    score -= 20;
    risks.push('Active loginGR lacks required login screen children needed by Login (-20)');
  }
  
  if (!login.requiresGetSwfParams && !loginGr.hasGetSwfParams) {
    score += 10;
    positives.push('Login does not require getSwfParams and active loginGR lacks it (+10)');
  }
  
  if (login.requiresMlLoginScreenHeb && loginGr.hasMlLoginScreenHeb) {
    score += 10;
    positives.push('Login requires mlLoginScreenHeb and active loginGR provides it (+10)');
  }
  
  if (login.requiresGetSwfParams && loginGr.hasGetSwfParams) {
    score += 10;
    positives.push('Login requires getSwfParams and active loginGR provides it (+10)');
  }

  if (loginLoginGrCompatible) {
    score += 10;
    positives.push('Login/loginGR contract is satisfied (+10)');
  }

  // 3. Login/Main Scoring:
  if (main.requiresFirstLoadingScreens && !login.providesFirstLoadingScreens) {
    score -= 40;
    risks.push('Main requires FirstLoadingScreens but Login does not provide it (-40)');
  } else if (login.providesFirstLoadingScreens && main.requiresFirstLoadingScreens) {
    score += 15;
    positives.push('Login provides and Main requires FirstLoadingScreens (+15)');
  }
  
  const eitherDefinesLoginEvent = login.definedClasses.some(c => c.endsWith('.LoginEvent')) || main.definesLoginEvent;
  if (main.referencesLoginEvent && !eitherDefinesLoginEvent) {
    score -= 35;
    risks.push('Main references LoginEvent but neither SWF defines it (-35)');
  } else if (main.definesLoginEvent || !main.referencesLoginEvent) {
    score += 15;
    positives.push('Main defines LoginEvent or doesn\'t require it (+15)');
  }
  
  const missingCore = [];
  if (!main.definesMain) missingCore.push('Main');
  if (!main.definesRequestHandler) missingCore.push('RequestHandler');
  if (!main.definesSmartConector) missingCore.push('SmartConector');
  if (!main.definesScreenManager) missingCore.push('ScreenManager');
  
  if (missingCore.length > 0) {
    score -= 20;
    risks.push(`Main is missing core classes: ${missingCore.join(', ')} (-20)`);
  }
  
  if (login.appVer && main.appVer && login.appVer !== main.appVer) {
    score -= 15;
    risks.push(`appVer mismatch: Login is ${login.appVer}, Main is ${main.appVer} (-15)`);
  } else if (login.appVer && main.appVer && login.appVer === main.appVer) {
    score += 10;
    positives.push(`appVer matches: ${login.appVer} (+10)`);
  }

  // 3.5 AvatarEvent Constants Validation:
  const mainRequiresTipOfDay = main.requiresAvatarEventTipOfDay || false;
  const loginProvidesTipOfDay = login.providesAvatarEventTipOfDay || false;

  let avatarEventCompatible = true;
  const missingAvatarEventConstants: string[] = [];

  if (mainRequiresTipOfDay && !loginProvidesTipOfDay) {
    avatarEventCompatible = false;
    score -= 60;
    risks.push("Main.swf requires AvatarEvent.TIP_OF_DAY but Login.swf's shared AvatarEvent does not provide it.");
    missingAvatarEventConstants.push('TIP_OF_DAY');
  } else if (mainRequiresTipOfDay && loginProvidesTipOfDay) {
    score += 10;
    positives.push('Login provides AvatarEvent.TIP_OF_DAY required by Main (+10)');
  }

  const mainHasEfect = main.avatarEventConstants && main.avatarEventConstants.includes('SPECIALEFECT');
  const loginHasEfect = login.avatarEventConstants && login.avatarEventConstants.includes('SPECIALEFECT');
  const loginHasEffect = login.avatarEventConstants && login.avatarEventConstants.includes('SPECIALEFFECT');

  if (mainHasEfect && !loginHasEfect && loginHasEffect) {
    avatarEventCompatible = false;
    score -= 30;
    risks.push("Main.swf references AvatarEvent.SPECIALEFECT (single 'f') but Login.swf defines AvatarEvent.SPECIALEFFECT (double 'f') (-30)");
    missingAvatarEventConstants.push('SPECIALEFECT (typo SPECIALEFFECT in Login)');
  }
  
  if (main.size < 80000 && missingCore.length > 0) {
    score -= 10;
    risks.push(`Main size is suspiciously tiny (${Math.round(main.size / 1024)} KB) and missing core classes (-10)`);
  }
  
  if (!login.referencesMainSwf && !login.referencesStartMainApp) {
    score -= 10;
    risks.push('Login does not reference Main.swf or startMainApp (-10)');
  }
  
  if (login.externalInterfaceCount > 0) {
    score -= 5;
    risks.push(`ExternalInterface risk: Login has ${login.externalInterfaceCount} JS calls (-5)`);
  }
  
  if (login.dateMarker && main.dateMarker && login.dateMarker === main.dateMarker) {
    score += 10;
    positives.push(`Shared build date marker: ${login.dateMarker} (+10)`);
  }
  
  if (mogoLoginCompatible) {
    score += 10;
    positives.push('Mogo/Login contract is satisfied (+10)');
  }

  // Contract validations:
  // A pair must not score EXCELLENT (>=90) if it fails Mogo/Login, Login/loginGR, Login/Main, or AvatarEvent contracts
  if (!mogoLoginCompatible || !loginLoginGrCompatible || !mainLoginCompatible || !avatarEventCompatible) {
    score = Math.min(89, score);
  }

  if (mogoLoginStatus === 'UNKNOWN') {
    score = Math.min(74, score);
  }

  // Strict mode: any blocker caps score at 49
  if (strictMode && (!mogoLoginCompatible || !loginLoginGrCompatible || !mainLoginCompatible || !avatarEventCompatible)) {
    score = Math.min(49, score);
  }
  
  score = Math.max(0, Math.min(100, score));
  
  return {
    score,
    positives,
    risks,
    mogoLoginCompatible,
    loginExposesInit,
    loginLoginGrCompatible,
    mainLoginCompatible,
    mogoLoginStatus,
    avatarEventCompatible,
    missingAvatarEventConstants
  };
}

export function classifyScore(score: number): PairResult['classification'] {
  if (score >= 90) return 'EXCELLENT';
  if (score >= 75) return 'LIKELY_COMPATIBLE';
  if (score >= 55) return 'POSSIBLE';
  if (score >= 30) return 'RISKY';
  return 'INCOMPATIBLE';
}

export function getRecommendation(score: number, risks: string[], mogoLoginStatus?: 'OK' | 'BLOCKED' | 'UNKNOWN'): string {
  if (mogoLoginStatus === 'UNKNOWN') {
    return 'Not deployable yet: Mogo/Login contract could not be proven.';
  }
  if (score >= 90) return 'Recommended for deployment. No major configuration blockers detected.';
  if (score >= 75) return 'Likely compatible. Verify loading screen mappings in Login.aspx.';
  if (score >= 55) return 'Possible match. Verify that LoginEvent handles transition correctly.';
  if (score >= 30) return 'Risky pairing. Mismatched features will likely freeze client on transition.';
  return 'Do not deploy this pair.';
}

function resolveAsset(assetsPath: string, subPath: string): string | null {
  const p = path.join(assetsPath, subPath);
  if (fs.existsSync(p)) return p;
  return null;
}

export async function runCompatMatrix(options: CompatMatrixOptions): Promise<CompatMatrixReport> {
  const loginDir = options.loginDir ? path.resolve(options.loginDir) : '';
  const mainDir = options.mainDir ? path.resolve(options.mainDir) : '';
  const assetsPath = options.assetsPath ? path.resolve(options.assetsPath) : '';
  
  const cachePath = path.join(process.cwd(), 'compat-matrix-cache.json');
  let cache: Record<string, any> = {};
  if (fs.existsSync(cachePath)) {
    try {
      cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    } catch (e) {
      // Ignore
    }
  }

  if (options.inspectMogo) {
    const mogoFingerprints: MogoFingerprint[] = [];
    const activeMogoPath = assetsPath ? (resolveAsset(assetsPath, 'Swf/Mogo.swf') || resolveAsset(assetsPath, 'Mogo.swf')) : null;
    let mogoFp: MogoFingerprint = {
      path: '',
      filename: 'Mogo.swf (Mock)',
      size: 0,
      sha256: '',
      expectsLoginInit: true,
      loginLoadDetected: true,
      docClass: null,
      appVer: null,
      isAS3: true,
      hasOnCompleteHandler: true,
      expectsLoginInitStatus: 'YES',
      asVersion: 'AS3',
      loadsLoginStatus: 'YES',
      callsLoginInitStatus: 'YES'
    };
    if (activeMogoPath && fs.existsSync(activeMogoPath)) {
      mogoFp = buildMogoFingerprint(activeMogoPath, options.ffdecPath, options.deep);
    }

    if (options.mogoDir) {
      const mogoDir = path.resolve(options.mogoDir);
      const mogoFiles = fs.readdirSync(mogoDir).filter(f => f.toLowerCase().endsWith('.swf'));
      for (const file of mogoFiles) {
        const filePath = path.join(mogoDir, file);
        const rawBytes = fs.readFileSync(filePath);
        const sha256 = crypto.createHash('sha256').update(rawBytes).digest('hex');
        
        const cached = cache[sha256];
        if (cached && (!options.deep || cached.deepScanPerformed)) {
          mogoFingerprints.push({ ...cached, path: filePath, filename: file });
        } else {
          const fp = buildMogoFingerprint(filePath, options.ffdecPath, options.deep);
          cache[sha256] = fp;
          mogoFingerprints.push(fp);
        }
      }
    } else {
      if (activeMogoPath && fs.existsSync(activeMogoPath)) {
        mogoFingerprints.push(mogoFp);
      }
    }

    try {
      fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
    } catch (e) {}

    return {
      mode: 'inspect-mogo',
      mogoInspection: mogoFingerprints,
      loginCandidatesCount: 0,
      mainCandidatesCount: 0,
      totalPairsScored: 0,
      topPairs: [],
      bestLoginForActiveMain: null,
      bestMainForActiveLogin: null,
      assetsPath
    };
  }
  
  // 1. Resolve active assets
  const activeMogoPath = resolveAsset(assetsPath, 'Swf/Mogo.swf') || resolveAsset(assetsPath, 'Mogo.swf');
  const activeLoginPath = path.join(assetsPath, 'Swf', 'Login.swf');
  const activeMainPath = path.join(assetsPath, 'Swf', 'Main.swf');
  const activeLoginGrPath = resolveAsset(assetsPath, 'Swf/loginGR.swf') || resolveAsset(assetsPath, 'Swf/Assets/loginGR.swf') || resolveAsset(assetsPath, 'loginGR.swf');
  
  // Calibration check
  let initDetectionUnreliable = false;
  if (activeMogoPath && activeLoginPath && fs.existsSync(activeMogoPath) && fs.existsSync(activeLoginPath)) {
    const activeMogo = buildMogoFingerprint(activeMogoPath, options.ffdecPath, options.deep);
    const activeLoginFast = buildLoginFingerprint(activeLoginPath, options.ffdecPath, false, false);
    
    const activeMogoExpectsInit = activeMogo.expectsLoginInitStatus === 'YES' || activeMogo.expectsLoginInitStatus === 'UNKNOWN';
    if (activeMogoExpectsInit && !activeLoginFast.exposesInitMethod) {
      console.warn('\x1b[33m[MATRIX WARNING] Scanner failed to detect Login.init on active Login.swf, but active runtime is known to require it.\x1b[0m');
      initDetectionUnreliable = true;
    }
  }

  // Resolve active/mock Mogo
  console.log('[MATRIX] Reading active asset Mogo.swf...');
  let mogoFp: MogoFingerprint = {
    path: '',
    filename: 'Mogo.swf (Mock)',
    size: 0,
    sha256: '',
    expectsLoginInit: true,
    loginLoadDetected: true,
    docClass: null,
    appVer: null,
    isAS3: true,
    hasOnCompleteHandler: true,
    expectsLoginInitStatus: 'YES'
  };
  if (activeMogoPath) {
    mogoFp = buildMogoFingerprint(activeMogoPath, options.ffdecPath, options.deep);
  }

  // 1a. Scan/Resolve Mogo candidates
  const mogoFingerprints: MogoFingerprint[] = [];
  if (options.mogoDir) {
    const mogoDir = path.resolve(options.mogoDir);
    console.log(`[MATRIX] Scanning Mogo candidates in: ${mogoDir}...`);
    const mogoFiles = fs.readdirSync(mogoDir).filter(f => f.toLowerCase().endsWith('.swf'));
    for (const file of mogoFiles) {
      const filePath = path.join(mogoDir, file);
      const rawBytes = fs.readFileSync(filePath);
      const sha256 = crypto.createHash('sha256').update(rawBytes).digest('hex');
      
      const cached = cache[sha256];
      if (cached && (!options.deep || cached.deepScanPerformed)) {
        mogoFingerprints.push({ ...cached, path: filePath, filename: file });
      } else {
        const fp = buildMogoFingerprint(filePath, options.ffdecPath, options.deep);
        cache[sha256] = fp;
        mogoFingerprints.push(fp);
      }
    }
  } else {
    mogoFingerprints.push(mogoFp);
  }

  // 1b. Scan/Resolve loginGR candidates
  const loginGrFingerprints: LoginGrFingerprint[] = [];
  if (options.loginGrDir) {
    const loginGrDir = path.resolve(options.loginGrDir);
    console.log(`[MATRIX] Scanning loginGR candidates in: ${loginGrDir}...`);
    const loginGrFiles = fs.readdirSync(loginGrDir).filter(f => f.toLowerCase().endsWith('.swf'));
    for (const file of loginGrFiles) {
      const filePath = path.join(loginGrDir, file);
      const rawBytes = fs.readFileSync(filePath);
      const sha256 = crypto.createHash('sha256').update(rawBytes).digest('hex');
      
      if (cache[sha256]) {
        loginGrFingerprints.push({ ...cache[sha256], path: filePath, filename: file });
      } else {
        const fp = buildLoginGrFingerprint(filePath, options.ffdecPath);
        cache[sha256] = fp;
        loginGrFingerprints.push(fp);
      }
    }
  } else {
    console.log('[MATRIX] Reading active asset loginGR.swf...');
    let loginGrFp: LoginGrFingerprint = {
      path: '',
      filename: 'loginGR.swf (Mock)',
      size: 0,
      sha256: '',
      hasGlobalMlLoginScreen: true,
      hasMlLoginScreenHeb: true,
      hasMlLoginMultiUsers: true,
      hasMlAvatarBig: true,
      hasGetSwfParams: true,
      hasRequiredLoginChildren: true,
      hasNamespacedMlLoginScreen: false
    };
    if (activeLoginGrPath) {
      loginGrFp = buildLoginGrFingerprint(activeLoginGrPath, options.ffdecPath);
    }
    loginGrFingerprints.push(loginGrFp);
  }
  
  // 2. Scan Login candidates
  console.log('[MATRIX] Scanning login candidates...');
  const loginFiles = fs.readdirSync(loginDir).filter(f => f.toLowerCase().endsWith('.swf'));
  const loginFingerprints: LoginFingerprint[] = [];
  
  for (const file of loginFiles) {
    const filePath = path.join(loginDir, file);
    const rawBytes = fs.readFileSync(filePath);
    const sha256 = crypto.createHash('sha256').update(rawBytes).digest('hex');
    
    const cached = cache[sha256];
    if (cached && (!options.deep || cached.deepScanPerformed)) {
      loginFingerprints.push({ ...cached, path: filePath, filename: file });
    } else {
      const fp = buildLoginFingerprint(filePath, options.ffdecPath, options.deep, initDetectionUnreliable);
      cache[sha256] = fp;
      loginFingerprints.push(fp);
    }
  }

  // 3. Scan Main candidates
  console.log('[MATRIX] Scanning main candidates...');
  const mainFiles = fs.readdirSync(mainDir).filter(f => f.toLowerCase().endsWith('.swf'));
  const mainFingerprints: MainFingerprint[] = [];
  
  for (const file of mainFiles) {
    const filePath = path.join(mainDir, file);
    const rawBytes = fs.readFileSync(filePath);
    const sha256 = crypto.createHash('sha256').update(rawBytes).digest('hex');
    
    const cached = cache[sha256];
    if (cached && (!options.deep || cached.deepScanPerformed)) {
      mainFingerprints.push({ ...cached, path: filePath, filename: file });
    } else {
      const fp = buildMainFingerprint(filePath, options.ffdecPath, options.deep);
      cache[sha256] = fp;
      mainFingerprints.push(fp);
    }
  }
  
  // Save cache
  try {
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {
    // Ignore
  }
  
  // 4. Score combinations
  console.log('[MATRIX] Scoring combinations...');
  const pairs: PairResult[] = [];
  
  let countExcellent = 0;
  let countLikelyCompatible = 0;
  let countPossible = 0;
  let countRisky = 0;
  let countIncompatible = 0;
  let countBlockedMogoLoginInitMissing = 0;
  let countBlockedMogoLoginInitUnknown = 0;
  let countBlockedLoginGrGetSwfParamsMissing = 0;
  let countBlockedLoginLoginGrLinkageMismatch = 0;
  let countBlockedFirstLoadingScreensMismatch = 0;
  let countBlockedLoginEventMissing = 0;
  let countLoginMainOkMogoLoginFailed = 0;
  let countLoginMainOkLoginLoginGrFailed = 0;

  let mogoCandidatesExpectInitYes = 0;
  let mogoCandidatesExpectInitNo = 0;
  let mogoCandidatesExpectInitUnknown = 0;

  for (const mogo of mogoFingerprints) {
    const status = mogo.expectsLoginInitStatus || 'UNKNOWN';
    if (status === 'YES') mogoCandidatesExpectInitYes++;
    else if (status === 'NO') mogoCandidatesExpectInitNo++;
    else mogoCandidatesExpectInitUnknown++;
  }

  for (const mogo of mogoFingerprints) {
    for (const login of loginFingerprints) {
      for (const main of mainFingerprints) {
        for (const loginGr of loginGrFingerprints) {
          const { 
            score, 
            positives, 
            risks,
            mogoLoginCompatible,
            loginExposesInit,
            loginLoginGrCompatible,
            mainLoginCompatible,
            mogoLoginStatus,
            avatarEventCompatible,
            missingAvatarEventConstants
          } = scorePair(login, main, mogo, loginGr, options.strict);
          
          if (options.requireProvenStartup && mogoLoginStatus === 'UNKNOWN') {
            continue;
          }
          
          const classification = classifyScore(score);
          if (classification === 'EXCELLENT') countExcellent++;
          else if (classification === 'LIKELY_COMPATIBLE') countLikelyCompatible++;
          else if (classification === 'POSSIBLE') countPossible++;
          else if (classification === 'RISKY') countRisky++;
          else countIncompatible++;

          const eitherDefinesLoginEvent = login.definedClasses.some(c => c.endsWith('.LoginEvent')) || main.definesLoginEvent;
          
          if (mogoLoginStatus === 'BLOCKED') {
            countBlockedMogoLoginInitMissing++;
          } else if (mogoLoginStatus === 'UNKNOWN') {
            countBlockedMogoLoginInitUnknown++;
          }
          
          if (login.requiresGetSwfParams && !loginGr.hasGetSwfParams) {
            countBlockedLoginGrGetSwfParamsMissing++;
          }
          
          const linkageMismatch = 
            (login.requiresMlLoginScreenHeb && !loginGr.hasMlLoginScreenHeb) ||
            (login.requiresMlLoginMultiUsers && !loginGr.hasMlLoginMultiUsers) ||
            (login.requiresMlLoginScreen && !loginGr.hasGlobalMlLoginScreen) ||
            (login.requiresMlLoginScreen && !loginGr.hasRequiredLoginChildren);
          if (linkageMismatch) {
            countBlockedLoginLoginGrLinkageMismatch++;
          }
          
          if (main.requiresFirstLoadingScreens && !login.providesFirstLoadingScreens) {
            countBlockedFirstLoadingScreensMismatch++;
          }
          
          if (main.referencesLoginEvent && !eitherDefinesLoginEvent) {
            countBlockedLoginEventMissing++;
          }
          
          if (mainLoginCompatible && !mogoLoginCompatible) {
            countLoginMainOkMogoLoginFailed++;
          }
          
          if (mainLoginCompatible && !loginLoginGrCompatible) {
            countLoginMainOkLoginLoginGrFailed++;
          }

          pairs.push({
            rank: 0,
            score,
            classification,
            loginFile: login.filename,
            loginPath: login.path,
            loginSize: login.size,
            mainFile: main.filename,
            mainPath: main.path,
            mainSize: main.size,
            loginGrFile: options.loginGrDir ? loginGr.filename : undefined,
            loginGrPath: options.loginGrDir ? loginGr.path : undefined,
            loginGrSize: options.loginGrDir ? loginGr.size : undefined,
            mogoFile: options.mogoDir ? mogo.filename : undefined,
            mogoPath: options.mogoDir ? mogo.path : undefined,
            mogoSize: options.mogoDir ? mogo.size : undefined,
            mogoLoginCompatible,
            loginExposesInit,
            loginLoginGrCompatible,
            mainLoginCompatible,
            mogoLoginStatus,
            mogoExpectsLoginInitStatus: mogo.expectsLoginInitStatus || 'UNKNOWN',
            positives,
            risks,
            recommendation: getRecommendation(score, risks, mogoLoginStatus),
            avatarEventCompatible,
            missingAvatarEventConstants
          });
        }
      }
    }
  }
  
  // Sort pairs
  pairs.sort((a, b) => {
    const statusOrder: Record<string, number> = { 'OK': 2, 'UNKNOWN': 1, 'BLOCKED': 0 };
    const orderA = statusOrder[a.mogoLoginStatus || 'UNKNOWN'];
    const orderB = statusOrder[b.mogoLoginStatus || 'UNKNOWN'];
    if (orderB !== orderA) return orderB - orderA;

    if (b.score !== a.score) return b.score - a.score;
    const aDate = a.loginFile.match(/_(20\d{6})/)?.[1] || '';
    const bDate = b.loginFile.match(/_(20\d{6})/)?.[1] || '';
    if (bDate !== aDate) return bDate.localeCompare(aDate);
    return a.loginFile.localeCompare(b.loginFile) || 
           a.mainFile.localeCompare(b.mainFile) || 
           (a.loginGrFile && b.loginGrFile ? a.loginGrFile.localeCompare(b.loginGrFile) : 0) ||
           (a.mogoFile && b.mogoFile ? a.mogoFile.localeCompare(b.mogoFile) : 0);
  });
  
  pairs.forEach((p, idx) => {
    p.rank = idx + 1;
  });
  
  let bestLoginForActiveMain: PairResult | null = null;
  let bestMainForActiveLogin: PairResult | null = null;
  let bestMogoForActiveSet: PairResult | null = null;
  let activeLoginFp: LoginFingerprint | null = null;
  let activeMainFp: MainFingerprint | null = null;
  
  if (fs.existsSync(activeLoginPath)) {
    activeLoginFp = buildLoginFingerprint(activeLoginPath, options.ffdecPath, options.deep, initDetectionUnreliable);
  }
  if (fs.existsSync(activeMainPath)) {
    activeMainFp = buildMainFingerprint(activeMainPath, options.ffdecPath, options.deep);
  }
  
  if (activeMainFp) {
    let bestScore = -1;
    let bestPair: PairResult | null = null;
    for (const login of loginFingerprints) {
      for (const loginGr of loginGrFingerprints) {
        const { 
          score, 
          positives, 
          risks,
          mogoLoginCompatible,
          loginExposesInit,
          loginLoginGrCompatible,
          mainLoginCompatible,
          mogoLoginStatus
        } = scorePair(login, activeMainFp, mogoFp, loginGr, options.strict);
        
        if (score > bestScore) {
          bestScore = score;
          bestPair = {
            rank: 0,
            score,
            classification: classifyScore(score),
            loginFile: login.filename,
            loginPath: login.path,
            loginSize: login.size,
            mainFile: 'Active Main.swf',
            mainPath: activeMainPath,
            mainSize: activeMainFp.size,
            loginGrFile: options.loginGrDir ? loginGr.filename : undefined,
            loginGrPath: options.loginGrDir ? loginGr.path : undefined,
            loginGrSize: options.loginGrDir ? loginGr.size : undefined,
            mogoLoginCompatible,
            loginExposesInit,
            loginLoginGrCompatible,
            mainLoginCompatible,
            mogoLoginStatus,
            mogoExpectsLoginInitStatus: mogoFp.expectsLoginInitStatus || 'UNKNOWN',
            positives,
            risks,
            recommendation: getRecommendation(score, risks, mogoLoginStatus)
          };
        }
      }
    }
    bestLoginForActiveMain = bestPair;
  }
  
  if (activeLoginFp) {
    let bestScore = -1;
    let bestPair: PairResult | null = null;
    for (const main of mainFingerprints) {
      for (const loginGr of loginGrFingerprints) {
        const { 
          score, 
          positives, 
          risks,
          mogoLoginCompatible,
          loginExposesInit,
          loginLoginGrCompatible,
          mainLoginCompatible,
          mogoLoginStatus
        } = scorePair(activeLoginFp, main, mogoFp, loginGr, options.strict);
        
        if (score > bestScore) {
          bestScore = score;
          bestPair = {
            rank: 0,
            score,
            classification: classifyScore(score),
            loginFile: 'Active Login.swf',
            loginPath: activeLoginPath,
            loginSize: activeLoginFp.size,
            mainFile: main.filename,
            mainPath: main.path,
            mainSize: main.size,
            loginGrFile: options.loginGrDir ? loginGr.filename : undefined,
            loginGrPath: options.loginGrDir ? loginGr.path : undefined,
            loginGrSize: options.loginGrDir ? loginGr.size : undefined,
            mogoLoginCompatible,
            loginExposesInit,
            loginLoginGrCompatible,
            mainLoginCompatible,
            mogoLoginStatus,
            mogoExpectsLoginInitStatus: mogoFp.expectsLoginInitStatus || 'UNKNOWN',
            positives,
            risks,
            recommendation: getRecommendation(score, risks, mogoLoginStatus)
          };
        }
      }
    }
    bestMainForActiveLogin = bestPair;
  }

  if (options.mogoDir && activeLoginFp && activeMainFp) {
    let bestScore = -1;
    let bestPair: PairResult | null = null;
    
    let activeLoginGrFp: LoginGrFingerprint = {
      path: '',
      filename: 'loginGR.swf (Mock)',
      size: 0,
      sha256: '',
      hasGlobalMlLoginScreen: true,
      hasMlLoginScreenHeb: true,
      hasMlLoginMultiUsers: true,
      hasMlAvatarBig: true,
      hasGetSwfParams: true,
      hasRequiredLoginChildren: true,
      hasNamespacedMlLoginScreen: false
    };
    if (activeLoginGrPath) {
      activeLoginGrFp = buildLoginGrFingerprint(activeLoginGrPath, options.ffdecPath);
    }

    for (const mogo of mogoFingerprints) {
      const { 
        score, 
        positives, 
        risks,
        mogoLoginCompatible,
        loginExposesInit,
        loginLoginGrCompatible,
        mainLoginCompatible,
        mogoLoginStatus
      } = scorePair(activeLoginFp, activeMainFp, mogo, activeLoginGrFp, options.strict);
      
      if (score > bestScore) {
        bestScore = score;
        bestPair = {
          rank: 0,
          score,
          classification: classifyScore(score),
          loginFile: 'Active Login.swf',
          loginPath: activeLoginPath,
          loginSize: activeLoginFp.size,
          mainFile: 'Active Main.swf',
          mainPath: activeMainPath,
          mainSize: activeMainFp.size,
          loginGrFile: 'Active loginGR.swf',
          loginGrPath: activeLoginGrPath || undefined,
          loginGrSize: activeLoginGrPath ? fs.statSync(activeLoginGrPath).size : undefined,
          mogoFile: mogo.filename,
          mogoPath: mogo.path,
          mogoSize: mogo.size,
          mogoLoginCompatible,
          loginExposesInit,
          loginLoginGrCompatible,
          mainLoginCompatible,
          mogoLoginStatus,
          mogoExpectsLoginInitStatus: mogo.expectsLoginInitStatus || 'UNKNOWN',
          positives,
          risks,
          recommendation: getRecommendation(score, risks, mogoLoginStatus)
        };
      }
    }
    bestMogoForActiveSet = bestPair;
  }
  
  console.log('[MATRIX] Done.');
  
  const summaryStats: SummaryStats = {
    totalPairs: pairs.length,
    countExcellent,
    countLikelyCompatible,
    countPossible,
    countRisky,
    countIncompatible,
    countBlockedMogoLoginInitMissing,
    countBlockedMogoLoginInitUnknown,
    countBlockedLoginGrGetSwfParamsMissing,
    countBlockedLoginLoginGrLinkageMismatch,
    countBlockedFirstLoadingScreensMismatch,
    countBlockedLoginEventMissing,
    countLoginMainOkMogoLoginFailed,
    countLoginMainOkLoginLoginGrFailed,
    mogoCandidatesExpectInitYes,
    mogoCandidatesExpectInitNo,
    mogoCandidatesExpectInitUnknown
  };

  return {
    loginCandidatesCount: loginFingerprints.length,
    mainCandidatesCount: mainFingerprints.length,
    loginGrCandidatesCount: options.loginGrDir ? loginGrFingerprints.length : undefined,
    mogoCandidatesCount: options.mogoDir ? mogoFingerprints.length : undefined,
    totalPairsScored: pairs.length,
    topPairs: pairs.slice(0, options.top || 20),
    bestLoginForActiveMain,
    bestMainForActiveLogin,
    bestMogoForActiveSet,
    activeLoginFilename: activeLoginFp ? 'Login.swf' : undefined,
    activeMainFilename: activeMainFp ? 'Main.swf' : undefined,
    activeLoginGrFilename: activeLoginGrPath ? path.basename(activeLoginGrPath) : undefined,
    activeMogoFilename: activeMogoPath ? 'Mogo.swf' : undefined,
    assetsPath,
    loginGrDir: options.loginGrDir,
    mogoDir: options.mogoDir,
    showCopyForIncompatible: options.showCopyForIncompatible,
    requireProvenStartup: options.requireProvenStartup,
    summaryStats
  };
}

export function formatConsoleMatrix(report: CompatMatrixReport): string {
  const lines: string[] = [];
  lines.push('\x1b[35m==============================================================');
  lines.push('               CLIENT SWF COMPATIBILITY MATRIX                ');
  lines.push('==============================================================\x1b[0m');
  lines.push(`Login candidates: ${report.loginCandidatesCount}`);
  lines.push(`Main candidates:  ${report.mainCandidatesCount}`);
  if (report.loginGrDir) {
    lines.push(`loginGR candidates: ${report.loginGrCandidatesCount}`);
  }
  if (report.mogoDir) {
    lines.push(`Mogo candidates:    ${report.mogoCandidatesCount}`);
  }
  lines.push(`Total combinations scored: ${report.totalPairsScored}\n`);
  
  if (!report.loginGrDir) {
    const resolvedPath = report.activeLoginGrFilename
      ? path.join(report.assetsPath, 'Swf', report.activeLoginGrFilename).replace(/\//g, '\\')
      : 'loginGR.swf (Mock)';
    lines.push(`Using active loginGR only: ${resolvedPath}\n`);
  }

  const topResult = report.topPairs[0];
  const topIncompatible = !topResult || topResult.score < 55;
  
  if (topIncompatible) {
    if (report.mogoDir) {
      lines.push('\x1b[31mNo compatible Mogo/Login/Main/loginGR quadruples found for the active constraints.\x1b[0m\n');
    } else if (report.loginGrDir) {
      lines.push('\x1b[31mNo compatible Login/Main/loginGR triples found for the active Mogo.swf constraints.\x1b[0m\n');
    } else {
      lines.push('\x1b[31mNo compatible Login/Main pairs found for the active Mogo.swf + active loginGR.swf constraints.\x1b[0m\n');
    }
  }

  const targetLoginPath = path.join(report.assetsPath, 'Swf', 'Login.swf').replace(/\//g, '\\');
  const targetMainPath = path.join(report.assetsPath, 'Swf', 'Main.swf').replace(/\//g, '\\');
  const targetLoginGrPath = path.join(report.assetsPath, 'Swf', 'loginGR.swf').replace(/\//g, '\\');
  const targetLoginGrAssetsPath = path.join(report.assetsPath, 'Swf', 'Assets', 'loginGR.swf').replace(/\//g, '\\');
  const targetMogoPath = path.join(report.assetsPath, 'Swf', 'Mogo.swf').replace(/\//g, '\\');

  function getPairStatus(pair: PairResult): 'OK' | 'BLOCKED' | 'UNKNOWN' {
    if (pair.mogoLoginStatus) return pair.mogoLoginStatus;
    if (pair.mogoLoginCompatible === false) return 'BLOCKED';
    return 'UNKNOWN';
  }

  function printTable(pairsList: PairResult[], forceHideCopyUnknown = false, forceHideAllCopy = false) {
    if (report.mogoDir) {
      if (report.loginGrDir) {
        lines.push(
          String('Rank').padEnd(5) + 
          String('Score').padEnd(6) + 
          String('Class').padEnd(18) + 
          String('Mogo Candidate').padEnd(25) +
          String('Login Candidate').padEnd(25) + 
          String('Main Candidate').padEnd(25) +
          String('loginGR Candidate')
        );
        lines.push('-'.repeat(130));
      } else {
        lines.push(
          String('Rank').padEnd(5) + 
          String('Score').padEnd(6) + 
          String('Class').padEnd(18) + 
          String('Mogo Candidate').padEnd(25) +
          String('Login Candidate').padEnd(25) + 
          String('Main Candidate')
        );
        lines.push('-'.repeat(110));
      }
    } else {
      if (report.loginGrDir) {
        lines.push(
          String('Rank').padEnd(5) + 
          String('Score').padEnd(6) + 
          String('Class').padEnd(18) + 
          String('Login Candidate (Size)').padEnd(35) + 
          String('Main Candidate (Size)').padEnd(35) +
          String('loginGR Candidate')
        );
        lines.push('-'.repeat(120));
      } else {
        lines.push(
          String('Rank').padEnd(5) + 
          String('Score').padEnd(6) + 
          String('Class').padEnd(18) + 
          String('Login Candidate (Size)').padEnd(35) + 
          String('Main Candidate (Size)')
        );
        lines.push('-'.repeat(90));
      }
    }

    for (const pair of pairsList) {
      const scoreStr = `${pair.score}%`;
      const loginLabel = `${pair.loginFile} (${Math.round(pair.loginSize / 1024)}KB)`;
      const mainLabel = `${pair.mainFile} (${Math.round(pair.mainSize / 1024)}KB)`;
      const loginGrLabel = pair.loginGrFile ? `${pair.loginGrFile} (${Math.round(pair.loginGrSize! / 1024)}KB)` : 'N/A';
      const mogoLabel = pair.mogoFile ? `${pair.mogoFile} (${Math.round(pair.mogoSize! / 1024)}KB)` : 'N/A';
      
      let color = '\x1b[0m';
      if (pair.classification === 'EXCELLENT') color = '\x1b[32m';      // green
      else if (pair.classification === 'LIKELY_COMPATIBLE') color = '\x1b[36m'; // cyan
      else if (pair.classification === 'POSSIBLE') color = '\x1b[33m';  // yellow
      else if (pair.classification === 'RISKY') color = '\x1b[35m';     // magenta
      else color = '\x1b[31m';                                          // red
      
      if (report.mogoDir) {
        if (report.loginGrDir) {
          lines.push(
            String(pair.rank).padEnd(5) + 
            scoreStr.padEnd(6) + 
            `${color}${pair.classification}\x1b[0m`.padEnd(27) + 
            mogoLabel.padEnd(25) +
            loginLabel.padEnd(25) + 
            mainLabel.padEnd(25) +
            loginGrLabel
          );
        } else {
          lines.push(
            String(pair.rank).padEnd(5) + 
            scoreStr.padEnd(6) + 
            `${color}${pair.classification}\x1b[0m`.padEnd(27) + 
            mogoLabel.padEnd(25) +
            loginLabel.padEnd(25) + 
            mainLabel
          );
        }
      } else {
        if (report.loginGrDir) {
          lines.push(
            String(pair.rank).padEnd(5) + 
            scoreStr.padEnd(6) + 
            `${color}${pair.classification}\x1b[0m`.padEnd(27) + 
            loginLabel.padEnd(35) + 
            mainLabel.padEnd(35) +
            loginGrLabel
          );
        } else {
          lines.push(
            String(pair.rank).padEnd(5) + 
            scoreStr.padEnd(6) + 
            `${color}${pair.classification}\x1b[0m`.padEnd(27) + 
            loginLabel.padEnd(35) + 
            mainLabel
          );
        }
      }
      
      const mogoComp = getPairStatus(pair);
      let mogoDetails = '';
      if (mogoComp === 'OK') {
        mogoDetails = pair.loginExposesInit ? 'Mogo expects init, Login exposes init' : 'Mogo does not expect init';
      } else if (mogoComp === 'BLOCKED') {
        mogoDetails = 'Mogo.swf expects Login.init(), but Login candidate does not expose init()';
      } else {
        mogoDetails = 'Mogo expects Login.init(), but Login init detection is uncertain';
      }
      const mogoCompText = `${mogoComp} (${mogoDetails})`;
      
      const loginGrDetails = pair.loginLoginGrCompatible
        ? 'getSwfParams not required/provided'
        : 'Login.swf expects loginGR.getSwfParams(), but active loginGR.swf does not provide it';
      const loginGrComp = `${pair.loginLoginGrCompatible ? 'OK' : 'BLOCKED'} (${loginGrDetails})`;
      
      const mainDetails = pair.mainLoginCompatible
        ? 'Main/Login contract satisfied'
        : 'Main requires FirstLoadingScreens, Login does not provide it';
      const mainComp = `${pair.mainLoginCompatible ? 'OK' : 'BLOCKED'} (${mainDetails})`;
 
      let mogoColor = '\x1b[32m';
      if (mogoComp === 'BLOCKED') mogoColor = '\x1b[31m';
      else if (mogoComp === 'UNKNOWN') mogoColor = '\x1b[33m';
 
      lines.push(`      expects Login.init: ${pair.mogoExpectsLoginInitStatus || 'UNKNOWN'}`);
      lines.push(`      Mogo/Login:    ${mogoColor}${mogoCompText}\x1b[0m`);
      lines.push(`      Login/loginGR: ${pair.loginLoginGrCompatible ? '\x1b[32m' : '\x1b[31m'}${loginGrComp}\x1b[0m`);
      lines.push(`      Login/Main:    ${pair.mainLoginCompatible ? '\x1b[32m' : '\x1b[31m'}${mainComp}\x1b[0m`);

      const aeComp = pair.avatarEventCompatible ? 'OK' : 'BLOCKED';
      const aeColor = pair.avatarEventCompatible ? '\x1b[32m' : '\x1b[31m';
      lines.push(`      AvatarEvent constants: ${aeColor}${aeComp}\x1b[0m`);
      if (!pair.avatarEventCompatible && pair.missingAvatarEventConstants && pair.missingAvatarEventConstants.length > 0) {
        lines.push(`      missing constants: ${pair.missingAvatarEventConstants.join(', ')}`);
      }
 
      const normalizedLogin = pair.loginPath.replace(/\//g, '\\');
      const normalizedMain = pair.mainPath.replace(/\//g, '\\');
      lines.push(`      \x1b[90mLogin Path: ${normalizedLogin}\x1b[0m`);
      lines.push(`      \x1b[90mMain Path:  ${normalizedMain}\x1b[0m`);
      if (report.mogoDir && pair.mogoPath) {
        lines.push(`      \x1b[90mMogo Path:  ${pair.mogoPath.replace(/\//g, '\\')}\x1b[0m`);
      }
      if (report.loginGrDir && pair.loginGrPath) {
        lines.push(`      \x1b[90mloginGR Path: ${pair.loginGrPath.replace(/\//g, '\\')}\x1b[0m`);
      }
 
      let showCopy = pair.classification !== 'INCOMPATIBLE' || report.showCopyForIncompatible;
      if (getPairStatus(pair) === 'UNKNOWN') {
        showCopy = report.showCopyForIncompatible ? true : false;
      }
      if (forceHideCopyUnknown && getPairStatus(pair) === 'UNKNOWN') {
        showCopy = false;
      }
      if (forceHideAllCopy) {
        showCopy = false;
      }
      if (showCopy) {
        if (report.mogoDir && pair.mogoPath) {
          lines.push(`      \x1b[90m# copy "${pair.mogoPath.replace(/\//g, '\\')}" "${targetMogoPath}"\x1b[0m`);
        }
        lines.push(`      \x1b[90m# copy "${normalizedLogin}" "${targetLoginPath}"\x1b[0m`);
        if (report.loginGrDir && pair.loginGrPath) {
          lines.push(`      \x1b[90m# copy "${pair.loginGrPath.replace(/\//g, '\\')}" "${targetLoginGrPath}"\x1b[0m`);
          lines.push(`      \x1b[90m# copy "${pair.loginGrPath.replace(/\//g, '\\')}" "${targetLoginGrAssetsPath}"\x1b[0m`);
        }
        lines.push(`      \x1b[90m# copy "${normalizedMain}" "${targetMainPath}"\x1b[0m`);
      }
      
      if (pair.risks.length > 0 && pair.score < 90) {
        lines.push(`      \x1b[90mRisks: ${pair.risks.join(' | ')}\x1b[0m`);
      }
    }
  }
 
  const isDeployable = (p: PairResult) => p.mogoLoginStatus === 'OK' && p.loginLoginGrCompatible && p.mainLoginCompatible;
  const deployablePairs = report.topPairs.filter(isDeployable);
  const unknownPairs = report.topPairs.filter(p => !isDeployable(p) && getPairStatus(p) === 'UNKNOWN' && p.loginLoginGrCompatible && p.mainLoginCompatible);
  const blockedPairs = report.topPairs.filter(p => !isDeployable(p) && (getPairStatus(p) === 'BLOCKED' || !p.loginLoginGrCompatible || !p.mainLoginCompatible));
  
  if (deployablePairs.length > 0) {
    if (report.mogoDir) {
      lines.push(`\x1b[36mTOP DEPLOYABLE STARTUP SETS:\x1b[0m`);
    } else {
      lines.push(`\x1b[36mTOP DEPLOYABLE CANDIDATES:\x1b[0m`);
    }
    printTable(deployablePairs, false, false);
  } else {
    lines.push(`\x1b[31mNO PROVEN DEPLOYABLE STARTUP SETS FOUND\x1b[0m`);
    if (unknownPairs.length > 0) {
      lines.push(`\n\x1b[33mUNKNOWN STARTUP SETS FOR MANUAL INVESTIGATION:\x1b[0m`);
      printTable(unknownPairs, true, false);
    }
    if (blockedPairs.length > 0) {
      lines.push(`\n\x1b[31mBLOCKED CANDIDATES:\x1b[0m`);
      printTable(blockedPairs, false, false);
    }
  }
  
  lines.push('\n\x1b[36mACTIVE ASSETS PROFILE COMPATIBILITY:\x1b[0m');
  if (report.mogoDir) {
    if (report.bestMogoForActiveSet) {
      const pair = report.bestMogoForActiveSet;
      lines.push(`* Best Mogo Candidate for current active Login/loginGR/Main set:`);
      lines.push(`  -> ${pair.mogoFile} (${Math.round(pair.mogoSize! / 1024)}KB)`);
      lines.push(`     Score: ${pair.score}% | Classification: ${pair.classification}`);
      lines.push(`     Recommendation: ${pair.recommendation}`);
    } else {
      lines.push(`* Current active set could not be parsed.`);
    }
    
    if (report.topPairs.length > 0) {
      const bestOverall = report.topPairs[0];
      lines.push(`* Best Full Startup Set Overall:`);
      lines.push(`  -> Mogo:    ${bestOverall.mogoFile}`);
      lines.push(`  -> Login:   ${bestOverall.loginFile}`);
      lines.push(`  -> Main:    ${bestOverall.mainFile}`);
      if (bestOverall.loginGrFile) {
        lines.push(`  -> loginGR: ${bestOverall.loginGrFile}`);
      }
      lines.push(`     Score: ${bestOverall.score}% | Classification: ${bestOverall.classification}`);
      lines.push(`     Recommendation: ${bestOverall.recommendation}`);
    }
  } else {
    if (report.bestLoginForActiveMain) {
      const pair = report.bestLoginForActiveMain;
      lines.push(`* Best Login Candidate for current active Main.swf:`);
      lines.push(`  -> ${pair.loginFile} (${Math.round(pair.loginSize / 1024)}KB)`);
      lines.push(`     Score: ${pair.score}% | Classification: ${pair.classification}`);
      lines.push(`     Recommendation: ${pair.recommendation}`);
    } else {
      lines.push(`* Current active Main.swf could not be parsed.`);
    }
    
    if (report.bestMainForActiveLogin) {
      const pair = report.bestMainForActiveLogin;
      lines.push(`* Best Main Candidate for current active Login.swf:`);
      lines.push(`  -> ${pair.mainFile} (${Math.round(pair.mainSize / 1024)}KB)`);
      lines.push(`     Score: ${pair.score}% | Classification: ${pair.classification}`);
      lines.push(`     Recommendation: ${pair.recommendation}`);
    } else {
      lines.push(`* Current active Login.swf could not be parsed.`);
    }
  }
 
  if (report.summaryStats) {
    const stats = report.summaryStats;
    lines.push('\n\x1b[35m==============================================================');
    lines.push('                      SUMMARY STATISTICS                      ');
    lines.push('==============================================================\x1b[0m');
    lines.push(`Total combinations scored: ${stats.totalPairs}`);
    lines.push('Classifications:');
    lines.push(`- EXCELLENT: ${stats.countExcellent}`);
    lines.push(`- LIKELY_COMPATIBLE: ${stats.countLikelyCompatible}`);
    lines.push(`- POSSIBLE: ${stats.countPossible}`);
    lines.push(`- RISKY: ${stats.countRisky}`);
    lines.push(`- INCOMPATIBLE: ${stats.countIncompatible}`);
    lines.push('\nBlockers / Failures:');
    lines.push(`- Blocked by Mogo/Login init missing: ${stats.countBlockedMogoLoginInitMissing}`);
    lines.push(`- Unknown Mogo/Login init detection: ${stats.countBlockedMogoLoginInitUnknown}`);
    lines.push(`- Blocked by loginGR getSwfParams missing: ${stats.countBlockedLoginGrGetSwfParamsMissing}`);
    lines.push(`- Blocked by Login/loginGR linkage mismatch: ${stats.countBlockedLoginLoginGrLinkageMismatch}`);
    lines.push(`- Blocked by FirstLoadingScreens mismatch: ${stats.countBlockedFirstLoadingScreensMismatch}`);
    lines.push(`- Blocked by LoginEvent missing: ${stats.countBlockedLoginEventMissing}`);
    lines.push('\nCross-component Failures:');
    lines.push(`- Login/Main is OK but Mogo/Login failed: ${stats.countLoginMainOkMogoLoginFailed}`);
    lines.push(`- Login/Main is OK but Login/loginGR failed: ${stats.countLoginMainOkLoginLoginGrFailed}`);
    
    lines.push('\nMogo candidates init expectations:');
    lines.push(`- expects Login.init: YES: ${stats.mogoCandidatesExpectInitYes || 0}`);
    lines.push(`- expects Login.init: NO: ${stats.mogoCandidatesExpectInitNo || 0}`);
    lines.push(`- expects Login.init: UNKNOWN: ${stats.mogoCandidatesExpectInitUnknown || 0}`);
  }
  
  return lines.join('\n');
}

export function formatMogoInspectionReport(report: CompatMatrixReport): string {
  if (!report.mogoInspection || report.mogoInspection.length === 0) {
    return 'No Mogo candidates found for inspection.';
  }
  
  let out = '================================================================================\n';
  out += '                       MOGO SWF CANDIDATES INSPECTION REPORT\n';
  out += '================================================================================\n\n';
  
  for (const mogo of report.mogoInspection) {
    out += `Candidate: ${mogo.filename}\n`;
    out += `  Path: ${mogo.path}\n`;
    out += `  Size: ${mogo.size} bytes (${(mogo.size / 1024).toFixed(2)} KB)\n`;
    out += `  AS Version: ${mogo.asVersion || 'UNKNOWN'}\n`;
    out += `  Document Class: ${mogo.docClass || 'None'}\n`;
    out += `  Loads Login.swf: ${mogo.loadsLoginStatus || 'UNKNOWN'}\n`;
    out += `  Calls Login.init: ${mogo.callsLoginInitStatus || 'UNKNOWN'}\n`;
    if (mogo.evidenceLine) {
      out += `  Evidence Line: "${mogo.evidenceLine.trim()}"\n`;
    }
    out += '--------------------------------------------------------------------------------\n';
  }
  
  return out;
}
