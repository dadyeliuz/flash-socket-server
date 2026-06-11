import * as fs from 'fs';
import { describe, it, expect, vi } from 'vitest';
import {
  scorePair,
  classifyScore,
  LoginFingerprint,
  MainFingerprint,
  MogoFingerprint,
  LoginGrFingerprint,
  formatConsoleMatrix,
  CompatMatrixReport,
  buildLoginFingerprint,
  buildMogoFingerprint,
  checkHasDoAbc,
  extractAbcStrings,
  formatMogoInspectionReport
} from '../matrix';
import * as matrixMod from '../matrix';

let mockFsStatSync: any = null;
let mockFsReadFileSync: any = null;
let mockFsExistsSync: any = null;
let mockFsReaddirSync: any = null;
let mockExecSync: any = null;

vi.mock('fs', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    statSync: (...args: any[]) => {
      if (mockFsStatSync) return mockFsStatSync(...args);
      return actual.statSync(...args);
    },
    readFileSync: (...args: any[]) => {
      if (mockFsReadFileSync) return mockFsReadFileSync(...args);
      return actual.readFileSync(...args);
    },
    existsSync: (...args: any[]) => {
      if (mockFsExistsSync) return mockFsExistsSync(...args);
      return actual.existsSync(...args);
    },
    readdirSync: (...args: any[]) => {
      if (mockFsReaddirSync) return mockFsReaddirSync(...args);
      return actual.readdirSync(...args);
    }
  };
});

vi.mock('child_process', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    execSync: (...args: any[]) => {
      if (mockExecSync) return mockExecSync(...args);
      return actual.execSync(...args);
    }
  };
});

describe('Compatibility Matrix Scoring Engine', () => {
  const defaultLogin: LoginFingerprint = {
    path: 'Login.swf',
    filename: 'Login.swf',
    size: 500000,
    sha256: 'abc123hash',
    appVer: 'Alph_1.15.12.0',
    dateMarker: '20110719',
    definesLoginClass: true,
    exposesInitMethod: true,
    exposesInitMethodStatus: 'OK',
    baseloginFlowDetected: false,
    requiresGetSwfParams: false,
    requiresMlLoginScreen: true,
    requiresMlLoginScreenHeb: true,
    requiresMlLoginMultiUsers: true,
    providesFirstLoadingScreens: false,
    externalInterfaceCount: 0,
    definedClasses: [],
    
    // Legacy / reference helpers
    referencesFirstLoadingScreens: false,
    referencesLoadingScreenTO: false,
    referencesXmlToList: false,
    referencesLoadingScreens: false,
    referencesMainSwf: true,
    referencesStartMainApp: true,
    referencesGetSwfParams: false,
    referencesLoginEvent: false,
    usesModernServerList: true
  };

  const defaultMain: MainFingerprint = {
    path: 'Main.swf',
    filename: 'Main.swf',
    size: 250000,
    sha256: 'xyz456hash',
    appVer: 'Alph_1.15.12.0',
    dateMarker: '20110719',
    definesMain: true,
    definesRequestHandler: true,
    definesSmartConector: true,
    definesScreenManager: true,
    definesLoadingScreenManager: true,
    referencesLoadingScreenTO: false,
    referencesFirstLoadingScreens: false,
    referencesLoadingScreens: false,
    referencesLoginEvent: false,
    referencesBlueBox: false,
    referencesVerChk: false,
    requiresFirstLoadingScreens: false,
    definesLoginEvent: false,
    appearsComplete: true,
    definedClasses: ['Main', 'worlds4u.common.connections.RequestHandler', 'worlds4u.common.connections.SmartConector', 'worlds4u.view.screen.ScreenManager']
  };

  const defaultMogo: MogoFingerprint = {
    path: 'Mogo.swf',
    filename: 'Mogo.swf',
    size: 150000,
    sha256: 'mogo123hash',
    expectsLoginInit: true,
    loginLoadDetected: true
  };

  const defaultLoginGr: LoginGrFingerprint = {
    path: 'loginGR.swf',
    filename: 'loginGR.swf',
    size: 200000,
    sha256: 'logingr123hash',
    hasGlobalMlLoginScreen: true,
    hasMlLoginScreenHeb: true,
    hasMlLoginMultiUsers: true,
    hasMlAvatarBig: true,
    hasGetSwfParams: true,
    hasRequiredLoginChildren: true,
    hasNamespacedMlLoginScreen: false
  };

  it('1. Main requires FirstLoadingScreens + Login provides it => high score', () => {
    const login: LoginFingerprint = {
      ...defaultLogin,
      referencesFirstLoadingScreens: true,
      referencesLoadingScreenTO: true,
      providesFirstLoadingScreens: true
    };

    const main: MainFingerprint = {
      ...defaultMain,
      referencesFirstLoadingScreens: true,
      referencesLoadingScreenTO: true,
      requiresFirstLoadingScreens: true
    };

    const { score, positives, risks } = scorePair(login, main, defaultMogo, defaultLoginGr, false);
    expect(score).toBe(100);
    expect(positives).toContain('Login provides and Main requires FirstLoadingScreens (+15)');
    expect(risks.length).toBe(0);
  });

  it('2. Main requires FirstLoadingScreens + Login missing it => penalty', () => {
    const login: LoginFingerprint = {
      ...defaultLogin,
      providesFirstLoadingScreens: false
    };

    const main: MainFingerprint = {
      ...defaultMain,
      referencesFirstLoadingScreens: true,
      referencesLoadingScreenTO: true,
      requiresFirstLoadingScreens: true
    };

    const { score, risks } = scorePair(login, main, defaultMogo, defaultLoginGr, false);
    expect(score).toBeLessThanOrEqual(89);
    expect(risks).toContain('Main requires FirstLoadingScreens but Login does not provide it (-40)');
  });

  it('3. Main references LoginEvent but neither SWF defines it => penalty', () => {
    const login: LoginFingerprint = {
      ...defaultLogin,
      definedClasses: []
    };

    const main: MainFingerprint = {
      ...defaultMain,
      referencesLoginEvent: true,
      definesLoginEvent: false,
      definedClasses: ['Main', 'worlds4u.common.connections.RequestHandler', 'worlds4u.common.connections.SmartConector', 'worlds4u.view.screen.ScreenManager']
    };

    const { risks } = scorePair(login, main, defaultMogo, defaultLoginGr, false);
    expect(risks).toContain('Main references LoginEvent but neither SWF defines it (-35)');
  });

  it('4. Login requires getSwfParams while loginGR lacks it => penalty/blocker', () => {
    const login: LoginFingerprint = {
      ...defaultLogin,
      requiresGetSwfParams: true
    };

    const loginGr: LoginGrFingerprint = {
      ...defaultLoginGr,
      hasGetSwfParams: false
    };

    const { score, risks, loginLoginGrCompatible } = scorePair(login, defaultMain, defaultMogo, loginGr, false);
    expect(score).toBeLessThanOrEqual(89);
    expect(loginLoginGrCompatible).toBe(false);
    expect(risks).toContain('Login.swf expects loginGR.getSwfParams(), but active loginGR.swf does not provide it.');
  });

  it('5. JSON output shape classification matches correct score boundary', () => {
    expect(classifyScore(95)).toBe('EXCELLENT');
    expect(classifyScore(85)).toBe('LIKELY_COMPATIBLE');
    expect(classifyScore(65)).toBe('POSSIBLE');
    expect(classifyScore(45)).toBe('RISKY');
    expect(classifyScore(15)).toBe('INCOMPATIBLE');
  });

  it('6. Mogo expects init + Login missing init => heavy penalty/blocker', () => {
    const mogo: MogoFingerprint = {
      ...defaultMogo,
      expectsLoginInit: true
    };
    const login: LoginFingerprint = {
      ...defaultLogin,
      exposesInitMethod: false,
      exposesInitMethodStatus: 'BLOCKED'
    };
    const { score, risks, mogoLoginCompatible } = scorePair(login, defaultMain, mogo, defaultLoginGr, false);
    expect(mogoLoginCompatible).toBe(false);
    expect(score).toBeLessThanOrEqual(89);
    expect(risks).toContain('Mogo.swf expects Login.init(), but Login candidate does not expose init().');
  });

  it('7. Mogo expects init + Login exposes init => eligible', () => {
    const mogo: MogoFingerprint = {
      ...defaultMogo,
      expectsLoginInit: true
    };
    const login: LoginFingerprint = {
      ...defaultLogin,
      exposesInitMethod: true,
      exposesInitMethodStatus: 'OK'
    };
    const { mogoLoginCompatible } = scorePair(login, defaultMain, mogo, defaultLoginGr, false);
    expect(mogoLoginCompatible).toBe(true);
  });

  it('8. Login does not require getSwfParams + loginGR lacks it => no blocker', () => {
    const login: LoginFingerprint = {
      ...defaultLogin,
      requiresGetSwfParams: false
    };
    const loginGr: LoginGrFingerprint = {
      ...defaultLoginGr,
      hasGetSwfParams: false
    };
    const { loginLoginGrCompatible } = scorePair(login, defaultMain, defaultMogo, loginGr, false);
    expect(loginLoginGrCompatible).toBe(true);
  });

  it('9. Login requires mlLoginScreenHeb + loginGR lacks it => penalty', () => {
    const login: LoginFingerprint = {
      ...defaultLogin,
      requiresMlLoginScreenHeb: true
    };
    const loginGr: LoginGrFingerprint = {
      ...defaultLoginGr,
      hasMlLoginScreenHeb: false
    };
    const { risks } = scorePair(login, defaultMain, defaultMogo, loginGr, false);
    expect(risks).toContain('Login requires mlLoginScreenHeb, but active loginGR.swf does not define it (-35)');
  });

  it('10. Main requires FirstLoadingScreens + Login missing it => penalty', () => {
    const login: LoginFingerprint = {
      ...defaultLogin,
      providesFirstLoadingScreens: false
    };
    const main: MainFingerprint = {
      ...defaultMain,
      requiresFirstLoadingScreens: true
    };
    const { risks, mainLoginCompatible } = scorePair(login, main, defaultMogo, defaultLoginGr, false);
    expect(mainLoginCompatible).toBe(false);
    expect(risks).toContain('Main requires FirstLoadingScreens but Login does not provide it (-40)');
  });

  it('11. A pair must not score EXCELLENT if it fails Mogo/Login or Login/loginGR contracts', () => {
    const mogo: MogoFingerprint = {
      ...defaultMogo,
      expectsLoginInit: true
    };
    const login: LoginFingerprint = {
      ...defaultLogin,
      exposesInitMethod: false,
      exposesInitMethodStatus: 'BLOCKED'
    };
    const { score } = scorePair(login, defaultMain, mogo, defaultLoginGr, false);
    expect(score).toBeLessThan(90);
  });

  it('12. Strict mode validation (blocker caps score at 49)', () => {
    const mogo: MogoFingerprint = {
      ...defaultMogo,
      expectsLoginInit: true
    };
    const login: LoginFingerprint = {
      ...defaultLogin,
      exposesInitMethod: false,
      exposesInitMethodStatus: 'BLOCKED'
    };
    const res1 = scorePair(login, defaultMain, mogo, defaultLoginGr, false);
    expect(res1.score).toBeGreaterThan(49);
    expect(res1.score).toBeLessThan(90);

    const res2 = scorePair(login, defaultMain, mogo, defaultLoginGr, true);
    expect(res2.score).toBeLessThanOrEqual(49);
  });

  it('13. JSON output includes Mogo/Login, Login/loginGR, and Login/Main compatibility sections', () => {
    const { mogoLoginCompatible, loginExposesInit, loginLoginGrCompatible, mainLoginCompatible } = scorePair(defaultLogin, defaultMain, defaultMogo, defaultLoginGr, false);
    expect(mogoLoginCompatible).toBeDefined();
    expect(loginExposesInit).toBeDefined();
    expect(loginLoginGrCompatible).toBeDefined();
    expect(mainLoginCompatible).toBeDefined();
  });

  it('14. Incompatible top result prints warning and changes section header (pair mode)', () => {
    const report: CompatMatrixReport = {
      loginCandidatesCount: 1,
      mainCandidatesCount: 1,
      totalPairsScored: 1,
      assetsPath: 'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      topPairs: [
        {
          rank: 1,
          score: 15,
          classification: 'INCOMPATIBLE',
          loginFile: 'Login.swf',
          loginPath: 'C:\\MORE\\Login.swf',
          loginSize: 100000,
          mainFile: 'Main.swf',
          mainPath: 'C:\\MORE\\Main.swf',
          mainSize: 100000,
          mogoLoginCompatible: false,
          loginExposesInit: false,
          loginLoginGrCompatible: false,
          mainLoginCompatible: true,
          positives: [],
          risks: ['Mogo.swf expects Login.init(), but Login candidate does not expose init().'],
          recommendation: 'Do not deploy this pair.'
        }
      ],
      bestLoginForActiveMain: null,
      bestMainForActiveLogin: null
    };

    const output = formatConsoleMatrix(report);
    expect(output).toContain('No compatible Login/Main pairs found for the active Mogo.swf + active loginGR.swf constraints.');
    expect(output).toContain('NO PROVEN DEPLOYABLE STARTUP SETS FOUND');
    expect(output).not.toContain('TOP DEPLOYABLE CANDIDATES:');
  });

  it('15. Copy commands hidden for incompatible by default and shown when enabled', () => {
    const reportWithoutCopy: CompatMatrixReport = {
      loginCandidatesCount: 1,
      mainCandidatesCount: 1,
      totalPairsScored: 1,
      assetsPath: 'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      showCopyForIncompatible: false,
      topPairs: [
        {
          rank: 1,
          score: 15,
          classification: 'INCOMPATIBLE',
          loginFile: 'Login.swf',
          loginPath: 'C:\\MORE\\Login.swf',
          loginSize: 100000,
          mainFile: 'Main.swf',
          mainPath: 'C:\\MORE\\Main.swf',
          mainSize: 100000,
          mogoLoginCompatible: false,
          loginExposesInit: false,
          loginLoginGrCompatible: false,
          mainLoginCompatible: true,
          positives: [],
          risks: [],
          recommendation: 'Do not deploy this pair.'
        }
      ],
      bestLoginForActiveMain: null,
      bestMainForActiveLogin: null
    };

    const output1 = formatConsoleMatrix(reportWithoutCopy);
    expect(output1).not.toContain('# copy "C:\\MORE\\Login.swf"');

    const reportWithCopy: CompatMatrixReport = {
      ...reportWithoutCopy,
      showCopyForIncompatible: true
    };
    const output2 = formatConsoleMatrix(reportWithCopy);
    expect(output2).toContain('# copy "C:\\MORE\\Login.swf"');
  });

  it('16. Summary statistics exist and count correctly', () => {
    const report: CompatMatrixReport = {
      loginCandidatesCount: 1,
      mainCandidatesCount: 1,
      totalPairsScored: 1,
      assetsPath: 'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      topPairs: [],
      bestLoginForActiveMain: null,
      bestMainForActiveLogin: null,
      summaryStats: {
        totalPairs: 10,
        countExcellent: 1,
        countLikelyCompatible: 2,
        countPossible: 3,
        countRisky: 2,
        countIncompatible: 2,
        countBlockedMogoLoginInitMissing: 1,
        countBlockedMogoLoginInitUnknown: 0,
        countBlockedLoginGrGetSwfParamsMissing: 2,
        countBlockedLoginLoginGrLinkageMismatch: 1,
        countBlockedFirstLoadingScreensMismatch: 2,
        countBlockedLoginEventMissing: 1,
        countLoginMainOkMogoLoginFailed: 1,
        countLoginMainOkLoginLoginGrFailed: 1
      }
    };

    const output = formatConsoleMatrix(report);
    expect(output).toContain('SUMMARY STATISTICS');
    expect(output).toContain('Total combinations scored: 10');
    expect(output).toContain('- EXCELLENT: 1');
    expect(output).toContain('- LIKELY_COMPATIBLE: 2');
    expect(output).toContain('- POSSIBLE: 3');
    expect(output).toContain('- RISKY: 2');
    expect(output).toContain('- INCOMPATIBLE: 2');
    expect(output).toContain('- Blocked by Mogo/Login init missing: 1');
    expect(output).toContain('- Blocked by loginGR getSwfParams missing: 2');
  });

  it('17. Compatible loginGR candidate fixes getSwfParams blocker in scoring', () => {
    const login: LoginFingerprint = {
      ...defaultLogin,
      requiresGetSwfParams: true
    };
    const main: MainFingerprint = defaultMain;
    const mogo: MogoFingerprint = defaultMogo;

    const incompatibleLoginGr: LoginGrFingerprint = {
      ...defaultLoginGr,
      hasGetSwfParams: false
    };

    const compatibleLoginGr: LoginGrFingerprint = {
      ...defaultLoginGr,
      hasGetSwfParams: true
    };

    const scoreIncompatible = scorePair(login, main, mogo, incompatibleLoginGr, false);
    expect(scoreIncompatible.loginLoginGrCompatible).toBe(false);

    const scoreCompatible = scorePair(login, main, mogo, compatibleLoginGr, false);
    expect(scoreCompatible.loginLoginGrCompatible).toBe(true);
  });

  it('18. Triple scoring ranks compatible loginGR above incompatible loginGR', () => {
    const login: LoginFingerprint = {
      ...defaultLogin,
      requiresGetSwfParams: true
    };
    const main: MainFingerprint = defaultMain;
    const mogo: MogoFingerprint = defaultMogo;

    const incompatibleLoginGr: LoginGrFingerprint = {
      ...defaultLoginGr,
      hasGetSwfParams: false
    };

    const compatibleLoginGr: LoginGrFingerprint = {
      ...defaultLoginGr,
      hasGetSwfParams: true
    };

    const result1 = scorePair(login, main, mogo, incompatibleLoginGr, false);
    const result2 = scorePair(login, main, mogo, compatibleLoginGr, false);

    expect(result2.score).toBeGreaterThan(result1.score);
  });

  it('19. Active Login fixture with init-like markers is detected OK', () => {
    const mogo: MogoFingerprint = {
      ...defaultMogo,
      expectsLoginInit: true
    };
    const login: LoginFingerprint = {
      ...defaultLogin,
      exposesInitMethod: true,
      exposesInitMethodStatus: 'OK'
    };
    const { mogoLoginCompatible, mogoLoginStatus, score } = scorePair(login, defaultMain, mogo, defaultLoginGr, false);
    expect(mogoLoginCompatible).toBe(true);
    expect(mogoLoginStatus).toBe('OK');
    expect(score).toBe(100);
  });

  it('20. Uncertain init is UNKNOWN, not BLOCKED', () => {
    const mogo: MogoFingerprint = {
      ...defaultMogo,
      expectsLoginInit: true
    };
    const login: LoginFingerprint = {
      ...defaultLogin,
      appVer: null,
      dateMarker: null,
      exposesInitMethod: false,
      exposesInitMethodStatus: 'UNKNOWN',
      requiresMlLoginScreen: false,
      requiresMlLoginScreenHeb: false,
      requiresMlLoginMultiUsers: false,
    };
    const main: MainFingerprint = {
      ...defaultMain,
      appVer: null,
      dateMarker: null,
      referencesLoginEvent: true,
      definesLoginEvent: false,
    };
    const { mogoLoginCompatible, mogoLoginStatus, score, risks } = scorePair(login, main, mogo, defaultLoginGr, false);
    expect(mogoLoginCompatible).toBe(true); // not a hard blocker!
    expect(mogoLoginStatus).toBe('UNKNOWN');
    expect(score).toBe(74); // capped at 74 maximum!
    expect(risks).toContain('Mogo expects Login.init(), but Login init detection is uncertain (-10).');
  });

  it('21. Only deep-proven missing init becomes BLOCKED', () => {
    const mogo: MogoFingerprint = {
      ...defaultMogo,
      expectsLoginInit: true
    };
    const login: LoginFingerprint = {
      ...defaultLogin,
      exposesInitMethod: false,
      exposesInitMethodStatus: 'BLOCKED'
    };
    const { mogoLoginCompatible, mogoLoginStatus, score, risks } = scorePair(login, defaultMain, mogo, defaultLoginGr, false);
    expect(mogoLoginCompatible).toBe(false); // hard blocked!
    expect(mogoLoginStatus).toBe('BLOCKED');
    expect(score).toBeLessThanOrEqual(89);
    expect(risks).toContain('Mogo.swf expects Login.init(), but Login candidate does not expose init().');
  });

  it('22. Summary stats separate blocked by Mogo/Login init missing and unknown Mogo/Login init detection', () => {
    const report: CompatMatrixReport = {
      loginCandidatesCount: 1,
      mainCandidatesCount: 1,
      totalPairsScored: 1,
      assetsPath: 'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      topPairs: [],
      bestLoginForActiveMain: null,
      bestMainForActiveLogin: null,
      summaryStats: {
        totalPairs: 10,
        countExcellent: 1,
        countLikelyCompatible: 2,
        countPossible: 3,
        countRisky: 2,
        countIncompatible: 2,
        countBlockedMogoLoginInitMissing: 4,
        countBlockedMogoLoginInitUnknown: 3,
        countBlockedLoginGrGetSwfParamsMissing: 2,
        countBlockedLoginLoginGrLinkageMismatch: 1,
        countBlockedFirstLoadingScreensMismatch: 2,
        countBlockedLoginEventMissing: 1,
        countLoginMainOkMogoLoginFailed: 1,
        countLoginMainOkLoginLoginGrFailed: 1
      }
    };

    const output = formatConsoleMatrix(report);
    expect(output).toContain('Blocked by Mogo/Login init missing: 4');
    expect(output).toContain('Unknown Mogo/Login init detection: 3');
  });

  it('23. A Mogo that expects init + Login missing init => blocked', () => {
    const mogo: MogoFingerprint = {
      ...defaultMogo,
      expectsLoginInitStatus: 'YES'
    };
    const login: LoginFingerprint = {
      ...defaultLogin,
      exposesInitMethodStatus: 'BLOCKED'
    };
    const { mogoLoginCompatible, score } = scorePair(login, defaultMain, mogo, defaultLoginGr, false);
    expect(mogoLoginCompatible).toBe(false);
    expect(score).toBeLessThan(90);
  });

  it('24. A Mogo that does not expect init + Login missing init => not blocked', () => {
    const mogo: MogoFingerprint = {
      ...defaultMogo,
      expectsLoginInitStatus: 'NO'
    };
    const login: LoginFingerprint = {
      ...defaultLogin,
      exposesInitMethodStatus: 'BLOCKED'
    };
    const { mogoLoginCompatible, score } = scorePair(login, defaultMain, mogo, defaultLoginGr, false);
    expect(mogoLoginCompatible).toBe(true);
    expect(score).toBe(100); // no penalty
  });

  it('25. Quadruple console format contains Mogo paths, copy commands, and best-overall profile', () => {
    const report: CompatMatrixReport = {
      loginCandidatesCount: 1,
      mainCandidatesCount: 1,
      totalPairsScored: 1,
      assetsPath: 'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      mogoDir: 'C:\\PROJ\\sfs-emu\\MORE VER\\mogo',
      loginGrDir: 'C:\\PROJ\\sfs-emu\\MORE VER\\loginGR',
      topPairs: [
        {
          rank: 1,
          score: 95,
          classification: 'EXCELLENT',
          loginFile: 'Login.swf',
          loginPath: 'C:\\MORE\\Login.swf',
          loginSize: 100000,
          mainFile: 'Main.swf',
          mainPath: 'C:\\MORE\\Main.swf',
          mainSize: 100000,
          loginGrFile: 'loginGR.swf',
          loginGrPath: 'C:\\MORE\\loginGR.swf',
          loginGrSize: 100000,
          mogoFile: 'Mogo.swf',
          mogoPath: 'C:\\MORE\\Mogo.swf',
          mogoSize: 100000,
          mogoLoginCompatible: true,
          loginExposesInit: true,
          loginLoginGrCompatible: true,
          mainLoginCompatible: true,
          mogoLoginStatus: 'OK',
          mogoExpectsLoginInitStatus: 'YES',
          positives: [],
          risks: [],
          recommendation: 'Recommended for deployment.'
        }
      ],
      bestLoginForActiveMain: null,
      bestMainForActiveLogin: null,
      bestMogoForActiveSet: {
        rank: 1,
        score: 95,
        classification: 'EXCELLENT',
        loginFile: 'Active Login.swf',
        loginPath: 'C:\\Active\\Login.swf',
        loginSize: 100000,
        mainFile: 'Active Main.swf',
        mainPath: 'C:\\Active\\Main.swf',
        mainSize: 100000,
        loginGrFile: 'Active loginGR.swf',
        loginGrPath: 'C:\\Active\\loginGR.swf',
        loginGrSize: 100000,
        mogoFile: 'Mogo.swf',
        mogoPath: 'C:\\MORE\\Mogo.swf',
        mogoSize: 100000,
        mogoLoginCompatible: true,
        loginExposesInit: true,
        loginLoginGrCompatible: true,
        mainLoginCompatible: true,
        mogoLoginStatus: 'OK',
        mogoExpectsLoginInitStatus: 'YES',
        positives: [],
        risks: [],
        recommendation: 'Recommended for deployment.'
      }
    };

    const output = formatConsoleMatrix(report);
    expect(output).toContain('TOP DEPLOYABLE STARTUP SETS:');
    expect(output).toContain('Mogo Path:  C:\\MORE\\Mogo.swf');
    expect(output).toContain('# copy "C:\\MORE\\Mogo.swf"');
    expect(output).toContain('Best Mogo Candidate for current active Login/loginGR/Main set:');
    expect(output).toContain('Best Full Startup Set Overall:');
  });

  it('28. UNKNOWN Mogo/Login cannot be EXCELLENT and is capped at 74', () => {
    const mogo: MogoFingerprint = {
      ...defaultMogo,
      expectsLoginInitStatus: 'UNKNOWN'
    };
    const login: LoginFingerprint = {
      ...defaultLogin,
      exposesInitMethodStatus: 'UNKNOWN'
    };
    const { score, mogoLoginStatus } = scorePair(login, defaultMain, mogo, defaultLoginGr, false);
    expect(mogoLoginStatus).toBe('UNKNOWN');
    expect(score).toBeLessThanOrEqual(74);
    expect(classifyScore(score)).not.toBe('EXCELLENT');
    expect(classifyScore(score)).not.toBe('LIKELY_COMPATIBLE');
  });

  it('29. UNKNOWN Mogo/Login cannot appear under deployable section and hides copy commands by default', () => {
    const report: CompatMatrixReport = {
      loginCandidatesCount: 1,
      mainCandidatesCount: 1,
      totalPairsScored: 1,
      assetsPath: 'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      mogoDir: 'C:\\PROJ\\sfs-emu\\MORE VER\\mogo',
      topPairs: [
        {
          rank: 1,
          score: 74,
          classification: 'POSSIBLE',
          loginFile: 'Login.swf',
          loginPath: 'C:\\MORE\\Login.swf',
          loginSize: 100000,
          mainFile: 'Main.swf',
          mainPath: 'C:\\MORE\\Main.swf',
          mainSize: 100000,
          mogoFile: 'Mogo.swf',
          mogoPath: 'C:\\MORE\\Mogo.swf',
          mogoSize: 100000,
          mogoLoginCompatible: true,
          loginExposesInit: false,
          loginLoginGrCompatible: true,
          mainLoginCompatible: true,
          mogoLoginStatus: 'UNKNOWN',
          mogoExpectsLoginInitStatus: 'UNKNOWN',
          positives: [],
          risks: [],
          recommendation: 'Not deployable yet.'
        }
      ],
      bestLoginForActiveMain: null,
      bestMainForActiveLogin: null
    };

    const output = formatConsoleMatrix(report);
    expect(output).toContain('NO PROVEN DEPLOYABLE STARTUP SETS FOUND');
    expect(output).toContain('UNKNOWN STARTUP SETS FOR MANUAL INVESTIGATION:');
    expect(output).not.toContain('TOP DEPLOYABLE STARTUP SETS:');
    expect(output).not.toContain('# copy "C:\\MORE\\Login.swf"');
  });

  it('30. Only all-OK sets are deployable', () => {
    const report: CompatMatrixReport = {
      loginCandidatesCount: 3,
      mainCandidatesCount: 1,
      totalPairsScored: 3,
      assetsPath: 'C:\\PROJ\\sfs-emu\\CLINET-CLEAN',
      mogoDir: 'C:\\PROJ\\sfs-emu\\MORE VER\\mogo',
      topPairs: [
        {
          rank: 1,
          score: 100,
          classification: 'EXCELLENT',
          loginFile: 'LoginOK.swf',
          loginPath: 'C:\\MORE\\LoginOK.swf',
          loginSize: 100000,
          mainFile: 'Main.swf',
          mainPath: 'C:\\MORE\\Main.swf',
          mainSize: 100000,
          mogoFile: 'Mogo.swf',
          mogoPath: 'C:\\MORE\\Mogo.swf',
          mogoSize: 100000,
          mogoLoginCompatible: true,
          loginExposesInit: true,
          loginLoginGrCompatible: true,
          mainLoginCompatible: true,
          mogoLoginStatus: 'OK',
          mogoExpectsLoginInitStatus: 'YES',
          positives: [],
          risks: [],
          recommendation: 'Recommended for deployment.'
        },
        {
          rank: 2,
          score: 74,
          classification: 'POSSIBLE',
          loginFile: 'LoginUnknown.swf',
          loginPath: 'C:\\MORE\\LoginUnknown.swf',
          loginSize: 100000,
          mainFile: 'Main.swf',
          mainPath: 'C:\\MORE\\Main.swf',
          mainSize: 100000,
          mogoFile: 'Mogo.swf',
          mogoPath: 'C:\\MORE\\Mogo.swf',
          mogoSize: 100000,
          mogoLoginCompatible: true,
          loginExposesInit: false,
          loginLoginGrCompatible: true,
          mainLoginCompatible: true,
          mogoLoginStatus: 'UNKNOWN',
          mogoExpectsLoginInitStatus: 'UNKNOWN',
          positives: [],
          risks: [],
          recommendation: 'Not deployable yet.'
        },
        {
          rank: 3,
          score: 40,
          classification: 'RISKY',
          loginFile: 'LoginBlocked.swf',
          loginPath: 'C:\\MORE\\LoginBlocked.swf',
          loginSize: 100000,
          mainFile: 'Main.swf',
          mainPath: 'C:\\MORE\\Main.swf',
          mainSize: 100000,
          mogoFile: 'Mogo.swf',
          mogoPath: 'C:\\MORE\\Mogo.swf',
          mogoSize: 100000,
          mogoLoginCompatible: false,
          loginExposesInit: false,
          loginLoginGrCompatible: true,
          mainLoginCompatible: true,
          mogoLoginStatus: 'BLOCKED',
          mogoExpectsLoginInitStatus: 'YES',
          positives: [],
          risks: [],
          recommendation: 'Do not deploy.'
        }
      ],
      bestLoginForActiveMain: null,
      bestMainForActiveLogin: null
    };

    const output = formatConsoleMatrix(report);
    expect(output).toContain('TOP DEPLOYABLE STARTUP SETS:');
    expect(output).toContain('LoginOK.swf');
    expect(output).not.toContain('LoginUnknown.swf');
    expect(output).not.toContain('LoginBlocked.swf');
  });

  it('31. Known failing Login is not deployable when Mogo expectation is UNKNOWN or YES', () => {
    const failingLogin: LoginFingerprint = {
      ...defaultLogin,
      exposesInitMethodStatus: 'BLOCKED'
    };

    const mogoYes: MogoFingerprint = {
      ...defaultMogo,
      expectsLoginInitStatus: 'YES'
    };
    const resA = scorePair(failingLogin, defaultMain, mogoYes, defaultLoginGr, false);
    expect(resA.mogoLoginStatus).toBe('BLOCKED');
    expect(resA.mogoLoginCompatible).toBe(false);

    const mogoUnknown: MogoFingerprint = {
      ...defaultMogo,
      expectsLoginInitStatus: 'UNKNOWN'
    };
    const resB = scorePair(failingLogin, defaultMain, mogoUnknown, defaultLoginGr, false);
    expect(resB.mogoLoginStatus).toBe('UNKNOWN');
    expect(resB.score).toBeLessThanOrEqual(74);
  });

  describe('Real SWF Fingerprinting & Status Checks', () => {
    it('26. Login_20160727.1_regist_False_07ce2c.swf must be BLOCKED', () => {
      const filePath = 'C:\\PROJ\\sfs-emu\\MORE VER\\login\\Login_20160727.1_regist_False_07ce2c.swf';
      if (fs.existsSync(filePath)) {
        const fp = buildLoginFingerprint(filePath, undefined, false, false);
        expect(fp.exposesInitMethodStatus).toBe('BLOCKED');
      }
    });

    it('27. Login_Alph_1.15.12.0_5f747a.swf must be OK', () => {
      const filePath = 'C:\\PROJ\\sfs-emu\\MORE VER\\login\\Login_Alph_1.15.12.0_5f747a.swf';
      if (fs.existsSync(filePath)) {
        const fp = buildLoginFingerprint(filePath, undefined, false, false);
        expect(fp.exposesInitMethodStatus).toBe('OK');
      }
    });
  });

  describe('Mogo Loader Analysis', () => {
    it('AS3 Mogo with explicit init call => YES', () => {
      const mockSwf = Buffer.from([
        0x46, 0x57, 0x53, 0x0a,
        0x64, 0x00, 0x00, 0x00,
        0x40, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x0c, 0x00, 0x01,
        0x04, 0x12, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00
      ]);

      mockFsStatSync = vi.fn().mockReturnValue({ size: mockSwf.length, isDirectory: () => false } as any);
      mockFsReadFileSync = vi.fn().mockImplementation((p: any) => {
        if (typeof p === 'string' && p.endsWith('.as')) {
          return `
            class Mogo {
              function startLoad() {
                loader.load(new URLRequest("Login.swf"));
              }
              function onComplete() {
                var loaded = loader.content;
                if ("init" in loaded) {
                  loaded.init();
                }
              }
            }
          `;
        }
        return mockSwf;
      });

      mockFsExistsSync = vi.fn().mockImplementation((p: any) => {
        if (typeof p === 'string' && p.includes('ffdec')) return true;
        if (typeof p === 'string' && p.endsWith('.as')) return true;
        return true;
      });

      mockFsReaddirSync = vi.fn().mockReturnValue(['Mogo.as'] as any);
      mockExecSync = vi.fn().mockReturnValue('' as any);

      try {
        const fp = buildMogoFingerprint('mock_mogo.swf', 'mock_ffdec.exe', true);
        expect(fp.asVersion).toBe('AS3');
        expect(fp.isAS3).toBe(true);
        expect(fp.loadsLoginStatus).toBe('YES');
        expect(fp.callsLoginInitStatus).toBe('YES');
        expect(fp.evidenceLine).toContain('init');
      } finally {
        mockFsStatSync = null;
        mockFsReadFileSync = null;
        mockFsExistsSync = null;
        mockFsReaddirSync = null;
        mockExecSync = null;
      }
    });

    it('AS3 Mogo without init call => NO', () => {
      const mockSwf = Buffer.from([
        0x46, 0x57, 0x53, 0x0a,
        0x64, 0x00, 0x00, 0x00,
        0x40, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x0c, 0x00, 0x01,
        0x04, 0x12, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00
      ]);

      mockFsStatSync = vi.fn().mockReturnValue({ size: mockSwf.length, isDirectory: () => false } as any);
      mockFsReadFileSync = vi.fn().mockImplementation((p: any) => {
        if (typeof p === 'string' && p.endsWith('.as')) {
          return `
            class Mogo {
              function startLoad() {
                loader.load(new URLRequest("Login.swf"));
              }
              function onComplete() {
                var loaded = loader.content;
                addChild(loaded);
              }
            }
          `;
        }
        return mockSwf;
      });

      mockFsExistsSync = vi.fn().mockImplementation((p: any) => {
        if (typeof p === 'string' && p.includes('ffdec')) return true;
        if (typeof p === 'string' && p.endsWith('.as')) return true;
        return true;
      });

      mockFsReaddirSync = vi.fn().mockReturnValue(['Mogo.as'] as any);
      mockExecSync = vi.fn().mockReturnValue('' as any);

      try {
        const fp = buildMogoFingerprint('mock_mogo.swf', 'mock_ffdec.exe', true);
        expect(fp.asVersion).toBe('AS3');
        expect(fp.isAS3).toBe(true);
        expect(fp.loadsLoginStatus).toBe('YES');
        expect(fp.callsLoginInitStatus).toBe('NO');
      } finally {
        mockFsStatSync = null;
        mockFsReadFileSync = null;
        mockFsExistsSync = null;
        mockFsReaddirSync = null;
        mockExecSync = null;
      }
    });

    it('AS2-style decompiled script with loaded.init() => YES', () => {
      const mockSwf = Buffer.from([
        0x46, 0x57, 0x53, 0x0a,
        0x64, 0x00, 0x00, 0x00,
        0x40, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x0c, 0x00, 0x01,
        0x04, 0x03, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00
      ]);

      mockFsStatSync = vi.fn().mockReturnValue({ size: mockSwf.length, isDirectory: () => false } as any);
      mockFsReadFileSync = vi.fn().mockImplementation((p: any) => {
        if (typeof p === 'string' && p.endsWith('.as')) {
          return `
            var mcl = new MovieClipLoader();
            mcl.onLoadInit = function(target) {
              target.init();
            };
            mcl.loadClip("Login.swf", mc);
          `;
        }
        return mockSwf;
      });

      mockFsExistsSync = vi.fn().mockImplementation((p: any) => {
        if (typeof p === 'string' && p.includes('ffdec')) return true;
        if (typeof p === 'string' && p.endsWith('.as')) return true;
        return true;
      });

      mockFsReaddirSync = vi.fn().mockReturnValue(['frame_1.as'] as any);
      mockExecSync = vi.fn().mockReturnValue('' as any);

      try {
        const fp = buildMogoFingerprint('mock_mogo.swf', 'mock_ffdec.exe', true);
        expect(fp.asVersion).toBe('AS1/AS2');
        expect(fp.isAS3).toBe(false);
        expect(fp.loadsLoginStatus).toBe('YES');
        expect(fp.callsLoginInitStatus).toBe('YES');
        expect(fp.evidenceLine).toContain('target.init()');
      } finally {
        mockFsStatSync = null;
        mockFsReadFileSync = null;
        mockFsExistsSync = null;
        mockFsReaddirSync = null;
        mockExecSync = null;
      }
    });

    it('unknown loader => UNKNOWN', () => {
      const mockSwf = Buffer.from([
        0x46, 0x57, 0x53, 0x0a,
        0x64, 0x00, 0x00, 0x00,
        0x40, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x0c, 0x00, 0x01,
        0x04, 0x12, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00
      ]);

      mockFsStatSync = vi.fn().mockReturnValue({ size: mockSwf.length, isDirectory: () => false } as any);
      mockFsReadFileSync = vi.fn().mockImplementation((p: any) => {
        if (typeof p === 'string' && p.endsWith('.swf')) {
          return Buffer.from('FWS\x0a\x64\x00\x00\x00\x40\x00\x00\x00\x00\x00\x0c\x00\x01...login.swf...');
        }
        return mockSwf;
      });
      
      const checkSpy = vi.spyOn(matrixMod, 'checkHasDoAbc').mockReturnValue(true);
      const abcSpy = vi.spyOn(matrixMod, 'extractAbcStrings').mockReturnValue(['init']);

      try {
        const fp = matrixMod.buildMogoFingerprint('mock_mogo.swf', undefined, false);
        expect(fp.expectsLoginInitStatus).toBe('UNKNOWN');
      } finally {
        mockFsStatSync = null;
        mockFsReadFileSync = null;
        checkSpy.mockRestore();
        abcSpy.mockRestore();
      }
    });
  });

  describe('AvatarEvent Compatibility Scoring', () => {
    const defaultLogin: LoginFingerprint = {
      path: 'Login.swf',
      filename: 'Login.swf',
      size: 100000,
      sha256: 'sha256',
      appVer: 'Alph_1.15.12.0',
      dateMarker: '20160727',
      definesLoginClass: true,
      exposesInitMethod: true,
      exposesInitMethodStatus: 'OK',
      baseloginFlowDetected: false,
      requiresGetSwfParams: false,
      requiresMlLoginScreen: false,
      requiresMlLoginScreenHeb: false,
      requiresMlLoginMultiUsers: false,
      providesFirstLoadingScreens: true,
      externalInterfaceCount: 0,
      definedClasses: ['Login', 'worlds4u.events.AvatarEvent'],
      referencesFirstLoadingScreens: true,
      referencesLoadingScreenTO: true,
      referencesXmlToList: true,
      referencesLoadingScreens: true,
      referencesMainSwf: true,
      referencesStartMainApp: true,
      referencesGetSwfParams: false,
      referencesLoginEvent: true,
      usesModernServerList: true,
      providesAvatarEventTipOfDay: true,
      avatarEventConstants: ['TIP_OF_DAY', 'SPECIALEFFECT']
    };

    const defaultMain: MainFingerprint = {
      path: 'Main.swf',
      filename: 'Main.swf',
      size: 200000,
      sha256: 'sha256',
      appVer: 'Alph_1.15.12.0',
      dateMarker: '20160727',
      definesMain: true,
      definesRequestHandler: true,
      definesSmartConector: true,
      definesScreenManager: true,
      definesLoadingScreenManager: true,
      referencesLoadingScreenTO: true,
      referencesFirstLoadingScreens: true,
      referencesLoadingScreens: true,
      referencesLoginEvent: true,
      referencesBlueBox: false,
      referencesVerChk: false,
      requiresFirstLoadingScreens: true,
      definesLoginEvent: true,
      appearsComplete: true,
      definedClasses: ['Main', 'worlds4u.events.AvatarEvent'],
      requiresAvatarEventTipOfDay: true,
      avatarEventConstants: ['TIP_OF_DAY', 'SPECIALEFFECT']
    };

    const defaultMogo: MogoFingerprint = {
      path: 'Mogo.swf',
      filename: 'Mogo.swf',
      size: 4000,
      sha256: 'sha256',
      expectsLoginInit: true,
      expectsLoginInitStatus: 'YES',
      loginLoadDetected: true
    };

    const defaultLoginGr: LoginGrFingerprint = {
      path: 'loginGR.swf',
      filename: 'loginGR.swf',
      size: 500000,
      sha256: 'sha256',
      hasGetSwfParams: true,
      hasMlLoginScreenHeb: true,
      hasMlLoginMultiUsers: true,
      hasMlAvatarBig: true,
      hasRequiredLoginChildren: true,
      hasGlobalMlLoginScreen: true,
      hasNamespacedMlLoginScreen: false
    };

    it('should be OK when Main requires TIP_OF_DAY and Login provides it', () => {
      const res = scorePair(defaultLogin, defaultMain, defaultMogo, defaultLoginGr, false);
      expect(res.avatarEventCompatible).toBe(true);
      expect(res.score).toBeGreaterThanOrEqual(90);
    });

    it('should block and apply penalty when Main requires TIP_OF_DAY but Login is missing it', () => {
      const incompatibleLogin = {
        ...defaultLogin,
        providesAvatarEventTipOfDay: false,
        avatarEventConstants: ['SPECIALEFFECT']
      };
      const res = scorePair(incompatibleLogin, defaultMain, defaultMogo, defaultLoginGr, false);
      expect(res.avatarEventCompatible).toBe(false);
      expect(res.score).toBeLessThan(90);
      expect(res.risks.some(r => r.includes('TIP_OF_DAY'))).toBe(true);
      expect(res.missingAvatarEventConstants).toContain('TIP_OF_DAY');
    });

    it('should detect spelling mismatch between SPECIALEFFECT and SPECIALEFECT and prevent EXCELLENT classification', () => {
      const mainWithEfect = {
        ...defaultMain,
        avatarEventConstants: ['TIP_OF_DAY', 'SPECIALEFECT']
      };
      const loginWithEffect = {
        ...defaultLogin,
        avatarEventConstants: ['TIP_OF_DAY', 'SPECIALEFFECT']
      };
      const res = scorePair(loginWithEffect, mainWithEfect, defaultMogo, defaultLoginGr, false);
      expect(res.avatarEventCompatible).toBe(false);
      expect(res.score).toBeLessThan(90);
      expect(res.risks.some(r => r.includes('SPECIALEFECT'))).toBe(true);
      expect(res.missingAvatarEventConstants).toContain('SPECIALEFECT (typo SPECIALEFFECT in Login)');
    });
  });
});
