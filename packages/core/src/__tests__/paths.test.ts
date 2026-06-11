import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { resolveSafePath } from '../paths';

describe('Paths Secure Resolver', () => {
  const baseDir = path.resolve('/PROJ/sfs-emu/CLINET-CLEAN');

  it('should successfully resolve safe relative subpaths', () => {
    const result = resolveSafePath(baseDir, 'Login.swf');
    expect(result).not.toBeNull();
    expect(result).toContain('Login.swf');
  });

  it('should successfully resolve nested safe subpaths', () => {
    const result = resolveSafePath(baseDir, 'Swf/Rooms/room_20.swf');
    expect(result).not.toBeNull();
    expect(result).toContain(path.join('Swf', 'Rooms', 'room_20.swf'));
  });

  it('should successfully validate URLencoded subpaths without losing raw percent characters', () => {
    const result = resolveSafePath(baseDir, 'Servises/lang.aspx%3flang%3d1');
    expect(result).not.toBeNull();
    expect(result).toContain(path.join('Servises', 'lang.aspx%3flang%3d1'));
  });

  it('should reject path traversal attempts escaping the base boundaries', () => {
    const result = resolveSafePath(baseDir, '../../OLD/secret.txt');
    expect(result).toBeNull();
  });

  it('should reject absolute path target overrides', () => {
    const result = resolveSafePath(baseDir, '/etc/passwd');
    expect(result).toBeNull();
  });
});
