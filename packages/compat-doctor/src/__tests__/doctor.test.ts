import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { runDiagnostics, formatConsoleReport } from '../doctor';

describe('Compatibility Doctor Diagnostics Engine', () => {
  const tempDir = path.resolve(__dirname, 'temp_doctor_test_assets');
  const flashlogPath = path.join(tempDir, 'flashlog.txt');
  const httpLogPath = path.join(tempDir, 'http.log');
  const langDir = path.join(tempDir, 'Xmls', 'lang');

  beforeAll(() => {
    fs.mkdirSync(langDir, { recursive: true });
    
    // Create some dummy swf files just to list in scannedFiles
    fs.writeFileSync(path.join(tempDir, 'Login.swf'), 'dummy swf content');
    fs.writeFileSync(path.join(tempDir, 'loginGR.swf'), 'dummy swf content containing getSwfParams');
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should degrade gracefully if only assets and no flashlog are provided', async () => {
    const report = await runDiagnostics({
      assetsPath: tempDir,
      ffdecPath: 'non-existent-path'
    });

    expect(report.scannedFiles.length).toBeGreaterThanOrEqual(2);
    expect(report.issues.length).toBe(0);
    expect(report.flashlogStatus.provided).toBe(false);
  });

  it('should detect Rule A: Missing linkage symbol from flashlog', async () => {
    fs.writeFileSync(flashlogPath, 'mlLoginScreenHeb definition not found\nQueueLoader.getClass()', 'utf8');

    const report = await runDiagnostics({
      assetsPath: tempDir,
      flashlogPath,
      ffdecPath: 'non-existent-path'
    });

    const ruleAIssues = report.issues.filter(i => i.ruleId === 'RULE_A_MISSING_SYMBOL');
    expect(ruleAIssues.length).toBe(1);
    expect(ruleAIssues[0].severity).toBe('BLOCKER');
    expect(ruleAIssues[0].suspectedIncompatibleFiles).toContain('loginGR.swf');
  });

  it('should detect Rule B: MovieClip structure mismatch from flashlog', async () => {
    fs.writeFileSync(flashlogPath, 'TypeError: Error #1009: Cannot access a property or method of a null object reference.\n at LoginScreen/addLangText()', 'utf8');

    const report = await runDiagnostics({
      assetsPath: tempDir,
      flashlogPath,
      ffdecPath: 'non-existent-path'
    });

    const ruleBIssues = report.issues.filter(i => i.ruleId === 'RULE_B_MC_MISMATCH');
    expect(ruleBIssues.length).toBe(1);
    expect(ruleBIssues[0].severity).toBe('BLOCKER');
    expect(ruleBIssues[0].suspectedIncompatibleFiles).toContain('Login.swf');
  });

  it('should detect Rule C: Missing AS3 Class from flashlog', async () => {
    fs.writeFileSync(flashlogPath, 'VerifyError: Error #1014: Class worlds4u.events::LoginEvent could not be found', 'utf8');

    const report = await runDiagnostics({
      assetsPath: tempDir,
      flashlogPath,
      ffdecPath: 'non-existent-path'
    });

    const ruleCIssues = report.issues.filter(i => i.ruleId === 'RULE_C_MISSING_CLASS');
    expect(ruleCIssues.length).toBe(1);
    expect(ruleCIssues[0].severity).toBe('BLOCKER');
    expect(ruleCIssues[0].suspectedIncompatibleFiles).toContain('Main.swf');
  });

  it('should detect Rule D: XML parse error from hebrew.xml', async () => {
    // Empty the flashlog
    fs.writeFileSync(flashlogPath, '', 'utf8');

    // Create an invalid XML file (contains <br> tag without closing slash)
    fs.writeFileSync(
      path.join(langDir, 'hebrew.xml'),
      '<?xml version="1.0" encoding="utf-8"?><Root><Msg>Line 1 <br> Line 2</Msg></Root>',
      'utf8'
    );

    const report = await runDiagnostics({
      assetsPath: tempDir,
      flashlogPath,
      ffdecPath: 'non-existent-path'
    });

    const ruleDIssues = report.issues.filter(i => i.ruleId === 'RULE_D_XML_ERROR');
    expect(ruleDIssues.length).toBe(1);
    expect(ruleDIssues[0].severity).toBe('FIXED_BY_COMPAT');
    expect(ruleDIssues[0].suspectedIncompatibleFiles).toContain('hebrew.xml');
  });

  it('should detect Rule E: SharedObject flush crash from flashlog', async () => {
    fs.writeFileSync(flashlogPath, 'Error #2130: Unable to flush SharedObject\n at CookiesDataManager/setData()', 'utf8');

    const report = await runDiagnostics({
      assetsPath: tempDir,
      flashlogPath,
      ffdecPath: 'non-existent-path'
    });

    const ruleEIssues = report.issues.filter(i => i.ruleId === 'RULE_E_SHAREDOBJECT_FLUSH');
    expect(ruleEIssues.length).toBe(1);
    expect(ruleEIssues[0].severity).toBe('WARNING');
  });

  it('should detect Rule F: HTTP 404 missing assets from logs', async () => {
    fs.writeFileSync(httpLogPath, 'GET /Swf/ControlPanel.swf -> 404 Not Found\nGET /Xmls/lang/english.xml -> 404 Not Found', 'utf8');

    const report = await runDiagnostics({
      assetsPath: tempDir,
      httpLogPath,
      ffdecPath: 'non-existent-path'
    });

    const ruleFIssues = report.issues.filter(i => i.ruleId === 'RULE_F_MISSING_HTTP_ASSETS');
    expect(ruleFIssues.length).toBe(1);
    expect(ruleFIssues[0].severity).toBe('WARNING');
    expect(ruleFIssues[0].suspectedIncompatibleFiles).toContain('ControlPanel.swf');
  });

  it('should detect Rule G: Missing getSwfParams Method', async () => {
    // 1. Trigger via flashlog evidence
    fs.writeFileSync(flashlogPath, 'TypeError: Error #1006: getSwfParams is not a function\n at mogobe.login::LoginScreenSingle/init()', 'utf8');
    let report = await runDiagnostics({
      assetsPath: tempDir,
      flashlogPath,
      ffdecPath: 'non-existent-path'
    });
    let ruleGIssues = report.issues.filter(i => i.ruleId === 'RULE_G_GETSWFPARAMS_MISSING');
    expect(ruleGIssues.length).toBe(1);
    expect(ruleGIssues[0].severity).toBe('BLOCKER');

    // 2. Trigger via SWF binary scan (when Login.swf requires getSwfParams and loginGR.swf does not have "getSwfParams")
    fs.writeFileSync(flashlogPath, '', 'utf8'); // clear flashlog
    fs.writeFileSync(path.join(tempDir, 'Login.swf'), 'dummy swf content requiring getSwfParams');
    fs.writeFileSync(path.join(tempDir, 'loginGR.swf'), 'dummy swf content lacking search string');
    report = await runDiagnostics({
      assetsPath: tempDir,
      ffdecPath: 'non-existent-path'
    });
    ruleGIssues = report.issues.filter(i => i.ruleId === 'RULE_G_GETSWFPARAMS_MISSING');
    expect(ruleGIssues.length).toBe(1);
    expect(ruleGIssues[0].suspectedIncompatibleFiles).toContain('loginGR.swf');

    // 3. Do NOT trigger blocker if Login.swf does NOT require getSwfParams (should emit INFO instead)
    fs.writeFileSync(path.join(tempDir, 'Login.swf'), 'dummy swf content without search string');
    report = await runDiagnostics({
      assetsPath: tempDir,
      ffdecPath: 'non-existent-path'
    });
    ruleGIssues = report.issues.filter(i => i.ruleId === 'RULE_G_GETSWFPARAMS_MISSING');
    expect(ruleGIssues.length).toBe(0);
    const ruleGInfo = report.issues.filter(i => i.ruleId === 'RULE_G_GETSWFPARAMS_INFO');
    expect(ruleGInfo.length).toBe(1);
    expect(ruleGInfo[0].severity).toBe('INFO');
    
    // Restore default for clean cleanup or sequential runs
    fs.writeFileSync(path.join(tempDir, 'loginGR.swf'), 'dummy swf content containing getSwfParams');
  });

  it('should detect Rule H: Linkage Symbol Namespace/Package Mismatch from flashlog', async () => {
    // 1. Trigger via flashlog evidence (Error #1009 and LoginScreenSingle/init)
    fs.writeFileSync(
      flashlogPath,
      'TypeError: Error #1009: Cannot access a property or method of a null object reference.\n at mogobe.login::LoginScreenSingle/init()',
      'utf8'
    );
    
    const report = await runDiagnostics({
      assetsPath: tempDir,
      flashlogPath,
      ffdecPath: 'non-existent-path'
    });
    
    const ruleHIssues = report.issues.filter(i => i.ruleId === 'RULE_H_NAMESPACE_MISMATCH');
    expect(ruleHIssues.length).toBe(1);
    expect(ruleHIssues[0].severity).toBe('BLOCKER');
    expect(ruleHIssues[0].suspectedIncompatibleFiles).toContain('loginGR.swf');
  });

  it('should correctly score candidates and detect Rule H when configured alias is partial', async () => {
    // Write a mock BaseLoginGR.swf which is partial (namespaced class, has getSwfParams, and expected children)
    const partialContent = 'getSwfParams mogoTab:mlLoginScreen txtUserName txtPassword btnLogin btnCode btnPass btnRegist chkSaveName chkSavePass';
    fs.writeFileSync(path.join(tempDir, 'BaseLoginGR.swf'), partialContent, 'utf8');

    // Write a mock compatible graphics library (global class, has getSwfParams, and expected children)
    const compatibleContent = 'getSwfParams mlLoginScreen txtUserName txtPassword btnLogin btnCode btnPass btnRegist chkSaveName chkSavePass';
    fs.writeFileSync(path.join(tempDir, 'CompatibleLoginGR.swf'), compatibleContent, 'utf8');

    // Write an irrelevant SWF file which should NOT end up in candidatesMatrix (e.g. AvatarsGR.swf)
    fs.writeFileSync(path.join(tempDir, 'AvatarsGR.swf'), 'dummy content without linkage symbol', 'utf8');

    // Clear flashlog
    fs.writeFileSync(flashlogPath, '', 'utf8');

    const report = await runDiagnostics({
      assetsPath: tempDir,
      ffdecPath: 'non-existent-path',
      compatLoginGraphicsAlias: 'BaseLoginGR.swf'
    });

    // Check candidate matrix exists and is populated
    expect(report.candidatesMatrix).toBeDefined();
    const baseLoginScore = report.candidatesMatrix?.find(c => c.filename === 'BaseLoginGR.swf');
    expect(baseLoginScore).toBeDefined();
    expect(baseLoginScore?.status).toBe('PARTIAL');

    const compatibleScore = report.candidatesMatrix?.find(c => c.filename === 'CompatibleLoginGR.swf');
    expect(compatibleScore).toBeDefined();
    expect(compatibleScore?.status).toBe('COMPATIBLE');

    // Ensure AvatarsGR.swf is filtered out and does not exist in candidatesMatrix
    const avatarScore = report.candidatesMatrix?.find(c => c.filename === 'AvatarsGR.swf');
    expect(avatarScore).toBeUndefined();

    // Rule H should be triggered because the configured alias target (BaseLoginGR.swf) is partial
    const ruleHIssues = report.issues.filter(i => i.ruleId === 'RULE_H_NAMESPACE_MISMATCH');
    expect(ruleHIssues.length).toBe(1);
  });

  it('should support fast scan and full scan modes and count skipped files', async () => {
    // Create a subfolder with non-key swf and xml files
    const subDir = path.join(tempDir, 'Swf', 'deep', 'folder');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, 'IrrelevantSWF.swf'), 'dummy data', 'utf8');

    // Run fast diagnostics (default)
    let report = await runDiagnostics({
      assetsPath: tempDir,
      ffdecPath: 'non-existent-path'
    });

    expect(report.scanMode).toBe('fast');
    // IrrelevantSWF.swf should NOT be scanned because it is in a deep folder and not a key file
    const foundIrrelevant = report.scannedFiles.some(f => f.includes('IrrelevantSWF.swf'));
    expect(foundIrrelevant).toBe(false);

    // Run full diagnostics
    report = await runDiagnostics({
      assetsPath: tempDir,
      ffdecPath: 'non-existent-path',
      fullScan: true
    });

    expect(report.scanMode).toBe('full');
    const foundIrrelevantFull = report.scannedFiles.some(f => f.includes('IrrelevantSWF.swf'));
    expect(foundIrrelevantFull).toBe(true);
  });

  it('should detect Rule I & Rule J: Login/Main AppConfig Contract Mismatch with precise evidence', async () => {
    const mockTimeline = JSON.stringify({
      milestones: [
        { name: 'Mogo.swf served', timestamp: 123 },
        { name: 'Main.swf served', timestamp: 124 },
        { name: 'Servers.aspx served', timestamp: 125 }
      ],
      serversServedAt: 125,
      tcpMissingWarningFired: true,
      loadingScreenMissingWarningFired: true
    });

    // Case 1: Static proof of missing FirstLoadingScreens => keeps version mismatch blocker
    fs.writeFileSync(path.join(tempDir, 'Main.swf'), 'dummy content requiring FirstLoadingScreens and createNextScreen');
    fs.writeFileSync(path.join(tempDir, 'Login.swf'), 'dummy content lacking all expected parameters');
    
    let report = await runDiagnostics({
      assetsPath: tempDir,
      ffdecPath: 'non-existent-path'
    });

    let ruleIIssues = report.issues.filter(i => i.ruleId === 'RULE_I_LOGIN_MAIN_APPCONFIG_MISMATCH');
    expect(ruleIIssues.length).toBe(1);
    expect(ruleIIssues[0].severity).toBe('BLOCKER');
    expect(ruleIIssues[0].title).toBe('Login.swf / Main.swf version mismatch');
    expect(ruleIIssues[0].requiredReplacementFile).toContain('Verify Main.swf and Login.swf are from the same release set.');

    // Case 2: Ambiguous evidence, no timeline => does not falsely blame Login.swf
    fs.writeFileSync(path.join(tempDir, 'Login.swf'), 'dummy content containing FirstLoadingScreens and XmlToList');
    
    report = await runDiagnostics({
      assetsPath: tempDir,
      ffdecPath: 'non-existent-path'
    });

    ruleIIssues = report.issues.filter(i => i.ruleId === 'RULE_I_LOGIN_MAIN_APPCONFIG_MISMATCH');
    expect(ruleIIssues.length).toBe(0);

    // Case 3: Ambiguous evidence + timeline => timeline-only evidence produces "Main startup halted..." issues
    report = await runDiagnostics({
      assetsPath: tempDir,
      ffdecPath: 'non-existent-path',
      runtimeTimeline: mockTimeline
    });

    // Blames startup halt, not definitely Login.swf
    ruleIIssues = report.issues.filter(i => i.ruleId === 'RULE_I_LOGIN_MAIN_APPCONFIG_MISMATCH');
    expect(ruleIIssues.length).toBe(1);
    expect(ruleIIssues[0].severity).toBe('WARNING');
    expect(ruleIIssues[0].title).toBe('Main startup halted before loading screen / TCP');

    // Separate blocker for runtime halt
    let ruleJIssues = report.issues.filter(i => i.ruleId === 'RULE_J_MAIN_STARTUP_HALTED');
    expect(ruleJIssues.length).toBe(1);
    expect(ruleJIssues[0].severity).toBe('BLOCKER');
    expect(ruleJIssues[0].title).toBe('Main startup halted before loading screen initialization');
    expect(ruleJIssues[0].evidence).toContain('* Runtime timeline: Main.swf was served.');

    const consoleOutput = formatConsoleReport(report);
    expect(consoleOutput).toContain('* Runtime timeline: Main.swf was served.');
    expect(consoleOutput).toContain('Main startup halted before loading screen / TCP');

    // Case 4: Static proven missing FirstLoadingScreens + timeline => triggers BOTH Rule I blocker and Rule J blocker
    fs.writeFileSync(path.join(tempDir, 'Login.swf'), 'dummy content lacking all expected parameters');
    
    report = await runDiagnostics({
      assetsPath: tempDir,
      ffdecPath: 'non-existent-path',
      runtimeTimeline: mockTimeline
    });

    ruleIIssues = report.issues.filter(i => i.ruleId === 'RULE_I_LOGIN_MAIN_APPCONFIG_MISMATCH');
    expect(ruleIIssues.length).toBe(1);
    expect(ruleIIssues[0].severity).toBe('BLOCKER');
    expect(ruleIIssues[0].title).toBe('Login.swf / Main.swf version mismatch');

    ruleJIssues = report.issues.filter(i => i.ruleId === 'RULE_J_MAIN_STARTUP_HALTED');
    expect(ruleJIssues.length).toBe(1);
    expect(ruleJIssues[0].severity).toBe('BLOCKER');

    // Clean up files created for this test
    fs.unlinkSync(path.join(tempDir, 'Main.swf'));
  });

  it('should detect Rule K: Login/Main CommonLib event constant mismatch from flashlog', async () => {
    fs.writeFileSync(
      flashlogPath,
      'TypeError: Error #2007: Parameter type must be non-null.\n at flash.events::EventDispatcher/addEventListener()\n at worlds4u.events::ExEventDispatcher/addEventListener()\n at worlds4u.control::MainControler/enableEvents()',
      'utf8'
    );

    const report = await runDiagnostics({
      assetsPath: tempDir,
      flashlogPath,
      ffdecPath: 'non-existent-path'
    });

    const ruleKIssues = report.issues.filter(i => i.ruleId === 'RULE_K_EVENT_CONSTANT_MISMATCH');
    expect(ruleKIssues.length).toBe(1);
    expect(ruleKIssues[0].severity).toBe('BLOCKER');
    expect(ruleKIssues[0].suspectedIncompatibleFiles).toContain('Login.swf');
    expect(ruleKIssues[0].suspectedIncompatibleFiles).toContain('Main.swf');
  });
});

