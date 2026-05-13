import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseSessionLine,
  extractBrainSlugs,
  applyLineToTracker,
  freshTracker,
} from '../lib/jsonl-parser';

const FIXTURE = readFileSync(
  join(import.meta.dir, 'fixtures', 'sample-session.jsonl'),
  'utf-8',
);

describe('parseSessionLine', () => {
  test('returns null on empty input', () => {
    expect(parseSessionLine('')).toBeNull();
    expect(parseSessionLine('   \n')).toBeNull();
  });

  test('returns null on malformed JSON', () => {
    expect(parseSessionLine('{not json')).toBeNull();
    expect(parseSessionLine('garbage')).toBeNull();
  });

  test('infers tool_use lines', () => {
    const parsed = parseSessionLine('{"type":"tool_use","name":"Read","input":{}}');
    expect(parsed?.type).toBe('tool_use');
  });

  test('infers usage lines', () => {
    const parsed = parseSessionLine('{"usage":{"input_tokens":10,"output_tokens":5}}');
    expect(parsed?.type).toBe('usage');
  });

  test('infers message lines', () => {
    const parsed = parseSessionLine('{"role":"assistant","content":[]}');
    expect(parsed?.type).toBe('message');
  });
});

describe('extractBrainSlugs', () => {
  test('finds slugs in tool input strings (strips file extension)', () => {
    const slugs = extractBrainSlugs({
      file_path: '/Users/nate/IdeaProjects/gstack-gbrain/docs/designs/people/alice-example.md',
    });
    // The slug regex stops at the last alphanumeric char by design — gbrain
    // slugs don't carry file extensions, so "people/alice-example.md" yields
    // the canonical slug "people/alice-example".
    expect(slugs).toContain('people/alice-example');
  });

  test('finds slugs in get_page calls', () => {
    const slugs = extractBrainSlugs({ slug: 'companies/widget-co' });
    expect(slugs).toEqual(['companies/widget-co']);
  });

  test('returns empty array when no slugs are present', () => {
    const slugs = extractBrainSlugs({ random_field: 'no slugs here' });
    expect(slugs).toEqual([]);
  });

  test('dedupes repeated slugs', () => {
    const slugs = extractBrainSlugs({
      a: 'people/alice-example',
      b: 'people/alice-example',
    });
    expect(slugs).toEqual(['people/alice-example']);
  });

  test('matches all canonical entity prefixes', () => {
    const slugs = extractBrainSlugs({
      paths: [
        'people/p1', 'companies/c1', 'deals/d1', 'topics/t1', 'concepts/cc1',
        'projects/pr1', 'tech/tk1', 'finance/f1', 'meetings/m1',
      ].join(' '),
    });
    expect(slugs.length).toBe(9);
  });

  test('normalizes namespace prefix case', () => {
    const slugs = extractBrainSlugs({ x: 'People/Alice-Example' });
    expect(slugs).toEqual(['people/Alice-Example']);
  });
});

describe('applyLineToTracker (fixture round-trip)', () => {
  test('walks the full sample session and accumulates state', () => {
    const tracker = freshTracker('abc123', 'sample-project');
    const allEvents: { type: string; payload: Record<string, unknown> }[] = [];

    for (const line of FIXTURE.split('\n')) {
      const parsed = parseSessionLine(line);
      if (!parsed) continue;
      const events = applyLineToTracker(tracker, parsed);
      allEvents.push(...events);
    }

    // Tool calls: Skill, Read, get_page, query → 4 tool_call events
    const toolCalls = allEvents.filter((e) => e.type === 'tool_call');
    expect(toolCalls.length).toBe(4);

    // Active entity events: from Read (alice-example), get_page (widget-co),
    // query (bob-example)
    const activeEntities = allEvents.filter((e) => e.type === 'active_entity');
    expect(activeEntities.length).toBeGreaterThanOrEqual(3);
    const slugs = activeEntities.map((e) => e.payload.slug);
    expect(slugs).toContain('companies/widget-co');

    // Tracker captures the active skill from the Skill tool call
    expect(tracker.active_skill).toBe('office-hours');

    // Token totals accumulate from both usage lines (12500 + 15800 in / 320 + 540 out)
    expect(tracker.token_input).toBe(28300);
    expect(tracker.token_output).toBe(860);

    // Last tool is the most recent: query
    expect(tracker.last_tool).toBe('query');
  });

  test('survives a partial / truncated line gracefully', () => {
    const tracker = freshTracker('abc', 'p');
    expect(parseSessionLine('{"type":"tool_use","name":')).toBeNull();
    // No events, no throw — confirms tolerance.
    expect(tracker.last_tool).toBeNull();
  });
});
