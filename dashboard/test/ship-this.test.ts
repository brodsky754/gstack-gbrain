import { describe, test, expect } from 'bun:test';
import { buildShipCommand, buildOsascriptArgs } from '../lib/ship-this';

describe('buildShipCommand', () => {
  test('default command shape', () => {
    const cmd = buildShipCommand({
      repoPath: '/Users/nate/repo',
      brainSlug: 'people/alice-example',
    });
    expect(cmd).toBe('/office-hours brain-page:people/alice-example');
  });

  test('custom command override', () => {
    const cmd = buildShipCommand({
      repoPath: '/Users/nate/repo',
      brainSlug: 'concepts/notability',
      command: '/investigate concepts/notability',
    });
    expect(cmd).toBe('/investigate concepts/notability');
  });
});

describe('buildOsascriptArgs', () => {
  test('builds a tell-application script for valid absolute path', () => {
    const args = buildOsascriptArgs('/Users/nate/repo');
    expect(args[0]).toBe('-e');
    expect(args[1]).toContain('tell application "Terminal"');
    expect(args[1]).toContain('cd \\"/Users/nate/repo\\"');
    expect(args[1]).toContain('claude');
  });

  test('rejects relative paths', () => {
    expect(() => buildOsascriptArgs('relative/path')).toThrow(/absolute/);
    expect(() => buildOsascriptArgs('./repo')).toThrow(/absolute/);
  });

  test('rejects shell metacharacters that could break out of the AppleScript string', () => {
    expect(() => buildOsascriptArgs('/Users/nate; rm -rf /')).toThrow(/unsafe/);
    expect(() => buildOsascriptArgs('/Users/$(whoami)/x')).toThrow(/unsafe/);
    expect(() => buildOsascriptArgs('/Users/`whoami`/x')).toThrow(/unsafe/);
    expect(() => buildOsascriptArgs('/Users/nate"; do-evil"')).toThrow(/unsafe/);
    expect(() => buildOsascriptArgs('/Users/nate\\bad')).toThrow(/unsafe/);
  });

  test('safe characters pass through (hyphens, dots, underscores, spaces)', () => {
    // Note: spaces are fine inside the AppleScript double-quoted string.
    const args = buildOsascriptArgs('/Users/nate/My Repo_v1.2');
    expect(args[1]).toContain('cd \\"/Users/nate/My Repo_v1.2\\"');
  });
});
