// "Ship This" handoff: write the gstack command to clipboard, open Terminal
// in the chosen repo, surface a toast telling the user to press cmd+v.
//
// Decision D5 (plan-eng-review): clipboard + osascript handoff. Reliable on
// stage, one extra cmd+v + enter, no fragility from auto-typing.

// Server-side only — see lib/gbrain-client.ts for the runtime-isolation note.
import { spawn } from 'child_process';

export interface ShipThisInput {
  /** Absolute path to the repo where the new claude session should start. */
  repoPath: string;
  /** Brain slug to load as context (e.g. "people/alice-example"). */
  brainSlug: string;
  /** Defaults to `/office-hours brain-page:<slug>`; override for /investigate, /qa, etc. */
  command?: string;
}

export interface ShipThisResult {
  ok: boolean;
  via: 'clipboard+terminal' | 'clipboard-only' | 'failed';
  message: string;
  command: string;
}

/**
 * Returns the gstack command to put in the clipboard. Pure function — safe to
 * unit-test without spawning anything.
 */
export function buildShipCommand(input: ShipThisInput): string {
  const cmd = input.command ?? `/office-hours brain-page:${input.brainSlug}`;
  return cmd;
}

/**
 * Returns the osascript snippet that opens a new Terminal window in the repo.
 * Pure function — safe to unit-test for shell-injection risks.
 */
export function buildOsascriptArgs(repoPath: string): string[] {
  // Validate repoPath: must be absolute. Then whitelist the safe character
  // set (alphanumerics + " " + "_" + "-" + "." + "/" + "~"). Whitelist beats
  // blacklist here because (a) legitimate repo paths never need shell
  // metacharacters, and (b) the AppleScript -> Terminal -> bash double-quote
  // chain has subtle expansion semantics it's safer not to reason about
  // case-by-case. Anything outside the set is rejected up front.
  if (!repoPath.startsWith('/')) {
    throw new Error(`shipThis: repoPath must be absolute, got "${repoPath}"`);
  }
  if (!/^[a-zA-Z0-9 _\-./~]+$/.test(repoPath)) {
    throw new Error(`shipThis: repoPath contains unsafe characters: "${repoPath}"`);
  }
  // AppleScript double-quoted strings: escape backslash and double-quote.
  // We've already rejected those above, so the escape is belt-and-suspenders.
  const safe = repoPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `tell application "Terminal"
  activate
  do script "cd \\"${safe}\\" && claude"
end tell`;
  return ['-e', script];
}

/** Copy text to the macOS clipboard via pbcopy. */
function pbcopy(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('pbcopy', [], { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (c: Buffer) => { stderr += c.toString('utf-8'); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pbcopy exited ${code}: ${stderr}`));
    });
    child.stdin.write(text);
    child.stdin.end();
  });
}

function runOsascript(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('osascript', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (c: Buffer) => { stderr += c.toString('utf-8'); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`osascript exited ${code}: ${stderr}`));
    });
  });
}

/**
 * Execute the full Ship This handoff.
 * On macOS only in v1. On other platforms, returns ok=false with a clear message.
 */
export async function shipThis(input: ShipThisInput): Promise<ShipThisResult> {
  const command = buildShipCommand(input);

  if (process.platform !== 'darwin') {
    return {
      ok: false,
      via: 'failed',
      message: 'Ship This requires macOS in v1 (osascript + Terminal handoff). ' +
        'Cross-platform support is a v2 follow-up.',
      command,
    };
  }

  try {
    await pbcopy(command);
  } catch (err) {
    return {
      ok: false,
      via: 'failed',
      message: `Clipboard write failed: ${(err as Error).message}`,
      command,
    };
  }

  try {
    await runOsascript(buildOsascriptArgs(input.repoPath));
    return {
      ok: true,
      via: 'clipboard+terminal',
      message: `Terminal opened in ${input.repoPath}. Press cmd+v + enter to paste "${command}".`,
      command,
    };
  } catch (err) {
    // osascript failed (most likely Accessibility permission denied).
    // Clipboard still has the command — fall back to clipboard-only path.
    return {
      ok: true,
      via: 'clipboard-only',
      message: `Couldn't open Terminal automatically: ${(err as Error).message}. ` +
        `Command copied to clipboard — paste it into a Terminal in ${input.repoPath}.`,
      command,
    };
  }
}
