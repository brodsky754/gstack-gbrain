// Parse Claude Code session JSONL files into typed events for the bus.
//
// Format note: Claude Code session log format is undocumented and may drift
// across releases. Every parse is wrapped in try/catch per-line; the poller
// MUST NOT crash on a bad line. On error, emit a `parse_error` event so the
// UI can surface it; never throw out of the loop.

import type {
  BusEvent,
  BusEventType,
  SessionActivePayload,
  ToolCallPayload,
  ActiveEntityPayload,
} from './types';

// Regex to detect brain slugs in tool call args.
// Matches paths like "people/alice-example", "companies/widget-co",
// "projects/myapp", and the v0.12+ canonical entity prefixes.
const BRAIN_SLUG_RE =
  /\b(people|companies|deals|topics|concepts|projects|entities|tech|finance|personal|meetings|writing|originals)\/[a-z0-9][a-z0-9\-_/]*[a-z0-9]/gi;

export interface ParsedLine {
  /** Raw event type as found in the JSONL. */
  type: 'message' | 'tool_use' | 'tool_result' | 'usage' | 'system' | 'unknown';
  /** The parsed JSON object. */
  data: Record<string, unknown>;
}

export function parseSessionLine(line: string): ParsedLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const data = JSON.parse(trimmed) as Record<string, unknown>;
    const type = inferLineType(data);
    return { type, data };
  } catch {
    return null;
  }
}

function inferLineType(data: Record<string, unknown>): ParsedLine['type'] {
  if (data.type === 'tool_use') return 'tool_use';
  if (data.type === 'tool_result') return 'tool_result';
  if (data.role === 'assistant' || data.role === 'user') return 'message';
  if (data.usage) return 'usage';
  if (data.type === 'system') return 'system';
  return 'unknown';
}

/**
 * Extract brain slugs referenced in a tool_use payload.
 * Looks at tool name + tool_input (stringified) for any slug-shaped path.
 */
export function extractBrainSlugs(toolInput: Record<string, unknown>): string[] {
  const haystack = JSON.stringify(toolInput);
  const matches = haystack.match(BRAIN_SLUG_RE) ?? [];
  // Dedup, lowercase prefix.
  return Array.from(new Set(matches.map(m => normalizeSlug(m))));
}

function normalizeSlug(slug: string): string {
  // Lowercase the prefix only, keep the rest as-is (slugs are case-sensitive
  // after the namespace). E.g. "People/Alice-Example" -> "people/Alice-Example".
  const slashIdx = slug.indexOf('/');
  if (slashIdx === -1) return slug;
  return slug.slice(0, slashIdx).toLowerCase() + slug.slice(slashIdx);
}

// ---------- Helpers that build BusEvent payloads from parsed lines ----------

export interface SessionTracker {
  session_id: string;
  project_slug: string;
  active_skill: string | null;
  active_phase: string | null;
  last_tool: string | null;
  token_input: number;
  token_output: number;
  last_tool_at: number;
}

export function freshTracker(session_id: string, project_slug: string): SessionTracker {
  return {
    session_id,
    project_slug,
    active_skill: null,
    active_phase: null,
    last_tool: null,
    token_input: 0,
    token_output: 0,
    last_tool_at: 0,
  };
}

/**
 * Apply a parsed line to a tracker. Returns the list of bus events to emit
 * (typically 0–2). Mutates tracker in place.
 */
export function applyLineToTracker(
  tracker: SessionTracker,
  parsed: ParsedLine,
): Array<{ type: BusEventType; payload: Record<string, unknown> }> {
  const events: Array<{ type: BusEventType; payload: Record<string, unknown> }> = [];

  if (parsed.type === 'tool_use') {
    const toolName = String((parsed.data as { name?: unknown }).name ?? '');
    const toolInput = (parsed.data as { input?: Record<string, unknown> }).input ?? {};
    tracker.last_tool = toolName;
    tracker.last_tool_at = Date.now();
    events.push({
      type: 'tool_call',
      payload: {
        session_id: tracker.session_id,
        tool_name: toolName,
        tool_input: toolInput,
      } satisfies ToolCallPayload,
    });
    // Detect active entity references.
    const slugs = extractBrainSlugs(toolInput);
    for (const slug of slugs) {
      events.push({
        type: 'active_entity',
        payload: {
          session_id: tracker.session_id,
          slug,
          via_tool: toolName,
        } satisfies ActiveEntityPayload,
      });
    }
    // Skill invocations show up as Skill tool calls in the session log.
    // Capture the skill name when we see one.
    if (toolName === 'Skill' && typeof (toolInput as Record<string, unknown>).skill === 'string') {
      tracker.active_skill = (toolInput as { skill: string }).skill;
    }
  }

  if (parsed.type === 'usage') {
    const usage = (parsed.data as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
    if (usage) {
      tracker.token_input += usage.input_tokens ?? 0;
      tracker.token_output += usage.output_tokens ?? 0;
      events.push({
        type: 'token_delta',
        payload: {
          session_id: tracker.session_id,
          input: tracker.token_input,
          output: tracker.token_output,
        },
      });
    }
  }

  return events;
}

/** Build a session_active heartbeat from a tracker — emit every poll cycle. */
export function trackerToActiveEvent(tracker: SessionTracker): SessionActivePayload {
  return {
    session_id: tracker.session_id,
    project_slug: tracker.project_slug,
    active_skill: tracker.active_skill,
    active_phase: tracker.active_phase,
    token_spend: {
      input: tracker.token_input,
      output: tracker.token_output,
    },
  };
}
