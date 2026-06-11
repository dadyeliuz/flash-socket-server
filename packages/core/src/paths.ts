import * as path from 'path';
import * as fs from 'fs';

/**
 * Resolves a target path relative to a base directory safely, preventing path traversal attacks.
 * Returns the absolute resolved path if safe and exists, otherwise returns null.
 * 
 * @param baseDir The absolute path of the root folder (e.g. assetsPath)
 * @param targetPath The user-supplied subpath
 */
export function resolveSafePath(baseDir: string, targetPath: string): string | null {
  const resolvedBase = path.resolve(baseDir);
  
  // 1. Boundary verification: check if decoded target path escapes base boundaries
  let decodedTarget = targetPath;
  try {
    decodedTarget = decodeURIComponent(targetPath);
  } catch (err) {}

  if (
    path.isAbsolute(decodedTarget) || 
    decodedTarget.startsWith('/') || 
    decodedTarget.startsWith('\\') ||
    /^[a-zA-Z]:/.test(decodedTarget)
  ) {
    return null;
  }

  const resolvedDecoded = path.resolve(path.join(resolvedBase, decodedTarget));
  const relativeDecoded = path.relative(resolvedBase, resolvedDecoded);
  if (relativeDecoded.startsWith('..') || path.isAbsolute(relativeDecoded)) {
    return null;
  }

  // 2. Resolve and return the RAW target path (preserving %3f, %3d in filename)
  if (
    path.isAbsolute(targetPath) || 
    targetPath.startsWith('/') || 
    targetPath.startsWith('\\') ||
    /^[a-zA-Z]:/.test(targetPath)
  ) {
    return null;
  }

  const resolvedRaw = path.resolve(path.join(resolvedBase, targetPath));
  const relativeRaw = path.relative(resolvedBase, resolvedRaw);
  if (relativeRaw.startsWith('..') || path.isAbsolute(relativeRaw)) {
    return null;
  }

  return resolvedRaw;
}

/**
 * Verifies if a resolved target path exists and is a file.
 */
export function safeFileExists(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile();
  } catch (err) {
    return false;
  }
}
