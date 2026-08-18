// loadout/v1 — data contract for the Loadout console.
// Spec: yggdrasil members/robbi/projects/xaleths-domain/2026-08-17-personal-dashboard/docs/our-approach.md
// The JSON at public/private/loadout-data.json is the single source of truth (design rule R3).
// This shape is API-shaped on purpose: Phase 3 moves it behind a worker+KV endpoint unchanged.

export type GoalStatus = 'active' | 'paused' | 'met' | 'retired';
export type ThresholdMode = 'consecutive' | 'cumulative';
export type BlockKind = 'goal' | 'work' | 'rest' | 'routine' | 'fixed';
export type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

interface GoalBase {
  id: string;
  title: string;
  domain: string;
  status: GoalStatus;
  created: string; // ISO date
  /** Outcome goal ids this goal is a leading indicator for (R6). */
  supports?: string[];
  /** The variant performable at current capability — required when target exceeds baseline (R10). */
  scaledAs?: string;
  note?: string;
}

export interface ThresholdGoal extends GoalBase {
  type: 'threshold';
  target: { value: number; unit: string; mode: ThresholdMode };
  baseline: { value: number; date: string };
  history: { date: string; value: number }[];
}

export interface BenchmarkGoal extends GoalBase {
  type: 'benchmark';
  benchmark: string;
  // Scaling lives on each entry so the trend line can't silently change meaning (R10).
  history: { date: string; value: number; scaling: string; note?: string }[];
}

export interface AdherenceGoal extends GoalBase {
  type: 'adherence';
  target: { count: number; period: 'week' };
  history: { date: string; value: number }[];
}

export interface MetricGoal extends GoalBase {
  type: 'metric';
  scale: { min: number; max: number };
  prompt: string;
  direction: 'lower-is-better' | 'higher-is-better';
  history: { date: string; value: number }[];
}

export interface OutcomeGoal extends GoalBase {
  type: 'outcome';
  due: string; // ISO date
  definition: string;
  history: { date: string; note: string }[];
}

export type Goal = ThresholdGoal | BenchmarkGoal | AdherenceGoal | MetricGoal | OutcomeGoal;

export interface WeekBlock {
  id: string;
  day: Day;
  start: string; // "HH:MM"
  end: string;
  label: string;
  kind: BlockKind;
  goalId?: string;
  /** The scheduler may never displace a protected block (R2). Rest defaults to protected. */
  protected?: boolean;
}

export interface Routine {
  id: string;
  name: string;
  anchor: 'bedtime' | 'wake';
  /** Minutes relative to the anchor (negative = before). */
  offset: number;
  steps: { label: string; minutes: number }[];
}

export interface LoadoutTask {
  id: string;
  item: string;
  created: string;
  by: string | null; // deadline, ISO date
  notes: string;
  domain?: string;
  estimate: number | null; // minutes — the Navi asks when missing
  goalId?: string | null;
}

export interface MetricDefinition {
  id: string;
  prompt: string;
  scale: { min: number; max: number };
  direction: 'lower-is-better' | 'higher-is-better';
}

export interface LoadoutData {
  schema: 'loadout/v1';
  updated: string;
  note?: string;
  idSpace: { prefix: string; next: number };
  goals: Goal[];
  week: { blocks: WeekBlock[] };
  routines: Routine[];
  tasks: {
    inbox: LoadoutTask[];
    today: LoadoutTask[];
    open: LoadoutTask[];
    ideas: LoadoutTask[];
    done: (LoadoutTask & { completed: string })[];
  };
  metrics: {
    definitions: MetricDefinition[];
    entries: { date: string; values: Record<string, number> }[];
  };
  preferences: {
    valuations: { subject: string; weight: number; note?: string }[];
    notes: string[];
  };
  runs: unknown[]; // Navi planning runs — Phase 2 populates, shape owned by the Navi
}

const DAYS: readonly string[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TASK_SECTIONS: readonly string[] = ['inbox', 'today', 'open', 'ideas', 'done'];

/**
 * Structural validation. The file is hand-edited by an agent daily; a silent
 * blank render is the failure mode to design against, so every problem is
 * named for display rather than thrown.
 */
export function validateLoadout(raw: unknown): { data: LoadoutData | null; errors: string[] } {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return { data: null, errors: ['Root is not an object.'] };
  }
  const d = raw as Record<string, unknown>;
  if (d.schema !== 'loadout/v1') {
    errors.push(`schema is ${JSON.stringify(d.schema)} — expected "loadout/v1".`);
  }
  if (!Array.isArray(d.goals)) errors.push('goals is not an array.');
  const week = d.week as Record<string, unknown> | undefined;
  if (!week || !Array.isArray(week.blocks)) errors.push('week.blocks is not an array.');
  if (!Array.isArray(d.routines)) errors.push('routines is not an array.');
  const tasks = d.tasks as Record<string, unknown> | undefined;
  if (!tasks) {
    errors.push('tasks is missing.');
  } else {
    for (const s of TASK_SECTIONS) {
      if (!Array.isArray(tasks[s])) errors.push(`tasks.${s} is not an array.`);
    }
  }
  const metrics = d.metrics as Record<string, unknown> | undefined;
  if (!metrics || !Array.isArray(metrics.definitions) || !Array.isArray(metrics.entries)) {
    errors.push('metrics.definitions / metrics.entries malformed.');
  }
  if (Array.isArray(d.goals)) {
    for (const g of d.goals as Record<string, unknown>[]) {
      if (!g.id || !g.type || !g.title) errors.push(`goal ${JSON.stringify(g.id ?? '?')} missing id/type/title.`);
    }
  }
  if (week && Array.isArray(week.blocks)) {
    for (const b of week.blocks as Record<string, unknown>[]) {
      if (!DAYS.includes(b.day as string)) errors.push(`block ${JSON.stringify(b.id ?? '?')} has bad day ${JSON.stringify(b.day)}.`);
      if (!/^\d{2}:\d{2}$/.test(String(b.start)) || !/^\d{2}:\d{2}$/.test(String(b.end))) {
        errors.push(`block ${JSON.stringify(b.id ?? '?')} has bad start/end time.`);
      }
    }
  }
  return errors.length ? { data: null, errors } : { data: raw as LoadoutData, errors: [] };
}
