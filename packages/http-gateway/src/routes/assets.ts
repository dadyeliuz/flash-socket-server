import { FastifyInstance } from 'fastify';
import { ServerConfig, logger, resolveSafePath, safeFileExists, timelineManager, ruffleDiagnosticsManager } from '@flash-socket-server/core';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { handleLoginU } from './legacyEndpoints';

function recordRoomTxtConfigIfApplicable(urlPath: string, filePath: string): void {
  const normalizedPath = urlPath.replace(/\\/g, '/');
  const match =
    normalizedPath.match(/(?:^|\/)Rooms\/(room_[^.?/]+)\.txt(?:[\?#].*)?$/i) ||
    path.basename(normalizedPath).match(/^(room_[^.?/]+)\.txt(?:[\?#].*)?$/i);
  if (!match) return;
  try {
    ruffleDiagnosticsManager.recordRoomTextConfig(match[1], fs.readFileSync(filePath, 'utf8'));
  } catch (_) {}
}

function sha256FileIfExists(filePath: string | null): string | null {
  if (!filePath || !safeFileExists(filePath)) return null;
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  } catch (_) {
    return null;
  }
}

function getControlPanelCandidateHashes(assetsPath: string): Record<string, string | null> {
  const candidates: Record<string, string | null> = {};
  const localCandidates = [
    'Swf/Assets/ControlPanel.swf',
    'Swf/Assets/ControlPanel-old.swf',
    'Swf/Assets/ControlPanelPetSM.swf'
  ];
  for (const rel of localCandidates) {
    candidates[rel] = sha256FileIfExists(resolveSafePath(assetsPath, rel));
  }

  const oldRoot = path.resolve(assetsPath, '..', 'server-old-readonly', 'unpacked_mogo', 'Assets');
  const oldCandidates = [
    path.join(oldRoot, 'ControlPanel.swf'),
    path.join(oldRoot, 'ControlPanelPetSM.swf')
  ];
  for (const abs of oldCandidates) {
    candidates[abs] = sha256FileIfExists(abs);
  }

  return candidates;
}

function recordControlPanelSwfIfApplicable(urlPath: string, assetsPath: string, filePath: string): void {
  const normalizedUrl = urlPath.replace(/\\/g, '/');
  const lower = normalizedUrl.toLowerCase();
  if (!lower.endsWith('/controlpanel.swf') && lower !== '/controlpanel.swf' && !lower.endsWith('controlpanel.swf')) {
    return;
  }
  const candidateHashes = getControlPanelCandidateHashes(assetsPath);
  const hash = sha256FileIfExists(filePath);
  const activeRel = path.relative(assetsPath, filePath).replace(/\\/g, '/');
  const oldHash = candidateHashes[path.resolve(assetsPath, '..', 'server-old-readonly', 'unpacked_mogo', 'Assets', 'ControlPanel.swf')];
  ruffleDiagnosticsManager.recordControlPanelSwfDiagnostics({
    requestedUrl: normalizedUrl,
    resolvedPath: activeRel,
    served: true,
    hash,
    candidateHashes
  });
  if (hash && oldHash && hash !== oldHash) {
    ruffleDiagnosticsManager.recordControlPanelAssetBridge({
      applied: false,
      reason: 'active-controlpanel-hash-differs-from-old-oracle',
      versionMismatchLikely: true
    });
  }
}

function recordControlPanelTxtInventory(assetsPath: string, filePath: string): void {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const effects = Array.isArray(parsed.effects) ? parsed.effects : [];
    const effectNames: string[] = effects
      .map((effect: any) => typeof effect?.name === 'string' ? effect.name : null)
      .filter((name: string | null): name is string => !!name);
    const expectedButtonUrls = effectNames.map((name: string) => `/Swf/AssetsClean/ControlPanel/Effects/btn${name}.swf`);
    const expectedLinkageNames = effectNames.map((name: string) => `btn${name}`);
    const missingButtonFiles = expectedButtonUrls.filter((url: string) => {
      const rel = url.replace(/^\/+/, '');
      const resolved = resolveSafePath(assetsPath, rel);
      return !resolved || !safeFileExists(resolved);
    });

    ruffleDiagnosticsManager.recordControlPanelTxtDiagnostics({
      parsed: true,
      effectNames,
      expectedButtonUrls,
      expectedLinkageNames,
      missingButtonFiles,
      fieldsSeen: Object.keys(parsed)
    });
  } catch (_) {
    ruffleDiagnosticsManager.recordControlPanelTxtDiagnostics({ parsed: false });
  }
}

function resolveControlPanelAssetBridge(assetsPath: string, relativePath: string): {
  filePath: string;
  reason: string;
  contentType: string;
  expectedConfigPath?: string;
  expectedEffectButtonPathPattern?: string;
} | null {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const lower = normalized.toLowerCase();
  const canonicalConfigRel = 'Swf/AssetsClean/ControlPanel/controlPanel.txt';
  const canonicalConfigPath = resolveSafePath(assetsPath, canonicalConfigRel);
  const canonicalEffectsDir = resolveSafePath(assetsPath, 'Swf/AssetsClean/ControlPanel/Effects');

  if (
    lower.endsWith('controlpanel.txt') &&
    lower.includes('controlpanel') &&
    lower !== canonicalConfigRel.toLowerCase() &&
    canonicalConfigPath &&
    safeFileExists(canonicalConfigPath)
  ) {
    return {
      filePath: canonicalConfigPath,
      reason: 'config-path-family-alias-to-assetsclean-controlpanel',
      contentType: 'application/json; charset=utf-8',
      expectedConfigPath: normalized
    };
  }

  const basename = path.basename(normalized);
  if (
    /^btn[^/\\]+\.swf$/i.test(basename) &&
    lower.includes('controlpanel') &&
    lower.includes('effect') &&
    canonicalEffectsDir &&
    fs.existsSync(canonicalEffectsDir) &&
    fs.statSync(canonicalEffectsDir).isDirectory()
  ) {
    const candidate = resolveSafePath(assetsPath, path.join('Swf', 'AssetsClean', 'ControlPanel', 'Effects', basename));
    if (candidate && safeFileExists(candidate)) {
      return {
        filePath: candidate,
        reason: 'effect-button-path-family-alias-to-assetsclean-controlpanel-effects',
        contentType: 'application/x-shockwave-flash',
        expectedEffectButtonPathPattern: normalized.replace(basename, 'btn*.swf')
      };
    }
  }

  return null;
}

export function wrapHebrewText(str: string, mode: 'RLE' | 'RLM'): { transformed: string; count: number } {
  // Regex to match literal tags <...> or entity-encoded tags &lt;...&gt;
  const tagRegex = /(?:<[^>]+>|&lt;(?:(?!&gt;).)*&gt;)/g;
  
  // We split the string by tags, keeping the tags in the result
  const parts = str.split(tagRegex);
  const tags = str.match(tagRegex) || [];
  
  let transformed = '';
  let count = 0;
  
  const HEBREW_REGEX = /[\u0590-\u05ff\ufb1d-\ufb4f]/;
  
  for (let i = 0; i < parts.length; i++) {
    let part = parts[i];
    if (HEBREW_REGEX.test(part)) {
      // It has Hebrew. Let's preserve leading and trailing whitespaces/newlines/entities
      const match = part.match(/^(\s*(?:&#?x?[a-zA-Z0-9]+;)*)([\s\S]*?)(\s*(?:&#?x?[a-zA-Z0-9]+;)*)$/);
      if (match) {
        const leading = match[1];
        const middle = match[2];
        const trailing = match[3];
        
        if (HEBREW_REGEX.test(middle)) {
          const prefix = mode === 'RLE' ? '\u202B' : '\u200F';
          const suffix = mode === 'RLE' ? '\u202C' : '\u200F';
          part = leading + prefix + middle + suffix + trailing;
          count++;
        }
      } else {
        // Fallback: just wrap the whole part
        const prefix = mode === 'RLE' ? '\u202B' : '\u200F';
        const suffix = mode === 'RLE' ? '\u202C' : '\u200F';
        part = prefix + part + suffix;
        count++;
      }
    }
    transformed += part;
    if (i < tags.length) {
      transformed += tags[i];
    }
  }
  
  return { transformed, count };
}

function swapBrackets(char: string): string {
  if (char === '(') return ')';
  if (char === ')') return '(';
  if (char === '[') return ']';
  if (char === ']') return '[';
  if (char === '{') return '}';
  if (char === '}') return '{';
  if (char === '<') return '>';
  if (char === '>') return '<';
  return char;
}

function reverseLine(line: string, isMostlyHebrew: boolean): string {
  // 1. Tokenize the line
  const tokenRegex = /(<[^>]+>|&lt;(?:(?!&gt;).)*&gt;|\{[0-9]+\}|%[a-zA-Z]|#[0-9]+#|&[a-zA-Z0-9#]+;|[\u0590-\u05ff\ufb1d-\ufb4f]+|[a-zA-Z0-9]+|\s+|.)/g;
  const tokens = line.match(tokenRegex) || [];
  if (tokens.length === 0) return line;

  // Create parsed tokens
  const parsedTokens = tokens.map(t => {
    let type: 'TAG' | 'PLACEHOLDER' | 'ENTITY' | 'HEBREW' | 'LATIN_NUM' | 'SPACE' | 'OTHER' = 'OTHER';
    if (/^(<[^>]+>|&lt;(?:(?!&gt;).)*&gt;)$/.test(t)) {
      type = 'TAG';
    } else if (/^(\{[0-9]+\}|%[a-zA-Z]|#[0-9]+#)$/.test(t)) {
      type = 'PLACEHOLDER';
    } else if (/^&[a-zA-Z0-9#]+;$/.test(t)) {
      type = 'ENTITY';
    } else if (/^[\u0590-\u05ff\ufb1d-\ufb4f]+$/.test(t)) {
      type = 'HEBREW';
    } else if (/^[a-zA-Z0-9]+$/.test(t)) {
      type = 'LATIN_NUM';
    } else if (/^\s+$/.test(t)) {
      type = 'SPACE';
    }
    return { type, text: t };
  });

  if (isMostlyHebrew) {
    // A. Full visual reverse
    const stack: { name: string; index: number }[] = [];
    const pairs: { openIndex: number; closeIndex: number }[] = [];

    for (let i = 0; i < parsedTokens.length; i++) {
      const token = parsedTokens[i];
      if (token.type === 'TAG') {
        const text = token.text;
        const closeMatch = text.match(/^<\/([a-zA-Z0-9]+)/) || text.match(/^&lt;\/([a-zA-Z0-9]+)/);
        if (closeMatch) {
          const name = closeMatch[1].toLowerCase();
          for (let j = stack.length - 1; j >= 0; j--) {
            if (stack[j].name === name) {
              pairs.push({ openIndex: stack[j].index, closeIndex: i });
              stack.splice(j, 1);
              break;
            }
          }
        } else {
          const openMatch = text.match(/^<([a-zA-Z0-9]+)/) || text.match(/^&lt;([a-zA-Z0-9]+)/);
          if (openMatch) {
            const name = openMatch[1].toLowerCase();
            const isSelfClosing = text.endsWith('/>') || text.endsWith('/&gt;') || name === 'br';
            if (!isSelfClosing) {
              stack.push({ name, index: i });
            }
          }
        }
      }
    }

    const reversedTokens: { type: string; text: string }[] = [];
    for (let i = parsedTokens.length - 1; i >= 0; i--) {
      const token = parsedTokens[i];
      let newText = token.text;
      if (token.type === 'HEBREW') {
        newText = newText.split('').reverse().join('');
      } else if (token.type === 'OTHER' && token.text.length === 1) {
        newText = swapBrackets(token.text);
      }
      reversedTokens.push({ type: token.type, text: newText });
    }

    const L = parsedTokens.length;
    for (const pair of pairs) {
      const openText = parsedTokens[pair.openIndex].text;
      const closeText = parsedTokens[pair.closeIndex].text;
      reversedTokens[L - 1 - pair.closeIndex].text = openText;
      reversedTokens[L - 1 - pair.openIndex].text = closeText;
    }

    return reversedTokens.map(t => t.text).join('');
  } else {
    // B. Run-only reverse
    const transformedTokens = parsedTokens.map(token => {
      if (token.type === 'HEBREW') {
        return token.text.split('').reverse().join('');
      }
      return token.text;
    });
    return transformedTokens.join('');
  }
}

export function visualReverseText(str: string): { transformed: string; count: number } {
  const lineSplitRegex = /(<br\b[^>]*?>|&lt;br\b(?:(?!&gt;).)*&gt;)/gi;
  const lines = str.split(lineSplitRegex);
  
  let transformed = '';
  let count = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i % 2 === 1) {
      transformed += line;
    } else {
      const HEBREW_REGEX = /[\u0590-\u05ff\ufb1d-\ufb4f]/;
      if (HEBREW_REGEX.test(line)) {
        const hebrewCount = (line.match(/[\u0590-\u05ff\ufb1d-\ufb4f]/g) || []).length;
        const englishOrDigitCount = (line.match(/[a-zA-Z0-9]/g) || []).length;
        const totalCount = hebrewCount + englishOrDigitCount;
        const isMostlyHebrew = totalCount > 0 ? (hebrewCount / totalCount >= 0.5) : false;
        
        const reversedLine = reverseLine(line, isMostlyHebrew);
        if (reversedLine !== line) {
          transformed += reversedLine;
          count++;
        } else {
          transformed += line;
        }
      } else {
        transformed += line;
      }
    }
  }
  
  return { transformed, count };
}

function isKeyAllowlisted(key: string, fileName: string, config: ServerConfig): boolean {
  const scope = config.rtlTransformScope || 'selected-keys';
  if (scope === 'all') {
    return true;
  }
  const allowlist = config.rtlTransformKeys || [];
  const baseName = path.basename(fileName);
  
  for (const pattern of allowlist) {
    if (pattern.includes(':')) {
      const parts = pattern.split(':');
      const filePattern = parts[0].trim().toLowerCase();
      const keyPattern = parts.slice(1).join(':').trim();
      
      if (key === keyPattern && baseName.toLowerCase().includes(filePattern)) {
        return true;
      }
    } else {
      if (pattern.trim() === key) {
        return true;
      }
    }
  }
  return false;
}

export function applyRtlTextWorkaround(
  xmlContent: string,
  mode: 'RLE' | 'RLM' | 'VISUAL_REVERSE',
  config: ServerConfig,
  fileName: string
): {
  transformed: string;
  count: number;
  wrappedKeys: string[];
  transformedKeys: string[];
  skippedKeys: string[];
  visualReverseSamples?: Array<{ key: string; before: string; after: string }>;
} {
  let transformed = xmlContent;
  let count = 0;
  const wrappedKeys: string[] = [];
  const transformedKeys: string[] = [];
  const skippedKeys: string[] = [];
  const visualReverseSamples: Array<{ key: string; before: string; after: string }> = [];

  let currentSection = 'chat';
  const tokenRegex = /(<Section\s+name="([^"]+)"\s*>|<\/Section\s*>|<M\s+[^>]*?>|<m[s]?\s+[^>]*?>)/g;
  const HEBREW_REGEX = /[\u0590-\u05ff\ufb1d-\ufb4f]/;

  transformed = xmlContent.replace(tokenRegex, (match) => {
    if (match.startsWith('<Section')) {
      const nameMatch = match.match(/name="([^"]+)"/);
      if (nameMatch) {
        currentSection = nameMatch[1];
      }
      return match;
    }
    
    if (match.startsWith('</Section')) {
      currentSection = 'chat';
      return match;
    }
    
    if (match.startsWith('<M')) {
      const idMatch = match.match(/id="([^"]+)"/);
      const msgMatch = match.match(/msg="([^"]*?)"/);
      
      if (idMatch && msgMatch) {
        const id = idMatch[1];
        const msg = msgMatch[1];
        
        if (HEBREW_REGEX.test(msg)) {
          const key = `${currentSection}.${id}`;
          if (isKeyAllowlisted(key, fileName, config)) {
            if (mode === 'VISUAL_REVERSE') {
              const result = visualReverseText(msg);
              if (result.count > 0) {
                count += result.count;
                transformedKeys.push(key);
                visualReverseSamples.push({ key, before: msg, after: result.transformed });
                const newMsgAttr = `msg="${result.transformed.replace(/"/g, '&quot;')}"`;
                return match.replace(/msg="[^"]*?"/, newMsgAttr);
              }
            } else {
              const wrapped = wrapHebrewText(msg, mode);
              if (wrapped.count > 0) {
                count += wrapped.count;
                wrappedKeys.push(key);
                const newMsgAttr = `msg="${wrapped.transformed.replace(/"/g, '&quot;')}"`;
                return match.replace(/msg="[^"]*?"/, newMsgAttr);
              }
            }
          } else {
            skippedKeys.push(key);
          }
        }
      }
      return match;
    }
    
    if (match.startsWith('<m') || match.startsWith('<ms')) {
      const idMatch = match.match(/id="([^"]+)"/);
      const txtMatch = match.match(/txt="([^"]*?)"/);
      const titleMatch = match.match(/title="([^"]*?)"/);
      const labelMatch = match.match(/label="([^"]*?)"/);
      
      let updatedTag = match;
      const id = idMatch ? idMatch[1] : 'unknown';
      
      if (txtMatch) {
        const txt = txtMatch[1];
        if (HEBREW_REGEX.test(txt)) {
          const key = `chat.${id}.txt`;
          if (isKeyAllowlisted(key, fileName, config)) {
            if (mode === 'VISUAL_REVERSE') {
              const result = visualReverseText(txt);
              if (result.count > 0) {
                count += result.count;
                transformedKeys.push(key);
                visualReverseSamples.push({ key, before: txt, after: result.transformed });
                const newTxtAttr = `txt="${result.transformed.replace(/"/g, '&quot;')}"`;
                updatedTag = updatedTag.replace(/txt="[^"]*?"/, newTxtAttr);
              }
            } else {
              const wrapped = wrapHebrewText(txt, mode);
              if (wrapped.count > 0) {
                count += wrapped.count;
                wrappedKeys.push(key);
                const newTxtAttr = `txt="${wrapped.transformed.replace(/"/g, '&quot;')}"`;
                updatedTag = updatedTag.replace(/txt="[^"]*?"/, newTxtAttr);
              }
            }
          } else {
            skippedKeys.push(key);
          }
        }
      }
      
      if (titleMatch) {
        const title = titleMatch[1];
        if (HEBREW_REGEX.test(title)) {
          const key = `chat.${id}.title`;
          if (isKeyAllowlisted(key, fileName, config)) {
            if (mode === 'VISUAL_REVERSE') {
              const result = visualReverseText(title);
              if (result.count > 0) {
                count += result.count;
                transformedKeys.push(key);
                visualReverseSamples.push({ key, before: title, after: result.transformed });
                const newTitleAttr = `title="${result.transformed.replace(/"/g, '&quot;')}"`;
                updatedTag = updatedTag.replace(/title="[^"]*?"/, newTitleAttr);
              }
            } else {
              const wrapped = wrapHebrewText(title, mode);
              if (wrapped.count > 0) {
                count += wrapped.count;
                wrappedKeys.push(key);
                const newTitleAttr = `title="${wrapped.transformed.replace(/"/g, '&quot;')}"`;
                updatedTag = updatedTag.replace(/title="[^"]*?"/, newTitleAttr);
              }
            }
          } else {
            skippedKeys.push(key);
          }
        }
      }

      if (labelMatch) {
        const label = labelMatch[1];
        if (HEBREW_REGEX.test(label)) {
          const key = `chat.${id}.label`;
          if (isKeyAllowlisted(key, fileName, config)) {
            if (mode === 'VISUAL_REVERSE') {
              const result = visualReverseText(label);
              if (result.count > 0) {
                count += result.count;
                transformedKeys.push(key);
                visualReverseSamples.push({ key, before: label, after: result.transformed });
                const newLabelAttr = `label="${result.transformed.replace(/"/g, '&quot;')}"`;
                updatedTag = updatedTag.replace(/label="[^"]*?"/, newLabelAttr);
              }
            } else {
              const wrapped = wrapHebrewText(label, mode);
              if (wrapped.count > 0) {
                count += wrapped.count;
                wrappedKeys.push(key);
                const newLabelAttr = `label="${wrapped.transformed.replace(/"/g, '&quot;')}"`;
                updatedTag = updatedTag.replace(/label="[^"]*?"/, newLabelAttr);
              }
            }
          } else {
            skippedKeys.push(key);
          }
        }
      }
      
      return updatedTag;
    }
    
    return match;
  });

  return { transformed, count, wrappedKeys, transformedKeys, skippedKeys, visualReverseSamples };
}

export function decodeXmlAttributeValue(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function escapeXmlAttributeValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n|\r|\n/g, '&#10;');
}

export function extractPlainTextFromTlf(value: string): string {
  return decodeXmlAttributeValue(value)
    .replace(/<\?xml[\s\S]*?\?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractDisplayPlainTextFromTlf(value: string): string {
  return decodeXmlAttributeValue(value)
    .replace(/<\?xml[\s\S]*?\?>/gi, ' ')
    .replace(/<\/\s*(?:flow:)?p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split(/\r\n|\r|\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 0)
    .join('\n');
}

function buildMinimalLoadingScreenTextFlow(plainText: string): string {
  const lines = plainText
    .split(/\r\n|\r|\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);
  const safeLines = lines.length > 0 ? lines : [''];
  const paragraphs = safeLines.map(line =>
    `<flow:p direction="rtl" textAlign="center"><flow:span fontFamily="Arial" fontSize="28">${escapeXmlText(line)}</flow:span></flow:p>`
  ).join('');
  return `<?xml version="1.0" encoding="utf-8"?><flow:TextFlow xmlns:flow="http://ns.adobe.com/textLayout/2008">${paragraphs}</flow:TextFlow>`;
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function classifyFontClassTextLayoutInput(value: string): 'tlf' | 'plain' | 'empty' | 'unknown' {
  if (value.length === 0) {
    return 'empty';
  }
  if (/(?:<\s*(?:\?xml|flow:TextFlow|TextFlow))|(?:&lt;\s*(?:\?xml|flow:TextFlow|TextFlow))/i.test(value)) {
    return 'tlf';
  }
  if (/[^\s]/.test(value)) {
    return 'plain';
  }
  return 'unknown';
}

function applyCompatLoadingScreenTextTransform(
  content: string,
  config: ServerConfig,
  filePath: string
): string {
  const mode = config.compatLoadingScreenTextMode || 'off';
  if (mode === 'off') {
    return content;
  }

  const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');
  const isHebrewLang1 =
    normalizedPath.includes('lang.aspx%3flang%3d1') ||
    normalizedPath.includes('lang.aspx?lang=1');
  if (!isHebrewLang1) {
    return content;
  }

  const loadingSectionMatch = content.match(/<Section name="LoadingScreen">([\s\S]*?)<\/Section>/);
  if (!loadingSectionMatch || loadingSectionMatch.index === undefined) {
    return content;
  }

  const sectionStart = loadingSectionMatch.index;
  const sectionEnd = sectionStart + loadingSectionMatch[0].length;
  const beforeSection = content.slice(0, sectionStart);
  const section = content.slice(sectionStart, sectionEnd);
  const afterSection = content.slice(sectionEnd);

  let applied = false;
  let originalWasTlf = false;
  let originalLength = 0;
  let extractedPlainText = '';
  let replacementLength = 0;
  let resolvedMessage = '';
  let inputKind: 'tlf' | 'plain' | 'empty' | 'unknown' = 'unknown';

  const transformedSection = section.replace(
    /<M\b([^>]*\bid="1"[^>]*\bmsg=")([\s\S]*?)("\s*\/>)/,
    (match, prefix, rawMsg, suffix) => {
      originalLength = rawMsg.length;
      originalWasTlf = /(?:&lt;|<)\s*(?:\?xml|flow:TextFlow|TextFlow)/i.test(rawMsg);
      if (!originalWasTlf) {
        return match;
      }

      extractedPlainText = extractPlainTextFromTlf(rawMsg);
      const displayPlainText = extractDisplayPlainTextFromTlf(rawMsg) || extractedPlainText;
      const replacement =
        mode === 'plain' || mode === 'fallback-plain' ? displayPlainText :
        mode === 'minimal-tlf' ? buildMinimalLoadingScreenTextFlow(displayPlainText) :
        mode === 'simple' ? 'טוען...' :
        '';
      resolvedMessage = replacement;
      inputKind = classifyFontClassTextLayoutInput(replacement);
      replacementLength = replacement.length;
      applied = true;
      return `${prefix}${escapeXmlAttributeValue(replacement)}${suffix}`;
    }
  );

  if (!applied) {
    return content;
  }

  ruffleDiagnosticsManager.recordCompatLoadingScreenTextTransform({
    mode,
    applied,
    originalWasTlf,
    originalLength,
    extractedPlainText,
    replacementLength,
    resolvedMessage,
    inputKind,
    inputLength: resolvedMessage.length
  });
  logger.info(
    'http',
    `[HTTP] LoadingScreen text compatibility transform applied: mode=${mode}, originalWasTlf=${originalWasTlf}, originalLength=${originalLength}, replacementLength=${replacementLength}, inputKind=${inputKind}`
  );
  return beforeSection + transformedSection + afterSection;
}

function readAssetFile(filePath: string, config: ServerConfig): Buffer {
  const lowerPath = filePath.toLowerCase().replace(/\\/g, '/');
  const ext = path.extname(filePath).toLowerCase();
  const isXmlOrText = ext === '.xml' || ext === '.txt' || lowerPath.includes('lang.aspx') || lowerPath.includes('lang.aspx%3f');
  const isLangPath = lowerPath.includes('/xmls/lang/') || lowerPath.includes('lang.aspx');
  const isLanguageXmlResponse = isXmlOrText && isLangPath;
  const isLangXml = (config.compatFixLanguageXml || config.rtlTextWorkaround || (config.compatLoadingScreenTextMode || 'off') !== 'off') && isLanguageXmlResponse;

  if (isLangXml) {
    const content = fs.readFileSync(filePath, 'utf8');
    let transformed = content;
    const appliedFixes: string[] = [];

    if (config.compatFixLanguageXml) {
      // Remove Wayback Machine injected header
      const waybackHeaderIndex = transformed.indexOf('<!-- END WAYBACK TOOLBAR INSERT -->');
      if (waybackHeaderIndex !== -1) {
        const xmlBody = transformed.substring(waybackHeaderIndex + '<!-- END WAYBACK TOOLBAR INSERT -->'.length);
        if (xmlBody.trim().startsWith('<?xml')) {
          transformed = xmlBody.trim();
        } else {
          transformed = '<?xml version="1.0" encoding="utf-8"?>\n' + xmlBody.trim();
        }
        appliedFixes.push('removed Wayback Machine toolbar header');
      }

      const pattern = /<br\b([^>/]*?)>/gi;
      const preBr = transformed;
      transformed = transformed.replace(pattern, '<br$1/>');
      if (transformed !== preBr) {
        appliedFixes.push('self-closing br tags');
      }

      const openComments = (transformed.match(/<!--/g) || []).length;
      const closeComments = (transformed.match(/-->/g) || []).length;
      if (openComments > closeComments) {
        transformed += '-->';
        appliedFixes.push('closed unterminated XML comment');
      }

      // === Buttuns alias fix ===
      const hasButtuns = transformed.includes('name="Buttuns"');
      if (!hasButtuns) {
        const buttonsMatch = transformed.match(/<Section name="Buttons">([\s\S]*?)<\/Section>/);
        if (buttonsMatch) {
          const buttonsInner = buttonsMatch[1];
          const buttonsAlias = `<Section name="Buttuns">${buttonsInner}</Section>`;
          const sectionsCloseIdx = transformed.lastIndexOf('</Sections>');
          if (sectionsCloseIdx !== -1) {
            transformed = transformed.slice(0, sectionsCloseIdx) + buttonsAlias + transformed.slice(sectionsCloseIdx);
            appliedFixes.push('injected Buttuns alias for Buttons (getButtonAlt typo fix)');
            logger.info('http', '[HTTP] lang.aspx: Injected <Section name="Buttuns"> as alias for <Section name="Buttons"> (SWF getButtonAlt typo fix)');
          }
        }
      }

      // === Diagnostics: record which critical sections are present ===
      const criticalSections = ['Buttons', 'Buttuns', 'ControlPanel', 'Login', 'LoginMsg',
        'Errors', 'General', 'Chat', 'MessageBox', 'BuddyList', 'UserCard', 'Close', 'TipOfTheDay'];
      const sectionsPresent: Record<string, boolean> = {};
      for (const sec of criticalSections) {
        sectionsPresent[sec] = transformed.includes(`name="${sec}"`);
      }
      ruffleDiagnosticsManager.recordLanguageSectionsPresent(sectionsPresent);
    }

    if (config.rtlTextWorkaround === true && !lowerPath.includes('chat_')) {
      const mode = config.rtlWrapMode || 'RLE';
      ruffleDiagnosticsManager.recordRtlTextWorkaroundConfig(
        true,
        mode,
        config.rtlTransformScope || 'selected-keys',
        config.rtlTransformKeys || []
      );
      const result = applyRtlTextWorkaround(transformed, mode, config, filePath);
      transformed = result.transformed;
      appliedFixes.push(`applied RTL text workaround (${mode}, count: ${result.count})`);
      if (mode === 'VISUAL_REVERSE') {
        ruffleDiagnosticsManager.recordRtlVisualReverse(
          result.count,
          result.transformedKeys,
          result.skippedKeys,
          result.visualReverseSamples || []
        );
      } else {
        ruffleDiagnosticsManager.recordRtlTextWorkaround(result.count, result.wrappedKeys);
      }
    }

    const preLoadingScreenTextTransform = transformed;
    transformed = applyCompatLoadingScreenTextTransform(transformed, config, filePath);
    if (transformed !== preLoadingScreenTextTransform) {
      appliedFixes.push(`loading screen text mode (${config.compatLoadingScreenTextMode || 'off'})`);
    }

    if (appliedFixes.length > 0) {
      logger.info('http', `[HTTP] Compatibility transform applied: ${appliedFixes.join(', ')} for ${path.basename(filePath)}`);
    }
    return Buffer.from(transformed, 'utf8');
  }
  return fs.readFileSync(filePath);
}

function getAssetContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.swf') return 'application/x-shockwave-flash';
  if (ext === '.xml') return 'text/xml; charset=utf-8';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.html') return 'text/html; charset=utf-8';
  return 'application/octet-stream';
}

function resolveCaseInsensitivePath(rootDir: string, relativePath: string): string | null {
  const safeRelativePath = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (safeRelativePath.includes('\0') || safeRelativePath.split('/').includes('..')) {
    return null;
  }

  const root = path.resolve(rootDir);
  let current = root;
  const segments = safeRelativePath.split('/').filter(Boolean);

  for (const segment of segments) {
    if (!fs.existsSync(current) || !fs.statSync(current).isDirectory()) {
      return null;
    }
    const entries = fs.readdirSync(current);
    const match = entries.find(entry => entry.toLowerCase() === segment.toLowerCase());
    if (!match) {
      return null;
    }
    current = path.join(current, match);
  }

  const resolved = path.resolve(current);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null;
  }
  return safeFileExists(resolved) ? resolved : null;
}

function resolveSoundCompatPath(assetsPath: string, relativePath: string): string | null {
  if (path.extname(relativePath).toLowerCase() !== '.mp3') {
    return null;
  }

  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const candidates: string[] = [];
  const addCandidate = (candidate: string) => {
    const clean = candidate.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '');
    if (clean && !candidates.includes(clean)) {
      candidates.push(clean);
    }
  };

  addCandidate(normalized);

  const soundSoundMatch = normalized.match(/^(?:Swf\/)?Sound\/Sound\/(.+)$/i);
  if (soundSoundMatch) {
    addCandidate(`Sound/${soundSoundMatch[1]}`);
    addCandidate(`Swf/Sound/${soundSoundMatch[1]}`);
  }

  const soundRoomsMatch = normalized.match(/^(?:Swf\/)?Sound\/Rooms\/(.+)$/i);
  if (soundRoomsMatch) {
    addCandidate(`Sound/${soundRoomsMatch[1]}`);
    addCandidate(`Swf/Sound/${soundRoomsMatch[1]}`);
    const stripped = soundRoomsMatch[1].replace(/^\/?sound\/+/i, '');
    if (stripped && stripped !== soundRoomsMatch[1]) {
      addCandidate(`Sound/${stripped}`);
      addCandidate(`Swf/Sound/${stripped}`);
    }
  }

  for (const candidate of candidates) {
    const caseInsensitive = resolveCaseInsensitivePath(assetsPath, candidate);
    if (caseInsensitive) {
      return caseInsensitive;
    }
    const resolved = resolveSafePath(assetsPath, candidate);
    if (resolved && safeFileExists(resolved)) {
      return resolved;
    }
  }

  return null;
}

function sendAssetBuffer(
  request: any,
  reply: any,
  filePath: string,
  config: ServerConfig,
  contentType: string,
  deliveryMode: string
) {
  const buffer = readAssetFile(filePath, config);
  const isMp3 = path.extname(filePath).toLowerCase() === '.mp3';
  const rangeHeader = typeof request.headers?.range === 'string' ? request.headers.range : null;

  (request as any).deliveryMode = deliveryMode;
  (request as any).byteSize = buffer.length;
  reply.type(contentType);

  if (isMp3) {
    reply.header('Accept-Ranges', 'bytes');
  }

  if (isMp3 && rangeHeader) {
    const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    if (match) {
      const total = buffer.length;
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;

      if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end >= start && start < total) {
        const chunk = buffer.subarray(start, end + 1);
        (request as any).byteSize = chunk.length;
        reply
          .code(206)
          .header('Content-Range', `bytes ${start}-${end}/${total}`)
          .header('Content-Length', String(chunk.length));
        return reply.send(chunk);
      }

      reply.header('Content-Range', `bytes */${total}`);
      return reply.code(416).send();
    }
  }

  reply.header('Content-Length', String(buffer.length));
  return reply.send(buffer);
}

export function registerAssetsRoute(fastify: FastifyInstance, config: ServerConfig) {
  
  // Register hook for language asset diagnostics
  fastify.addHook('onSend', async (request, reply, payload) => {
    const rawUrl = request.raw.url || '';
    const urlLower = rawUrl.toLowerCase();
    const isLangRequest = urlLower.includes('/xmls/lang/') || urlLower.includes('lang.aspx') || urlLower.includes('chat_');
    
    if (isLangRequest) {
      ruffleDiagnosticsManager.recordLanguageAssetRequest(rawUrl);
      if (reply.statusCode === 200) {
        ruffleDiagnosticsManager.recordLanguageAssetServed(rawUrl);
        if (payload && (typeof payload === 'string' || Buffer.isBuffer(payload))) {
          try {
            const str = payload.toString();
            const keysCount = (str.match(/<M\s+id=/g) || []).length;
            if (keysCount > 0) {
              ruffleDiagnosticsManager.recordLastLanguageXmlKeys(keysCount);
            }
          } catch (e) {}
        }
      } else if (reply.statusCode === 404) {
        ruffleDiagnosticsManager.recordLanguageAssetMissing(rawUrl);
      }
    }

    const isFontRequest = config.ruffleFontSources && config.ruffleFontSources.some(src => {
      const cleanSrc = src.split('?')[0].toLowerCase();
      const cleanUrl = urlLower.split('?')[0];
      return cleanUrl.endsWith(cleanSrc) || cleanSrc.endsWith(cleanUrl);
    });

    if (isFontRequest) {
      ruffleDiagnosticsManager.recordFontSourceRequest(rawUrl, reply.statusCode === 200);
    }

    const isMogoWallSwf = urlLower.includes('mogowall.swf');
    const isMogoWallTxt = urlLower.includes('mogowall.txt');
    if (isMogoWallSwf) {
      ruffleDiagnosticsManager.recordMogoWallSwf(true, reply.statusCode === 200);
    }
    if (isMogoWallTxt) {
      if (reply.statusCode === 200 && payload) {
        try {
          const contentStr = payload.toString();
          const cleanContent = contentStr.replace(/\r/g, "");
          const parsed = JSON.parse(cleanContent);
          const keys = Object.keys(parsed);
          ruffleDiagnosticsManager.recordMogoWallTxt(true, true, true, keys);
        } catch (e) {
          ruffleDiagnosticsManager.recordMogoWallTxt(true, true, false, []);
        }
      } else {
        ruffleDiagnosticsManager.recordMogoWallTxt(true, reply.statusCode === 200, false, []);
      }
    }

    return payload;
  });

  // Wildcard handler for all static asset requests (SWFs, XMLs, Sounds, etc.)
  fastify.get('/*', async (request, reply) => {
    const rawUrl = request.raw.url || '';
    
    // Normalize path by redirecting /./ to prevent Flash Player LSO folder creation errors
    if (rawUrl.includes('/./')) {
      const normalizedUrl = rawUrl.replace('/./', '/');
      (request as any).deliveryMode = 'fallback';
      (request as any).byteSize = 0;
      return reply.redirect(normalizedUrl, 302);
    }

    let decodedUrl = rawUrl;
    try {
      decodedUrl = decodeURIComponent(rawUrl);
    } catch (err) {}

    logger.debug('http', `Raw URL requested: "${rawUrl}" | Decoded URL: "${decodedUrl}"`);

    const urlObj = new URL(decodedUrl, 'http://localhost');
    let pathname = urlObj.pathname;
    let relativePath = pathname.replace(/^\//, ''); // Strip leading slash

    // Custom Ruffle Fonts serving
    if (pathname.toLowerCase().startsWith('/rufflefonts/') || relativePath.toLowerCase().startsWith('rufflefonts/')) {
      const fontFilename = path.basename(relativePath);
      const workspaceFontsDir = path.resolve(config.assetsPath, '..', 'ruffle-fonts');
      const resolvedFontPath = resolveSafePath(workspaceFontsDir, fontFilename);

      if (resolvedFontPath && safeFileExists(resolvedFontPath)) {
        logger.info('http', `Served custom Ruffle font: [RuffleFonts] "${relativePath}" -> "${resolvedFontPath}"`);
        const ext = path.extname(resolvedFontPath).toLowerCase();
        let contentType = 'application/octet-stream';
        if (ext === '.swf') contentType = 'application/x-shockwave-flash';
        
        reply.type(contentType);
        const buffer = fs.readFileSync(resolvedFontPath);
        (request as any).deliveryMode = 'asset-backed';
        (request as any).byteSize = buffer.length;
        return reply.send(buffer);
      } else {
        logger.warn('http', `[RuffleFonts] Requested font "${relativePath}" but file was not found in ruffle-fonts directory.`);
      }
    }

    const pathnameLower = pathname.toLowerCase();
    ruffleDiagnosticsManager.recordPotentialRoomBackSoundRequest(pathname);
    ruffleDiagnosticsManager.recordControlPanelAssetRequest(pathname);
    if (pathnameLower.endsWith('.mp3')) {
      ruffleDiagnosticsManager.recordSoundRequest(pathname);
    }

    // Check debug-assets overlay first
    const overlayPath = resolveSafePath(config.debugAssetsPath, relativePath);
    if (overlayPath && safeFileExists(overlayPath)) {
      logger.info('http', `Served override debug asset: [Debug-Assets-Overlay] "${relativePath}" -> "${overlayPath}"`);
      const contentType = getAssetContentType(overlayPath);
      if (path.extname(overlayPath).toLowerCase() === '.mp3') {
        ruffleDiagnosticsManager.recordSoundServed(pathname, overlayPath, contentType);
      }
      if (path.extname(overlayPath).toLowerCase() === '.txt') {
        recordRoomTxtConfigIfApplicable(pathname, overlayPath);
      }
      ruffleDiagnosticsManager.recordControlPanelAssetRequest(pathname, true, path.relative(config.assetsPath, overlayPath));
      return sendAssetBuffer(request, reply, overlayPath, config, contentType, 'asset-backed');
    }

    if (pathnameLower.includes('rooms/') || pathnameLower.includes('room_') || pathnameLower.includes('room20')) {
      ruffleDiagnosticsManager.recordRoomAssetRequest(pathname);
    }
    if (pathnameLower.endsWith('/mogo.swf') || pathnameLower === 'mogo.swf') {
      timelineManager.recordMilestone(request.ip, request.headers['user-agent'] || '', 'Mogo.swf served');
    } else if (pathnameLower.endsWith('/logingr.swf') || pathnameLower === 'logingr.swf') {
      timelineManager.recordMilestone(request.ip, request.headers['user-agent'] || '', 'loginGR.swf served');
    } else if (pathnameLower.endsWith('/login.swf') || pathnameLower === 'login.swf') {
      timelineManager.recordMilestone(request.ip, request.headers['user-agent'] || '', 'Login.swf served');
    } else if (pathnameLower.endsWith('/main.swf') || pathnameLower === 'main.swf') {
      timelineManager.recordMilestone(request.ip, request.headers['user-agent'] || '', 'Main.swf served');
    } else if (pathnameLower.endsWith('/loadingscreen_1.swf') || pathnameLower === 'loadingscreen_1.swf') {
      timelineManager.recordMilestone(request.ip, request.headers['user-agent'] || '', 'LoadingScreen_1.swf served');
    }

    if (pathnameLower.includes('controlpanel') || pathnameLower.includes('control_panel')) {
      timelineManager.recordMilestone(request.ip, request.headers['user-agent'] || '', 'controlPanelAssetLoaded');
    }
    if (pathnameLower.includes('avatarsgr') || pathnameLower.includes('avatars.swf')) {
      timelineManager.recordMilestone(request.ip, request.headers['user-agent'] || '', 'avatarsGrAssetLoaded');
    }
    if (pathnameLower.includes('room_20.swf') || pathnameLower.includes('room20.swf')) {
      timelineManager.recordMilestone(request.ip, request.headers['user-agent'] || '', 'room20AssetLoaded');
    }

    if (pathnameLower.includes('room_20.txt') || pathnameLower.includes('room20.txt')) {
      ruffleDiagnosticsManager.recordRoom20Txt({ requested: true });
      let targetPath = resolveSafePath(config.assetsPath, relativePath);
      if (!targetPath || !safeFileExists(targetPath)) {
        const basename = path.basename(relativePath);
        const searchDirs = [
          path.join(config.assetsPath, 'Swf'),
          path.join(config.assetsPath, 'Xmls'),
          path.join(config.assetsPath, 'Servises'),
          path.join(config.assetsPath, 'services'),
          path.join(config.assetsPath, 'Swf', 'AssetsClean', 'Rooms'),
          config.assetsPath
        ];
        for (const searchDir of searchDirs) {
          if (fs.existsSync(searchDir)) {
            const potential = path.join(searchDir, basename);
            if (fs.existsSync(potential) && fs.statSync(potential).isFile()) {
              targetPath = potential;
              break;
            }
          }
        }
      }
      if (targetPath && safeFileExists(targetPath)) {
        ruffleDiagnosticsManager.recordRoom20Txt({ served: true });
        timelineManager.recordMilestone(request.ip, request.headers['user-agent'] || '', 'room20TxtServed');
          try {
            const content = fs.readFileSync(targetPath, 'utf8');
            recordRoomTxtConfigIfApplicable(pathname, targetPath);
            const sizeBytes = Buffer.byteLength(content, 'utf8');
          let jsonValid = false;
          let topLevelKeys: string[] = [];
          let parseError: string | null = null;
          try {
            const parsed = JSON.parse(content);
            jsonValid = true;
            topLevelKeys = Object.keys(parsed);
          } catch (e: any) {
            parseError = e.message;
          }
          ruffleDiagnosticsManager.recordRoom20Txt({
            sizeBytes,
            jsonValid,
            topLevelKeys,
            parseError
          });
        } catch (err: any) {
          ruffleDiagnosticsManager.recordRoom20Txt({
            parseError: `Failed to read file: ${err.message}`
          });
        }
      }
    }

    // 0. Intercept LoginU.aspx dynamically if it contains mog/md parameters
    if (pathname.toLowerCase().includes('loginu.aspx') || rawUrl.toLowerCase().includes('loginu.aspx')) {
      const query = request.query as any;
      const rawUrlLower = rawUrl.toLowerCase();
      const hasMog = (query && (query.mog !== undefined || query.md !== undefined)) ||
                     rawUrlLower.includes('mog=') ||
                     rawUrlLower.includes('md=') ||
                     rawUrlLower.includes('mog%3d') ||
                     rawUrlLower.includes('md%3d');
      if (hasMog) {
        logger.info('http', `[HTTP] Intercepted LoginU.aspx in wildcard route: "${rawUrl}"`);
        return handleLoginU(request, reply, config);
      }
    }

    // 1. Specialized handling for lang.aspx and its URL-encoded query variations
    if (pathname.toLowerCase().includes('lang.aspx') || rawUrl.toLowerCase().includes('lang.aspx')) {
      logger.info('http', `Detected legacy lang.aspx request. Raw: "${rawUrl}" | Decoded: "${decodedUrl}"`);
      
      // Try to parse the language parameter (default to '1')
      let langId = '1';
      const langMatch = decodedUrl.match(/(?:lang|lang%3d)[=\b]?(\d+)/i) || rawUrl.match(/(?:lang|lang%3d)[=\b]?(\d+)/i);
      if (langMatch) {
        langId = langMatch[1];
      }
      const originalLangId = langId;

      if (langId === '0') {
        const defaultLang = config.defaultLanguage !== undefined ? config.defaultLanguage : 1;
        logger.info('http', `[HTTP] Language alias: lang=0 -> lang=${defaultLang}`);
        langId = String(defaultLang);
      }

      const getLangFile = (id: string) => {
        const variations = [
          `Servises/lang.aspx%3flang%3d${id}`,
          `services/lang.aspx%3flang%3d${id}`,
          `lang.aspx%3flang%3d${id}`
        ];
        if (id === langId) {
          variations.push(`lang.aspx`);
        }
        for (const relPath of variations) {
          const fullPath = resolveSafePath(config.assetsPath, relPath);
          if (fullPath && safeFileExists(fullPath)) {
            return { fullPath, relPath };
          }
        }
        return null;
      };

      let result = getLangFile(langId);
      if (result) {
        logger.success('http', `Served lang.aspx: [Asset-Backed] via subpath "${result.relPath}"`);
        reply.type('text/xml; charset=utf-8');
        const buffer = readAssetFile(result.fullPath, config);
        (request as any).deliveryMode = 'asset-backed';
        (request as any).byteSize = buffer.length;
        return reply.send(buffer);
      }

      // Fallback logic for lang=0
      if (originalLangId === '0') {
        const defaultLang = config.defaultLanguage !== undefined ? config.defaultLanguage : 1;
        if (defaultLang !== 1) {
          // Fallback to lang=1
          result = getLangFile('1');
          if (result) {
            logger.info('http', `[HTTP] Language fallback: lang=0 -> lang=1`);
            reply.type('text/xml; charset=utf-8');
            const buffer = readAssetFile(result.fullPath, config);
            (request as any).deliveryMode = 'fallback';
            (request as any).byteSize = buffer.length;
            return reply.send(buffer);
          }
        }

        // Return minimal XML if all missing
        const minXml = '<?xml version="1.0" encoding="utf-8"?><Root></Root>';
        logger.warn('http', `[HTTP] Language fallback: lang=0 -> minimal XML`);
        reply.type('text/xml; charset=utf-8');
        (request as any).deliveryMode = 'fallback';
        (request as any).byteSize = Buffer.byteLength(minXml);
        return reply.send(minXml);
      }

      logger.warn('http', `[MISSING ASSET] lang.aspx language file (langId: ${langId}) not found in assets!`);
      (request as any).deliveryMode = 'missing';
      (request as any).byteSize = 0;
      return reply.status(404).send(`Missing lang.aspx for langId ${langId}`);
    }

    // 2. Standard asset serving (preserve original relative path)

    // Compatibility graphics alias mapping (e.g. loginGR.swf -> BaseLoginGR.swf)
    const lowerRel = relativePath.toLowerCase();
    if (config.compatLoginGraphicsAlias && (lowerRel === 'swf/assets/logingr.swf' || lowerRel === 'swf/logingr.swf' || lowerRel === 'logingr.swf')) {
      const aliasVal = config.compatLoginGraphicsAlias;
      const isSafe = !aliasVal.includes('..') && 
                     !aliasVal.includes(':') && 
                     !aliasVal.includes('/') && 
                     !aliasVal.includes('\\');
      
      if (isSafe) {
        const approvedSubLocations = [
          path.join('Swf', 'Assets', aliasVal),
          path.join('Swf', aliasVal),
          aliasVal
        ];
        
        let aliasPath: string | null = null;
        for (const subLoc of approvedSubLocations) {
          const resolved = resolveSafePath(config.assetsPath, subLoc);
          if (resolved && safeFileExists(resolved)) {
            aliasPath = resolved;
            break;
          }
        }
        
        if (aliasPath) {
          logger.info('http', `[HTTP] Compatibility alias applied: loginGR.swf -> ${aliasVal}`);
          reply.type('application/x-shockwave-flash');
          const buffer = fs.readFileSync(aliasPath);
          (request as any).deliveryMode = 'compat-alias';
          (request as any).byteSize = buffer.length;
          return reply.send(buffer);
        } else {
          logger.warn('http', `[HTTP] Compatibility alias configured as "${aliasVal}" but file was not found in approved locations inside assetsPath.`);
        }
      } else {
        logger.error('http', `[HTTP] Refused to apply unsafe compatibility alias: "${aliasVal}"`);
      }
    }

    // Temporary runtime alias: english.xml -> hebrew.xml if english.xml is missing
    if (relativePath.toLowerCase() === 'xmls/lang/english.xml') {
      const standardEnglishPath = resolveSafePath(config.assetsPath, relativePath);
      if (!standardEnglishPath || !safeFileExists(standardEnglishPath)) {
        relativePath = 'Xmls/lang/hebrew.xml';
        logger.info('http', `[HTTP] Alias applied: "Xmls/lang/english.xml" -> "Xmls/lang/hebrew.xml" (english.xml is missing)`);
      }
    }

    // Alias Swf/ServersList.swf to Swf/Assets/ServersListGR.swf if present in assets
    if (relativePath.toLowerCase() === 'swf/serverslist.swf' || relativePath.toLowerCase() === 'serverslist.swf') {
      const aliasPath = resolveSafePath(config.assetsPath, 'Swf/Assets/ServersListGR.swf');
      if (aliasPath && safeFileExists(aliasPath)) {
        logger.info('http', `Served alias: "${relativePath}" -> "Swf/Assets/ServersListGR.swf" [Asset-Backed]`);
        reply.type('application/x-shockwave-flash');
        const buffer = fs.readFileSync(aliasPath);
        (request as any).deliveryMode = 'asset-backed';
        (request as any).byteSize = buffer.length;
        return reply.send(buffer);
      }
    }

    // Intercept chat_0.xml dynamically
    if (relativePath.toLowerCase().endsWith('chat_0.xml')) {
      const defaultLang = config.defaultLanguage !== undefined ? config.defaultLanguage : 1;
      const targetChatFile = `chat_${defaultLang}.xml`;
      logger.info('http', `[HTTP] Chat alias: chat_0.xml -> ${targetChatFile}`);

      const chatDefaultRelPath = relativePath.replace(/chat_0\.xml$/i, targetChatFile);
      const chatDefaultPath = resolveSafePath(config.assetsPath, chatDefaultRelPath);
      if (chatDefaultPath && safeFileExists(chatDefaultPath)) {
        reply.type('text/xml; charset=utf-8');
        const buffer = readAssetFile(chatDefaultPath, config);
        (request as any).deliveryMode = 'asset-backed';
        (request as any).byteSize = buffer.length;
        return reply.send(buffer);
      }

      // Default language chat file is missing. Try fallback to chat_1.xml
      const chat1RelPath = relativePath.replace(/chat_0\.xml$/i, 'chat_1.xml');
      const chat1Path = resolveSafePath(config.assetsPath, chat1RelPath);
      if (chat1Path && safeFileExists(chat1Path)) {
        logger.info('http', `[HTTP] Chat fallback: chat_0.xml -> chat_1.xml`);
        reply.type('text/xml; charset=utf-8');
        const buffer = readAssetFile(chat1Path, config);
        (request as any).deliveryMode = 'fallback';
        (request as any).byteSize = buffer.length;
        return reply.send(buffer);
      }

      // If all missing, return minimal valid chat XML
      const minChatXml = '<?xml version="1.0" encoding="utf-8"?><Lang><chat></chat></Lang>';
      logger.warn('http', `[HTTP] Chat fallback: chat_0.xml -> minimal XML`);
      reply.type('text/xml; charset=utf-8');
      (request as any).deliveryMode = 'fallback';
      (request as any).byteSize = Buffer.byteLength(minChatXml);
      return reply.send(minChatXml);
    }

    const controlPanelBridge = resolveControlPanelAssetBridge(config.assetsPath, relativePath);
    if (controlPanelBridge) {
      const resolvedRelative = path.relative(config.assetsPath, controlPanelBridge.filePath).replace(/\\/g, '/');
      ruffleDiagnosticsManager.recordControlPanelAssetBridge({
        applied: true,
        reason: controlPanelBridge.reason,
        versionMismatchLikely: true,
        expectedConfigPath: controlPanelBridge.expectedConfigPath || null,
        expectedEffectButtonPathPattern: controlPanelBridge.expectedEffectButtonPathPattern || null,
        resolvedConfigPath: controlPanelBridge.filePath.toLowerCase().endsWith('controlpanel.txt') ? resolvedRelative : null,
        resolvedEffectsDir: controlPanelBridge.filePath.toLowerCase().endsWith('.swf')
          ? path.dirname(resolvedRelative).replace(/\\/g, '/')
          : null
      });
      if (controlPanelBridge.filePath.toLowerCase().endsWith('controlpanel.txt')) {
        recordControlPanelTxtInventory(config.assetsPath, controlPanelBridge.filePath);
      }
      ruffleDiagnosticsManager.recordControlPanelAssetRequest(pathname, true, resolvedRelative);
      logger.info('http', `[HTTP] ControlPanel asset bridge: "${relativePath}" -> "${resolvedRelative}" (${controlPanelBridge.reason})`);
      return sendAssetBuffer(request, reply, controlPanelBridge.filePath, config, controlPanelBridge.contentType, 'controlpanel-asset-bridge');
    }

    const resolvedPath = resolveSafePath(config.assetsPath, relativePath);

    if (resolvedPath && safeFileExists(resolvedPath)) {
      // Determine content-type
      const contentType = getAssetContentType(resolvedPath);
      if (path.extname(resolvedPath).toLowerCase() === '.mp3') {
        ruffleDiagnosticsManager.recordSoundServed(pathname, path.relative(config.assetsPath, resolvedPath), contentType);
      }
      if (path.extname(resolvedPath).toLowerCase() === '.txt') {
        recordRoomTxtConfigIfApplicable(pathname, resolvedPath);
        if (resolvedPath.toLowerCase().replace(/\\/g, '/').endsWith('/swf/assetsclean/controlpanel/controlpanel.txt')) {
          recordControlPanelTxtInventory(config.assetsPath, resolvedPath);
        }
      }
      recordControlPanelSwfIfApplicable(pathname, config.assetsPath, resolvedPath);
      ruffleDiagnosticsManager.recordControlPanelAssetRequest(pathname, true, path.relative(config.assetsPath, resolvedPath));
      logger.info('http', `Served asset: [Path-Preserved] "${relativePath}" -> "${resolvedPath}" (${fs.statSync(resolvedPath).size} bytes)`);
      return sendAssetBuffer(request, reply, resolvedPath, config, contentType, 'asset-backed');
    }

    const soundCompatPath = resolveSoundCompatPath(config.assetsPath, relativePath);
    if (soundCompatPath) {
      const contentType = getAssetContentType(soundCompatPath);
      const resolvedRelative = path.relative(config.assetsPath, soundCompatPath);
      ruffleDiagnosticsManager.recordSoundServed(pathname, resolvedRelative, contentType);
      logger.success('http', `Served sound: [Sound Compat] Requested "${relativePath}" -> Found "${resolvedRelative}" (${fs.statSync(soundCompatPath).size} bytes)`);
      return sendAssetBuffer(request, reply, soundCompatPath, config, contentType, 'sound-compat');
    }

    // 3. Fallback search (case-insensitive / subfolder lookup) if path-preserved fails
    // This is helpful if the client requests Swf/Rooms/room_20.swf but it is saved in a different folder structure.
    const basename = path.basename(relativePath);
    const searchDirs = [
      path.join(config.assetsPath, 'Swf'),
      path.join(config.assetsPath, 'Xmls'),
      path.join(config.assetsPath, 'Servises'),
      path.join(config.assetsPath, 'services'),
      path.join(config.assetsPath, 'Swf', 'AssetsClean', 'Rooms'),
      config.assetsPath
    ];

    for (const searchDir of searchDirs) {
      if (fs.existsSync(searchDir)) {
        const potential = path.join(searchDir, basename);
        if (fs.existsSync(potential) && fs.statSync(potential).isFile()) {
          const contentType = getAssetContentType(potential);
          if (path.extname(potential).toLowerCase() === '.mp3') {
            ruffleDiagnosticsManager.recordSoundServed(pathname, path.relative(config.assetsPath, potential), contentType);
          }
          if (path.extname(potential).toLowerCase() === '.txt') {
            recordRoomTxtConfigIfApplicable(pathname, potential);
            if (potential.toLowerCase().replace(/\\/g, '/').endsWith('/swf/assetsclean/controlpanel/controlpanel.txt')) {
              recordControlPanelTxtInventory(config.assetsPath, potential);
            }
          }
          recordControlPanelSwfIfApplicable(pathname, config.assetsPath, potential);
          ruffleDiagnosticsManager.recordControlPanelAssetRequest(pathname, true, path.relative(config.assetsPath, potential));
          logger.success('http', `Served asset: [Fallback Resolved] Requested "${relativePath}" -> Found "${path.relative(config.assetsPath, potential)}" (${fs.statSync(potential).size} bytes)`);
          return sendAssetBuffer(request, reply, potential, config, contentType, 'fallback');
        }
      }
    }

    // 4. Missing Asset Warning
    logger.warn('http', `\x1b[31m[MISSING ASSET WARNING] Client requested non-existent file: "${relativePath}" (Decoded: "${pathname}")\x1b[0m`);
    ruffleDiagnosticsManager.recordMissingAsset(pathname);
    ruffleDiagnosticsManager.recordControlPanelAssetRequest(pathname, false);
    (request as any).deliveryMode = 'missing';
    (request as any).byteSize = 0;
    return reply.status(404).send('Not Found');
  });
}
