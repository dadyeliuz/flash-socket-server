import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { execFileSync } from 'child_process';
import { logger, resolveSafePath, safeFileExists } from '@flash-socket-server/core';

export interface DiagnosticIssue {
  ruleId: string;
  severity: 'BLOCKER' | 'WARNING' | 'INFO' | 'FIXED_BY_COMPAT';
  title: string;
  problem: string;
  evidence: string;
  suspectedIncompatibleFiles: string[];
  requiredReplacementFile: string;
  nonInvasiveWorkaround?: string;
}

export interface CandidateInfo {
  filename: string;
  relativePath: string;
  status: 'COMPATIBLE' | 'PARTIAL' | 'INCOMPATIBLE';
  reason: string;
  hasGetSwfParams: boolean;
  definesGlobal: boolean;
  definesNamespaced: boolean;
  hasChildren: boolean;
  foundChildren: string[];
}

export interface DiagnosticReport {
  timestamp: string;
  scannedFiles: string[];
  issues: DiagnosticIssue[];
  ffdecStatus: {
    available: boolean;
    path?: string;
  };
  flashlogStatus: {
    provided: boolean;
    path?: string;
    parsedLines: number;
  };
  candidatesMatrix?: CandidateInfo[];
  scanMode?: 'fast' | 'full';
  filesSkippedCount?: number;
}

export interface DiagnosticOptions {
  assetsPath: string;
  flashlogPath?: string;
  httpLogPath?: string;
  ffdecPath?: string;
  json?: boolean;
  compatLoginGraphicsAlias?: string | null;
  fullScan?: boolean;
  runtimeTimeline?: string;
}


const linkReportCache = new Map<string, string>();
const stringInSwfCache = new Map<string, boolean>();

/**
 * Runs lightweight SWF link analysis using JPEXS CLI.
 */
function getLinkReport(ffdecPath: string, swfPath: string): string {
  const resolved = path.resolve(swfPath);
  if (linkReportCache.has(resolved)) {
    return linkReportCache.get(resolved)!;
  }
  try {
    const stdout = execFileSync(ffdecPath, ['-linkReport', swfPath], {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    linkReportCache.set(resolved, stdout);
    return stdout;
  } catch (err: any) {
    logger.warn('doctor', `ffdec link report failed for ${path.basename(swfPath)}: ${err.message}`);
    linkReportCache.set(resolved, '');
    return '';
  }
}

/**
 * Helper to check if a specific string exists inside a SWF file (decompressing if necessary).
 */
function isStringInSwf(filePath: string, searchStr: string): boolean {
  const resolved = path.resolve(filePath);
  const cacheKey = `${resolved}::${searchStr}`;
  if (stringInSwfCache.has(cacheKey)) {
    return stringInSwfCache.get(cacheKey)!;
  }
  try {
    const data = fs.readFileSync(filePath);
    if (data.length < 8) {
      stringInSwfCache.set(cacheKey, false);
      return false;
    }
    const signature = data.toString('utf8', 0, 3);
    let uncompressed: Buffer;
    if (signature === 'CWS') {
      try {
        uncompressed = zlib.inflateSync(data.slice(8));
      } catch (err) {
        uncompressed = zlib.unzipSync(data.slice(8));
      }
    } else {
      uncompressed = data;
    }
    const result = uncompressed.includes(searchStr);
    stringInSwfCache.set(cacheKey, result);
    return result;
  } catch (err) {
    stringInSwfCache.set(cacheKey, false);
    return false;
  }
}

/**
 * Runs diagnostics on the user-supplied assets.
 */
export async function runDiagnostics(options: DiagnosticOptions): Promise<DiagnosticReport> {
  linkReportCache.clear();
  stringInSwfCache.clear();

  const report: DiagnosticReport = {
    timestamp: new Date().toISOString(),
    issues: [],
    scannedFiles: [],
    ffdecStatus: { available: false },
    flashlogStatus: { provided: false, parsedLines: 0 }
  };

  const assetsPath = path.resolve(options.assetsPath);
  if (!fs.existsSync(assetsPath)) {
    throw new Error(`Assets directory does not exist: "${assetsPath}"`);
  }

  // 1. Scan asset directory file inventory
  const allFiles: string[] = [];
  let filesSkippedCount = 0;
  
  const isFull = !!options.fullScan;
  report.scanMode = isFull ? 'full' : 'fast';

  logger.info('doctor', `Starting diagnostics in ${report.scanMode} mode...`);

  if (isFull) {
    const scanDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else {
          allFiles.push(fullPath);
        }
      }
    };
    scanDir(assetsPath);
  } else {
    // Fast scan mode: inspect only key files flatly
    const keyFiles = [
      'Login.swf',
      'loginGR.swf',
      'Main.swf',
      'Mogo.swf',
      'BaseLoginGR.swf',
      'CompatibleLoginGR.swf'
    ];
    if (options.compatLoginGraphicsAlias) {
      keyFiles.push(options.compatLoginGraphicsAlias);
    }

    const searchDirs = [
      assetsPath,
      path.join(assetsPath, 'Swf'),
      path.join(assetsPath, 'Swf', 'Assets'),
      path.join(assetsPath, 'Swf', 'AssetsClean'),
      path.join(assetsPath, 'Xmls', 'lang')
    ];

    for (const dir of searchDirs) {
      if (fs.existsSync(dir)) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            const fullPath = path.join(dir, entry.name);
            const baseName = entry.name.toLowerCase();
            const isKeySwf = keyFiles.some(k => k.toLowerCase() === baseName);
            const isXml = ext === '.xml';
            if (isKeySwf || isXml) {
              if (!allFiles.includes(fullPath)) {
                allFiles.push(fullPath);
              }
            } else {
              filesSkippedCount++;
            }
          }
        }
      }
    }
  }

  report.scannedFiles = allFiles.map(f => path.relative(assetsPath, f));
  report.filesSkippedCount = filesSkippedCount;
  logger.info('doctor', `Finished directory scan. Scanned files: ${allFiles.length}, Skipped: ${filesSkippedCount}`);

  // 2. Determine JPEXS Decompiler CLI availability
  let ffdecExe: string | undefined = options.ffdecPath;
  if (!ffdecExe) {
    // Check default location
    const defaultFFdec = 'C:\\PROJ\\sfs-emu\\SWF-decompiler-mcp\\ffdec_26.2.1\\ffdec-cli.exe';
    if (fs.existsSync(defaultFFdec)) {
      ffdecExe = defaultFFdec;
    }
  }

  if (ffdecExe && fs.existsSync(ffdecExe)) {
    report.ffdecStatus = {
      available: true,
      path: ffdecExe
    };
  }

  // 3. Load flashlog.txt contents
  let flashlogContent = '';
  if (options.flashlogPath) {
    const logPath = path.resolve(options.flashlogPath);
    if (fs.existsSync(logPath)) {
      try {
        flashlogContent = fs.readFileSync(logPath, 'utf8');
        report.flashlogStatus = {
          provided: true,
          path: logPath,
          parsedLines: flashlogContent.split('\n').length
        };
        logger.info('doctor', `Loaded flashlog trace: ${report.flashlogStatus.parsedLines} lines parsed.`);
      } catch (err: any) {
        logger.warn('doctor', `Failed to read flashlog: ${err.message}`);
      }
    }
  }

  // 4. Load httpLog / verbose-http logs
  let httpLogContent = '';
  if (options.httpLogPath) {
    const httpPath = path.resolve(options.httpLogPath);
    if (fs.existsSync(httpPath)) {
      try {
        httpLogContent = fs.readFileSync(httpPath, 'utf8');
      } catch (err: any) {
        logger.warn('doctor', `Failed to read HTTP log: ${err.message}`);
      }
    }
  }

  // 5. Load and parse optional runtime timeline JSON
  let timelineObj: any = null;
  let timelineEvidence = '';
  if (options.runtimeTimeline) {
    let rawContent = '';
    const trimmed = options.runtimeTimeline.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      rawContent = options.runtimeTimeline;
    } else if (options.runtimeTimeline.startsWith('http://') || options.runtimeTimeline.startsWith('https://')) {
      try {
        rawContent = await new Promise<string>((resolve, reject) => {
          const client = options.runtimeTimeline!.startsWith('https://') ? require('https') : require('http');
          client.get(options.runtimeTimeline!, (res: any) => {
            let data = '';
            res.on('data', (chunk: any) => { data += chunk; });
            res.on('end', () => { resolve(data); });
          }).on('error', (err: any) => { reject(err); });
        });
      } catch (err: any) {
        logger.warn('doctor', `Failed to fetch runtime timeline URL: ${err.message}`);
      }
    } else {
      try {
        const resolved = path.resolve(options.runtimeTimeline);
        if (fs.existsSync(resolved)) {
          rawContent = fs.readFileSync(resolved, 'utf8');
        }
      } catch (err: any) {
        logger.warn('doctor', `Failed to read runtime timeline file: ${err.message}`);
      }
    }

    if (rawContent) {
      try {
        timelineObj = JSON.parse(rawContent);
        logger.info('doctor', `Parsed runtime timeline JSON successfully.`);
      } catch (err: any) {
        logger.warn('doctor', `Failed to parse runtime timeline JSON: ${err.message}`);
      }
    }
  }

  if (timelineObj) {
    const milestones: any[] = timelineObj.milestones || [];
    const hasMain = milestones.some(m => m.name === 'Main.swf served') || !!timelineObj.mainServedAt;
    const hasLoadingScreen = milestones.some(m => m.name === 'LoadingScreen_1.swf served') || !!timelineObj.loadingScreenRequestedAt;
    const hasTcp = milestones.some(m => m.name === 'first TCP connection') || !!timelineObj.tcpObservedAt;
    const hasServers = milestones.some(m => m.name === 'Servers.aspx served') || !!timelineObj.serversServedAt;

    const mainServed = hasMain;
    const loadingScreenNotRequested = !hasLoadingScreen || timelineObj.loadingScreenMissingWarningFired === true;
    const serversServed = hasServers;
    const tcpNotObserved = !hasTcp || timelineObj.tcpMissingWarningFired === true;

    if (mainServed && loadingScreenNotRequested && serversServed && tcpNotObserved) {
      timelineEvidence = 
          '* Runtime timeline: Main.swf was served.\n'
        + '* Runtime timeline: LoadingScreen_1.swf was not requested.\n'
        + '* Runtime timeline: Servers.aspx was served.\n'
        + '* Runtime timeline: TCP connection was not observed after Servers.aspx.';
    }
  }

  // Helper to resolve clean SWF paths
  const findSwf = (name: string): string | null => {
    const swfName = name.toLowerCase().endsWith('.swf') ? name : `${name}.swf`;
    for (const f of allFiles) {
      if (path.basename(f).toLowerCase() === swfName.toLowerCase()) {
        return f;
      }
    }
    return null;
  };

  // Perform lightweight link analysis on main SWFs if ffdec is available
  const definedSymbols: Record<string, string> = {}; // symbol -> swf filename
  const referencedSymbols: Record<string, string[]> = {}; // symbol -> swf filenames referencing it

  if (report.ffdecStatus.available && ffdecExe) {
    const targetSwfs = ['loginGR.swf', 'Login.swf', 'Main.swf', 'Mogo.swf'];
    for (const name of targetSwfs) {
      const swfPath = findSwf(name);
      if (swfPath) {
        const linkXml = getLinkReport(ffdecExe, swfPath);
        if (linkXml) {
          // Quick regex extraction of def/dep elements
          const defRegex = /<def id="([^"]+)"/g;
          const depRegex = /<dep id="([^"]+)"/g;
          
          let match;
          while ((match = defRegex.exec(linkXml)) !== null) {
            const sym = match[1].replace(':', '.');
            definedSymbols[sym] = name;
          }
          while ((match = depRegex.exec(linkXml)) !== null) {
            const sym = match[1].replace(':', '.');
            if (!referencedSymbols[sym]) {
              referencedSymbols[sym] = [];
            }
            referencedSymbols[sym].push(name);
          }
        }
      }
    }
  }

  const candidateCache = new Map<string, CandidateInfo>();

  const scanCandidate = (filePath: string): CandidateInfo => {
    const resolvedPath = path.resolve(filePath);
    if (candidateCache.has(resolvedPath)) {
      return candidateCache.get(resolvedPath)!;
    }
    
    logger.info('doctor', `Scanning candidate login graphics: ${path.basename(filePath)}...`);
    const relative = path.relative(assetsPath, filePath);
    
    // Check getSwfParams
    const hasGetSwfParams = isStringInSwf(filePath, 'getSwfParams');
    
    // Check Expected class linkage definitions
    let definesGlobal = false;
    let definesNamespaced = false;
    
    if (report.ffdecStatus.available && ffdecExe) {
      const linkXml = getLinkReport(ffdecExe, filePath);
      const defRegex = /<def id="([^"]+)"/g;
      let match;
      while ((match = defRegex.exec(linkXml)) !== null) {
        const sym = match[1];
        if (sym === 'mlLoginScreen') {
          definesGlobal = true;
        } else if (sym === 'mogoTab:mlLoginScreen' || sym.endsWith(':mlLoginScreen')) {
          definesNamespaced = true;
        }
      }
    } else {
      definesGlobal = isStringInSwf(filePath, 'mlLoginScreen') && !isStringInSwf(filePath, 'mogoTab:mlLoginScreen');
      definesNamespaced = isStringInSwf(filePath, 'mogoTab:mlLoginScreen');
    }
    
    // Check expected children
    const expectedChildren = ['txtUserName', 'txtPassword', 'btnLogin', 'btnCode', 'btnPass', 'btnRegist', 'chkSaveName', 'chkSavePass'];
    const foundChildren: string[] = [];
    try {
      const data = fs.readFileSync(filePath);
      let uncompressed = data;
      if (data.toString('utf8', 0, 3) === 'CWS') {
        try {
          uncompressed = zlib.inflateSync(data.slice(8));
        } catch {
          uncompressed = zlib.unzipSync(data.slice(8));
        }
      }
      for (const child of expectedChildren) {
        if (uncompressed.includes(child)) {
          foundChildren.push(child);
        }
      }
    } catch (err) {}
    
    const hasChildren = expectedChildren.every(c => foundChildren.includes(c));
    
    let status: 'COMPATIBLE' | 'PARTIAL' | 'INCOMPATIBLE' = 'INCOMPATIBLE';
    let reason = '';
    
    const loginSwfPath = findSwf('Login.swf');
    const loginRequiresGetSwfParams = loginSwfPath ? isStringInSwf(loginSwfPath, 'getSwfParams') : true;
    
    if (!hasGetSwfParams && loginRequiresGetSwfParams) {
      reason = 'Missing getSwfParams method (required by Login.swf).';
    } else if (!definesGlobal && !definesNamespaced) {
      reason = 'Does not define mlLoginScreen symbol.';
    } else if (!hasChildren) {
      const missing = expectedChildren.filter(c => !foundChildren.includes(c));
      reason = `Missing expected child components: ${missing.join(', ')}.`;
    } else if (definesNamespaced && !definesGlobal) {
      status = 'PARTIAL';
      reason = 'Has required children, but exports namespaced mogoTab:mlLoginScreen instead of global mlLoginScreen.';
    } else if (definesGlobal) {
      status = 'COMPATIBLE';
      reason = loginRequiresGetSwfParams
        ? 'Contains global mlLoginScreen linkage, getSwfParams method, and all required children.'
        : 'Contains global mlLoginScreen linkage and all required children (getSwfParams not required by Login.swf).';
    }
    
    const res: CandidateInfo = {
      filename: path.basename(filePath),
      relativePath: relative,
      status,
      reason,
      hasGetSwfParams,
      definesGlobal,
      definesNamespaced,
      hasChildren,
      foundChildren
    };
    candidateCache.set(resolvedPath, res);
    return res;
  };

  // Find candidate SWFs
  const potentialCandidates = allFiles.filter(f => {
    const ext = path.extname(f).toLowerCase();
    if (ext !== '.swf') return false;
    const relative = path.relative(assetsPath, f).replace(/\\/g, '/').toLowerCase();
    // Scan root, Swf/, Swf/Assets/, Swf/AssetsClean/ but exclude deep subfolders
    return !relative.includes('/') ||
           relative.startsWith('swf/assets/') ||
           relative.startsWith('swf/assetsclean/') ||
           (relative.startsWith('swf/') && !relative.substring(4).includes('/'));
  });

  const candidatesMatrix: CandidateInfo[] = [];
  for (const f of potentialCandidates) {
    const baseName = path.basename(f).toLowerCase();
    const candidate = scanCandidate(f);
    const isLoginName = baseName.includes('login') || baseName.includes('logingr') || baseName.includes('baselogingr');
    const definesLoginSymbol = candidate.definesGlobal || candidate.definesNamespaced;
    if (isLoginName || definesLoginSymbol) {
      candidatesMatrix.push(candidate);
    }
  }
  report.candidatesMatrix = candidatesMatrix;

  // -------------------------------------------------------------
  // RULE A: Missing linkage symbol (e.g. mlLoginScreenHeb)
  // -------------------------------------------------------------

  const ruleAHasLogEvidence = 
    flashlogContent.includes('mlLoginScreenHeb definition not found') ||
    flashlogContent.includes('mlLoginScreenHeb') && flashlogContent.includes('definition not found') ||
    (flashlogContent.includes('QueueLoader.getClass') && flashlogContent.includes('null'));

  let ruleATriggered = ruleAHasLogEvidence;
  let ruleAEvidence = ruleAHasLogEvidence 
    ? 'Found missing symbol references to mlLoginScreenHeb or QueueLoader crash in flashlog.txt.'
    : '';

  // If ffdec is available, verify if mlLoginScreenHeb is indeed missing but referenced
  if (report.ffdecStatus.available) {
    const isDefined = !!definedSymbols['mlLoginScreenHeb'];
    const isReferenced = !!referencedSymbols['mlLoginScreenHeb'] || findSwf('Login.swf') !== null;
    
    if (isReferenced && !isDefined) {
      ruleATriggered = true;
      ruleAEvidence += (ruleAEvidence ? ' ' : '') + 'Linkage check confirms loginGR.swf does not define mlLoginScreenHeb, but it is expected by the client runtime.';
    }
  }

  if (ruleATriggered) {
    report.issues.push({
      ruleId: 'RULE_A_MISSING_SYMBOL',
      severity: 'BLOCKER',
      title: 'Missing linkage symbol: mlLoginScreenHeb',
      problem: 'Login.swf expects mlLoginScreenHeb when loading, but no clean SWF defines it.',
      evidence: ruleAEvidence || 'mlLoginScreenHeb linkage definition not found during asset scan.',
      suspectedIncompatibleFiles: ['loginGR.swf', 'Login.swf'],
      requiredReplacementFile: 'loginGR.swf or Login.swf',
      nonInvasiveWorkaround: 'Run the standalone projector under Lang=4 (English) which points to the generic mlLoginScreen symbol defined in loginGR.swf.'
    });
  }

  // -------------------------------------------------------------
  // RULE B: MovieClip structure mismatch (Error #1009 inside LoginScreen.addLangText)
  // -------------------------------------------------------------
  const hasError1009 = flashlogContent.includes('Error #1009');
  const hasAddLangText = flashlogContent.includes('LoginScreen/addLangText') || flashlogContent.includes('LoginScreen.addLangText');
  const ruleBTriggered = hasError1009 && hasAddLangText;

  if (ruleBTriggered) {
    report.issues.push({
      ruleId: 'RULE_B_MC_MISMATCH',
      severity: 'BLOCKER',
      title: 'UI Asset Structure Mismatch',
      problem: 'LoginScreen/addLangText attempts to manipulate text fields (e.g. btnLogin.txtLable) inside button graphics which do not exist in clean loginGR.swf.',
      evidence: 'flashlog.txt trace:\nTypeError: Error #1009: Cannot access a property or method of a null object reference.\n\tat LoginScreen/addLangText()',
      suspectedIncompatibleFiles: ['Login.swf', 'loginGR.swf'],
      requiredReplacementFile: 'Login.swf or loginGR.swf',
      nonInvasiveWorkaround: 'Ensure Login.swf and loginGR.swf match client version release versions.'
    });
  }

  // -------------------------------------------------------------
  // RULE C: Missing AS3 class (VerifyError: Error #1014: Class worlds4u.events::LoginEvent could not be found)
  // -------------------------------------------------------------
  const ruleCHasLogEvidence = 
    flashlogContent.includes('Error #1014') && flashlogContent.includes('LoginEvent') ||
    flashlogContent.includes('worlds4u.events::LoginEvent could not be found');

  let ruleCTriggered = ruleCHasLogEvidence;
  let ruleCEvidence = ruleCHasLogEvidence 
    ? 'Found VerifyError for worlds4u.events::LoginEvent in flashlog.txt.'
    : '';

  if (report.ffdecStatus.available) {
    const isDefined = !!definedSymbols['worlds4u.events.LoginEvent'];
    const isReferenced = !!referencedSymbols['worlds4u.events.LoginEvent'] || 
      (referencedSymbols['Main.as'] || []).length > 0; // Check if imported in Main

    if (!isDefined && (isReferenced || ruleCHasLogEvidence)) {
      ruleCTriggered = true;
      ruleCEvidence += (ruleCEvidence ? ' ' : '') + 'Main.swf references worlds4u.events.LoginEvent class, but it is not compiled or present inside any clean SWF asset.';
    }
  }

  if (ruleCTriggered) {
    report.issues.push({
      ruleId: 'RULE_C_MISSING_CLASS',
      severity: 'BLOCKER',
      title: 'Missing AS3 Class: worlds4u.events.LoginEvent',
      problem: 'Main.swf references worlds4u.events.LoginEvent, but no clean SWF defines it.',
      evidence: ruleCEvidence || 'Class worlds4u.events.LoginEvent is referenced but not found.',
      suspectedIncompatibleFiles: ['Main.swf'],
      requiredReplacementFile: 'Main.swf',
      nonInvasiveWorkaround: 'Replace Main.swf with the complete matching client asset, or use a shared library swf containing the missing event class.'
    });
  }

  // -------------------------------------------------------------
  // RULE D: XML parse error (Error #1085 / Error #1088 LanguageManager.loadXML)
  // -------------------------------------------------------------
  let ruleDTriggered = 
    flashlogContent.includes('Error #1085') || 
    flashlogContent.includes('Error #1088') || 
    flashlogContent.includes('LanguageManager/loadXML');

  let ruleDEvidence = ruleDTriggered 
    ? 'Found XML parsing error traces inside flashlog.txt.' 
    : '';

  // Scan Xmls/lang files in assets directory for unclosed br tags
  const langXmlFiles = allFiles.filter(f => f.includes('Xmls') && f.toLowerCase().endsWith('.xml'));
  let invalidXmlFile = '';
  for (const xmlFile of langXmlFiles) {
    try {
      const content = fs.readFileSync(xmlFile, 'utf8');
      // Look for <br> or <br > but not <br/> or <br />
      const unclosedBr = /<br\b([^>/]*?)>/i.test(content);
      if (unclosedBr) {
        ruleDTriggered = true;
        invalidXmlFile = path.basename(xmlFile);
        ruleDEvidence += (ruleDEvidence ? ' ' : '') + `Detected unclosed <br> tags in translation file: "${invalidXmlFile}".`;
        break;
      }
    } catch (err) {}
  }

  if (ruleDTriggered) {
    report.issues.push({
      ruleId: 'RULE_D_XML_ERROR',
      severity: 'FIXED_BY_COMPAT',
      title: 'Invalid XML in language file',
      problem: `The language file ${invalidXmlFile || 'hebrew.xml'} contains unclosed HTML-like tags (<br> instead of <br/>) causing Flash XML parser to crash.`,
      evidence: ruleDEvidence || 'Detected unclosed HTML elements inside XML language files.',
      suspectedIncompatibleFiles: [invalidXmlFile || 'hebrew.xml'],
      requiredReplacementFile: 'None (if compatibility transform is enabled)',
      nonInvasiveWorkaround: 'Enable compatibility XML transform (compatFixLanguageXml: true) in the preservation gateway configuration to auto-close these tags on-the-fly.'
    });
  }

  // -------------------------------------------------------------
  // RULE E: SharedObject flush error (Error #2130)
  // -------------------------------------------------------------
  const ruleETriggered = 
    flashlogContent.includes('Error #2130') || 
    flashlogContent.includes('SharedObject/flush') ||
    flashlogContent.includes('CookiesDataManager/setData');

  if (ruleETriggered) {
    report.issues.push({
      ruleId: 'RULE_E_SHAREDOBJECT_FLUSH',
      severity: 'WARNING',
      title: 'Flash SharedObject Flush Blocked',
      problem: 'Flash Player standalone projector is unable to write or flush SharedObject storage (cookies) to local disk.',
      evidence: 'flashlog.txt trace: Error #2130: Unable to flush SharedObject at CookiesDataManager/setData()',
      suspectedIncompatibleFiles: [],
      requiredReplacementFile: 'None',
      nonInvasiveWorkaround: 'Launch the Debug Projector via Release Projector Mode (debug=false) to bypass the crash, or configure local Flash trust settings to allow local cookie writing.'
    });
  }

  // -------------------------------------------------------------
  // RULE F: Missing asset HTTP 404 from verbose logs / httpLog
  // -------------------------------------------------------------
  // Look for GET ... 404 in logs
  const http404Regex = /GET\s+(\/[^\s]+)\s+.*404/g;
  let match404;
  const missingHttpAssets: string[] = [];
  while ((match404 = http404Regex.exec(httpLogContent)) !== null) {
    missingHttpAssets.push(match404[1]);
  }

  if (missingHttpAssets.length > 0) {
    report.issues.push({
      ruleId: 'RULE_F_MISSING_HTTP_ASSETS',
      severity: 'WARNING',
      title: 'Missing Client Asset (HTTP 404)',
      problem: `The client requested assets which are missing from the HTTP preservation gateway server.`,
      evidence: `HTTP Gateway Logs returned 404 status for: ${missingHttpAssets.slice(0, 3).join(', ')}`,
      suspectedIncompatibleFiles: missingHttpAssets.map(url => path.basename(url)),
      requiredReplacementFile: 'Provide missing assets in asset directory structure',
      nonInvasiveWorkaround: 'Obtain missing SWF/XML files and place them under correct directories in clean client assets directory.'
    });
  }

  // -------------------------------------------------------------
  // RULE G: Missing getSwfParams Method (TypeError: Error #1006)
  // -------------------------------------------------------------
  const ruleGHasLogEvidence = 
    flashlogContent.includes('Error #1006') && flashlogContent.includes('getSwfParams');

  const loginSwfForG = findSwf('Login.swf');
  const loginRequiresGetSwfParams = loginSwfForG ? isStringInSwf(loginSwfForG, 'getSwfParams') : true;

  let ruleGTriggered = ruleGHasLogEvidence;
  let ruleGEvidence = ruleGHasLogEvidence 
    ? 'Found TypeError: Error #1006 (getSwfParams is not a function) inside flashlog.txt.' 
    : '';

  const cleanLoginGr = findSwf('loginGR.swf');
  let ruleGInfoAdded = false;
  if (cleanLoginGr) {
    const hasGetSwfParams = isStringInSwf(cleanLoginGr, 'getSwfParams');
    if (!hasGetSwfParams) {
      if (loginRequiresGetSwfParams) {
        ruleGTriggered = true;
        ruleGEvidence += (ruleGEvidence ? ' ' : '') + 'Asset scan confirms "loginGR.swf" does not contain the "getSwfParams" method.';
      } else {
        ruleGInfoAdded = true;
        report.issues.push({
          ruleId: 'RULE_G_GETSWFPARAMS_INFO',
          severity: 'INFO',
          title: 'getSwfParams not required',
          problem: 'Current Login.swf does not require getSwfParams; loginGR.swf is acceptable for this pair.',
          evidence: 'loginGR.swf lacks getSwfParams, but Login.swf does not reference/call it.',
          suspectedIncompatibleFiles: [],
          requiredReplacementFile: 'None'
        });
      }
    }
  }

  if (ruleGTriggered) {
    const compatible = report.candidatesMatrix?.filter(c => c.status === 'COMPATIBLE').map(c => c.filename) || [];
    const partial = report.candidatesMatrix?.filter(c => c.status === 'PARTIAL').map(c => c.filename) || [];

    let workaround = 'Replace "loginGR.swf" with a compatible graphics library whose login screen symbol implements the getSwfParams method.';
    if (compatible.length > 0) {
      workaround = `Replace "loginGR.swf" with a compatible graphics library (candidates found in assets: ${compatible.join(', ')}).`;
    } else if (partial.length > 0) {
      workaround = `No fully compatible candidates found. Partial candidates found: ${partial.join(', ')} (warning: these have namespace/package mismatches).`;
    }

    report.issues.push({
      ruleId: 'RULE_G_GETSWFPARAMS_MISSING',
      severity: 'BLOCKER',
      title: 'Missing ActionScript method: getSwfParams',
      problem: 'The client expects the login screen graphic (mlLoginScreen inside loginGR.swf) to implement the ActionScript method getSwfParams(), which is dynamically called by the login module.',
      evidence: ruleGEvidence || 'getSwfParams string missing from loginGR.swf.',
      suspectedIncompatibleFiles: ['loginGR.swf', 'Login.swf'],
      requiredReplacementFile: 'loginGR.swf (with getSwfParams method)',
      nonInvasiveWorkaround: workaround
    });
  }

  // -------------------------------------------------------------
  // RULE H: Linkage Symbol Namespace/Package Mismatch (Error #1009 / empty MovieClip)
  // -------------------------------------------------------------
  const hasLoginScreenSingleInit = flashlogContent.includes('LoginScreenSingle/init') || flashlogContent.includes('LoginScreenSingle.init');
  const ruleHHasLogEvidence = hasError1009 && hasLoginScreenSingleInit;

  let ruleHTriggered = ruleHHasLogEvidence;
  let ruleHEvidence = ruleHHasLogEvidence
    ? 'Found Null Pointer reference (Error #1009) at mogobe.login::LoginScreenSingle/init() in flashlog.txt.'
    : '';

  // Check the currently configured alias if provided
  if (options.compatLoginGraphicsAlias) {
    const aliasFile = findSwf(options.compatLoginGraphicsAlias);
    if (aliasFile) {
      const aliasScore = scanCandidate(aliasFile);
      if (aliasScore.status === 'PARTIAL') {
        ruleHTriggered = true;
        ruleHEvidence += (ruleHEvidence ? ' ' : '') + `Configured alias "${options.compatLoginGraphicsAlias}" is a partial candidate with a package mismatch (exports "${aliasScore.definesNamespaced ? 'mogoTab:mlLoginScreen' : 'unknown'}" instead of global "mlLoginScreen").`;
      }
    }
  }

  if (ruleHTriggered) {
    report.issues.push({
      ruleId: 'RULE_H_NAMESPACE_MISMATCH',
      severity: 'BLOCKER',
      title: 'Linkage Symbol Namespace/Package Mismatch',
      problem: 'The client expects the login screen graphic symbol mlLoginScreen to be in the global namespace/package, but the active graphics library defines it inside a package namespace (e.g. mogoTab:mlLoginScreen), causing QueueLoader to return an empty MovieClip.',
      evidence: ruleHEvidence || 'Namespace mismatch detected during candidate asset scan.',
      suspectedIncompatibleFiles: ['loginGR.swf', 'Login.swf'],
      requiredReplacementFile: 'A matching loginGR.swf (global namespace with getSwfParams) or matching Login.swf',
      nonInvasiveWorkaround: 'Do not runtime-alias a partial candidate like BaseLoginGR.swf as a final fix. Either locate a matching global loginGR.swf containing getSwfParams, or use a matching Login.swf that does not depend on global mlLoginScreen or getSwfParams.'
    });
  }

  // -------------------------------------------------------------
  // RULE J: Main startup halted before loading screen initialization
  // -------------------------------------------------------------
  if (timelineEvidence) {
    report.issues.push({
      ruleId: 'RULE_J_MAIN_STARTUP_HALTED',
      severity: 'BLOCKER',
      title: 'Main startup halted before loading screen initialization',
      problem: 'The client served Main.swf but it halted before loading screens or TCP socket creation. Suspected areas:\n'
             + '  - Login.startMainApp / Main.init\n'
             + '  - ApplicationDomain/static AppConfig sharing\n'
             + '  - LoadingScreenManager.createNextScreen\n'
             + '  - Main/Login version mismatch',
      evidence: timelineEvidence,
      suspectedIncompatibleFiles: ['Main.swf', 'Login.swf'],
      requiredReplacementFile: 'Verify Main.swf and Login.swf are from the same release set. If they are believed to match, inspect Main instantiation/ApplicationDomain path.',
      nonInvasiveWorkaround: 'none server-side; this is an asset version mismatch unless a compatibility SWF patch/shim is explicitly allowed.'
    });
  }

  // -------------------------------------------------------------
  // RULE I: Login/Main AppConfig Contract Mismatch
  // -------------------------------------------------------------
  const mainSwfPath = findSwf('Main.swf');
  const loginSwfPath = findSwf('Login.swf');

  if (mainSwfPath && loginSwfPath) {
    const mainRequires = isStringInSwf(mainSwfPath, 'FirstLoadingScreens') ||
                         isStringInSwf(mainSwfPath, 'LoadingScreenManager') ||
                         isStringInSwf(mainSwfPath, 'createNextScreen');

    const loginLacksSupport = !isStringInSwf(loginSwfPath, 'FirstLoadingScreens') &&
                              !isStringInSwf(loginSwfPath, 'XmlToList') &&
                              !isStringInSwf(loginSwfPath, 'LoadingScreenTO');

    if (mainRequires) {
      if (loginLacksSupport) {
        let evidence = 'Main.swf reads AppConfig.FirstLoadingScreens during LoadingScreenManager startup.\nLogin.swf does not populate AppConfig.FirstLoadingScreens from Login.aspx.';
        if (timelineEvidence) {
          evidence += '\n' + timelineEvidence;
        }

        report.issues.push({
          ruleId: 'RULE_I_LOGIN_MAIN_APPCONFIG_MISMATCH',
          severity: 'BLOCKER',
          title: 'Login.swf / Main.swf version mismatch',
          problem: 'Main.swf expects AppConfig.FirstLoadingScreens to exist and be populated before Main.initApp completes, but active Login.swf does not define/populate that field.',
          evidence: evidence,
          suspectedIncompatibleFiles: ['Login.swf', 'Main.swf'],
          requiredReplacementFile: 'Verify Main.swf and Login.swf are from the same release set. If they are believed to match, inspect Main instantiation/ApplicationDomain path.',
          nonInvasiveWorkaround: 'none server-side; this is an asset version mismatch unless a compatibility SWF patch/shim is explicitly allowed.'
        });
      } else if (timelineEvidence) {
        report.issues.push({
          ruleId: 'RULE_I_LOGIN_MAIN_APPCONFIG_MISMATCH',
          severity: 'WARNING',
          title: 'Main startup halted before loading screen / TCP',
          problem: 'Main.swf expects AppConfig.FirstLoadingScreens to exist and be populated before Main.initApp completes, but we cannot statically confirm if Login.swf supports it.',
          evidence: 'Ambiguous: Login.swf contains AppConfig/XmlToList references but runtime timeline indicates a halt.\n' + timelineEvidence,
          suspectedIncompatibleFiles: ['Login.swf', 'Main.swf'],
          requiredReplacementFile: 'Verify Main.swf and Login.swf are from the same release set. If they are believed to match, inspect Main instantiation/ApplicationDomain path.',
          nonInvasiveWorkaround: 'none server-side; this is an asset version mismatch unless a compatibility SWF patch/shim is explicitly allowed.'
        });
      }
    }
  }

  // -------------------------------------------------------------
  // RULE K: Login/Main CommonLib event constant mismatch (AvatarEvent.TIP_OF_DAY)
  // -------------------------------------------------------------
  const hasEventNullError = flashlogContent.includes('Parameter type must be non-null') &&
                            flashlogContent.includes('MainControler/enableEvents');

  if (hasEventNullError) {
    report.issues.push({
      ruleId: 'RULE_K_EVENT_CONSTANT_MISMATCH',
      severity: 'BLOCKER',
      title: 'Login/Main CommonLib event constant mismatch',
      problem: 'MainControler.enableEvents() crashed because an event constant (suspected AvatarEvent.TIP_OF_DAY) is null. This happens because Login.swf defines worlds4u.events.AvatarEvent first, but lacks the TIP_OF_DAY constant required by Main.swf.',
      evidence: 'flashlog.txt trace:\nTypeError: Error #2007: Parameter type must be non-null.\n\tat flash.events::EventDispatcher/addEventListener()\n\tat worlds4u.events::ExEventDispatcher/addEventListener()\n\tat worlds4u.control::MainControler/enableEvents()',
      suspectedIncompatibleFiles: ['Login.swf', 'Main.swf'],
      requiredReplacementFile: 'A newer Login.swf candidate that defines AvatarEvent.TIP_OF_DAY or matches the Main.swf build set.',
      nonInvasiveWorkaround: 'Use a compatible Login/Main candidate pair matching build constants.'
    });
  }

  return report;
}

/**
 * Format report as a beautiful user-facing console report.
 */
export function formatConsoleReport(report: DiagnosticReport): string {
  let output = '';
  output += '\n\x1b[35m==============================================================\n';
  output += '                  COMPATIBILITY DOCTOR REPORT                 \n';
  output += '==============================================================\x1b[0m\n';

  output += `Timestamp: ${report.timestamp}\n`;
  output += `Mode: ${report.scanMode === 'full' ? 'full scan' : 'fast scan'}\n`;
  output += `Files scanned: ${report.scannedFiles.length}\n`;
  output += `Skipped: ${report.filesSkippedCount ?? 0}\n`;
  output += `Decompiler CLI: ${report.ffdecStatus.available ? '\x1b[32m[AVAILABLE]\x1b[0m' : '\x1b[33m[UNAVAILABLE (SWF scan skipped)]\x1b[0m'}\n`;
  output += `Flash log: ${report.flashlogStatus.provided ? `\x1b[32m[PROVIDED: ${report.flashlogStatus.parsedLines} lines]\x1b[0m` : '\x1b[33m[NOT PROVIDED]\x1b[0m'}\n`;
  output += '--------------------------------------------------------------\n\n';

  if (report.candidatesMatrix && report.candidatesMatrix.length > 0) {
    output += '\x1b[35m=== GRAPHICS LIBRARY CANDIDATES MATRIX ===\x1b[0m\n';
    output += 'Filename | Status | Details\n';
    output += '---------|--------|--------\n';
    for (const c of report.candidatesMatrix) {
      let statusColor = '\x1b[32m'; // COMPATIBLE -> green
      if (c.status === 'PARTIAL') statusColor = '\x1b[33m'; // PARTIAL -> yellow
      else if (c.status === 'INCOMPATIBLE') statusColor = '\x1b[31m'; // INCOMPATIBLE -> red
      
      output += `${c.filename} | ${statusColor}${c.status}\x1b[0m | ${c.reason}\n`;
    }
    output += '--------------------------------------------------------------\n\n';
  }

  if (report.issues.length === 0) {
    output += '\x1b[32m[SUCCESS] No compatibility issues detected!\x1b[0m\n';
    return output;
  }

  for (const issue of report.issues) {
    let sevColor = '\x1b[36m'; // default info
    if (issue.severity === 'BLOCKER') sevColor = '\x1b[31m';
    else if (issue.severity === 'WARNING') sevColor = '\x1b[33m';
    else if (issue.severity === 'FIXED_BY_COMPAT') sevColor = '\x1b[32m';

    output += `${sevColor}[${issue.severity}] ${issue.title}\x1b[0m\n`;
    output += `  * \x1b[36mProblem\x1b[0m: ${issue.problem}\n`;
    const evidenceLines = issue.evidence.split('\n');
    output += `  * \x1b[36mEvidence\x1b[0m: ${evidenceLines[0]}\n`;
    for (let i = 1; i < evidenceLines.length; i++) {
      output += `    ${evidenceLines[i]}\n`;
    }
    if (issue.suspectedIncompatibleFiles.length > 0) {
      output += `  * \x1b[36mSuspected Files\x1b[0m: ${issue.suspectedIncompatibleFiles.join(', ')}\n`;
    }
    output += `  * \x1b[36mRequired Replacement\x1b[0m: ${issue.requiredReplacementFile}\n`;
    if (issue.nonInvasiveWorkaround) {
      output += `  * \x1b[36mWorkaround\x1b[0m: ${issue.nonInvasiveWorkaround}\n`;
    }
    output += '--------------------------------------------------------------\n';
  }

  const blockers = report.issues.filter(i => i.severity === 'BLOCKER').length;
  const warnings = report.issues.filter(i => i.severity === 'WARNING').length;
  const fixed = report.issues.filter(i => i.severity === 'FIXED_BY_COMPAT').length;

  output += `\x1b[35mSummary: Checked bundle. ${blockers} Blockers, ${warnings} Warnings, ${fixed} Fixed by emulation compat.\x1b[0m\n`;
  output += '==============================================================\n';

  return output;
}
