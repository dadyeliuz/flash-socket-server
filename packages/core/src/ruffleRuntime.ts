import * as fs from 'fs';
import * as path from 'path';
import { ServerConfig } from './config';

function walkFiles(dir: string, maxDepth = 4): string[] {
  if (!fs.existsSync(dir) || maxDepth < 0) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile()) {
      files.push(fullPath);
    } else if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath, maxDepth - 1));
    }
  }

  return files;
}

export function getRepoRootFromModuleDir(moduleDir: string): string {
  let current = path.resolve(moduleDir);

  while (true) {
    const packageJsonPath = path.join(current, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (packageJson.workspaces) {
          return current;
        }
      } catch (_) {}
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Unable to locate monorepo root from "${moduleDir}".`);
    }
    current = parent;
  }
}

export function resolveRuffleRuntimeDir(config: Pick<ServerConfig, 'ruffleRuntimeDir'>, moduleDir = __dirname): string {
  if (config.ruffleRuntimeDir) {
    return path.resolve(config.ruffleRuntimeDir);
  }

  return path.join(getRepoRootFromModuleDir(moduleDir), 'tools', 'runtime', 'ruffle');
}

export interface RuffleRuntimeValidation {
  missing: string[];
  ruffleJsPath?: string;
  wasmFiles: string[];
}

export function validateRuffleRuntimeDir(runtimeDir: string): RuffleRuntimeValidation {
  const files = walkFiles(runtimeDir);
  const missing: string[] = [];
  const ruffleJsPath = files.find((filePath) => path.basename(filePath).toLowerCase() === 'ruffle.js');
  const wasmFiles = files.filter((filePath) => path.extname(filePath).toLowerCase() === '.wasm');

  if (!ruffleJsPath) {
    missing.push('ruffle.js');
  }

  if (wasmFiles.length === 0) {
    missing.push('*.wasm');
  }

  return { missing, ruffleJsPath, wasmFiles };
}

export function getRuffleRuntimeTree(runtimeDir: string, maxEntries = 30): string {
  if (!fs.existsSync(runtimeDir)) {
    return '(directory does not exist)';
  }

  const lines: string[] = [];

  function visit(dir: string, prefix: string, depth: number): void {
    if (lines.length >= maxEntries || depth < 0) {
      return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (lines.length >= maxEntries) {
        lines.push('...');
        return;
      }

      const fullPath = path.join(dir, entry.name);
      lines.push(`${prefix}${entry.name}${entry.isDirectory() ? '/' : ''}`);

      if (entry.isDirectory()) {
        visit(fullPath, `${prefix}  `, depth - 1);
      }
    }
  }

  visit(runtimeDir, '', 2);
  return lines.length > 0 ? lines.join('\n') : '(directory is empty)';
}
