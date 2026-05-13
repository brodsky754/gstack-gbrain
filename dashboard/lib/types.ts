// Shared types — single source of truth for the dashboard's data shapes.
// Adapter contracts here drive every other module.

export interface BrainStats {
  page_count: number;
  chunk_count: number;
  people_count: number;
  company_count: number;
  last_sync_iso: string | null;
  engine: 'pglite' | 'postgres';
}

export interface BrainPage {
  slug: string;
  title: string;
  type: string;
  body: string;
  frontmatter: Record<string, unknown>;
  updated_at: string;
  created_at: string;
}

export interface BrainEntity {
  slug: string;
  title: string;
  type: string;
  link_count: number;
}

export interface BrainEdge {
  source: string; // source slug
  target: string; // target slug
  type: string;   // attended | works_at | invested_in | founded | advises | mentions | source
}

export interface GraphSnapshot {
  nodes: BrainEntity[];
  edges: BrainEdge[];
  generated_at: string;
}

export interface QueryResult {
  slug: string;
  title: string;
  score: number;
  snippet?: string;
}

// ---------- Events on the in-process bus + SSE stream ----------

export type BusEventType =
  | 'session_started'
  | 'session_active'    // emitted continuously while a session is running
  | 'session_completed'
  | 'tool_call'
  | 'token_delta'
  | 'active_entity'     // brain slug the agent is currently reading
  | 'zoom_to'           // graph zoom triggered by Brief Me
  | 'trace_lineage'     // graph trace triggered by Ship This
  | 'parse_error'
  | 'gbrain_error';

export interface BusEvent<T extends object = Record<string, unknown>> {
  id: string;            // monotonic, used for SSE last-event-id replay
  type: BusEventType;
  timestamp: number;     // ms since epoch
  payload: T;
}

// ---------- Specific payload shapes (typed unions for downstream use) ----------

export interface SessionActivePayload {
  session_id: string;
  project_slug: string;  // ~/.claude/projects/<this>
  active_skill: string | null;
  active_phase: string | null;
  token_spend: { input: number; output: number };
}

export interface ToolCallPayload {
  session_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface ActiveEntityPayload {
  session_id: string;
  slug: string;          // brain slug like "people/alice-example"
  via_tool: string;      // which tool surfaced the slug ("get_page", "query")
}

export interface ZoomToPayload {
  slugs: string[];
  reason: 'brief_me' | 'manual';
}

export interface TraceLineagePayload {
  slugs: string[];       // ordered path
  reason: 'ship_this';
}

// ---------- Session pane shape (cards consume this) ----------

export interface SessionCard {
  session_id: string;
  project_slug: string;
  active_skill: string | null;
  active_phase: string | null;
  last_tool: string | null;
  token_spend: { input: number; output: number };
  status: 'active' | 'waiting' | 'errored' | 'idle';
  started_at: string;
}

// ---------- Brief Me result shape ----------

export interface BriefMeResult {
  generated_at: string;
  today_meetings: BrainPage[];
  related_people: BrainPage[];
  open_threads: BrainPage[];
  zoom_slugs: string[]; // also emitted as zoom_to event
}
