import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing } from '@/constants/theme';
import {
  AdherenceGoal,
  BenchmarkGoal,
  Day,
  Goal,
  LoadoutData,
  MetricGoal,
  OutcomeGoal,
  ThresholdGoal,
  validateLoadout,
  WeekBlock,
} from '@/types/loadout';

// ---------------------------------------------------------------------------
// Palettes. UI chrome keeps the BN neons (borders, glow, headers). Data marks
// use a separate validated set — dataviz six-checks, both modes (2026-08-18):
//   dark  #1e93b5 / #b57917 / #8f62cf on #0d1526
//   light #0b7fa6 / #8f6206 / #7147b8 on #ffffff
// Block identity is never color-alone: every block carries its label text.
// ---------------------------------------------------------------------------

const PALETTES = {
  dark: {
    page: '#080d1a',
    surface: '#0d1526',
    surface2: '#111b30',
    ink: '#ffffff',
    ink2: '#7eb8cc',
    ink3: '#4a6a7a',
    line: 'rgba(0, 212, 255, 0.4)',
    lineSoft: 'rgba(0, 212, 255, 0.15)',
    accent: '#00d4ff',
    warm: '#f5a623',
    warmLine: 'rgba(245, 166, 35, 0.5)',
    danger: '#ff6b6b',
    markCyan: '#1e93b5',
    markAmber: '#b57917',
    markViolet: '#8f62cf',
    markCyanBg: 'rgba(30, 147, 181, 0.18)',
    markAmberBg: 'rgba(181, 121, 23, 0.18)',
    markVioletBg: 'rgba(143, 98, 207, 0.18)',
    neutralBg: 'rgba(126, 184, 204, 0.08)',
    neutralLine: 'rgba(126, 184, 204, 0.35)',
    glow: { shadowColor: '#00d4ff', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  },
  light: {
    page: '#eef2f7',
    surface: '#ffffff',
    surface2: '#f4f8fb',
    ink: '#10202b',
    ink2: '#3d6a7d',
    ink3: '#7d97a4',
    line: 'rgba(7, 122, 163, 0.45)',
    lineSoft: 'rgba(7, 122, 163, 0.16)',
    accent: '#077aa3',
    warm: '#8f6206',
    warmLine: 'rgba(143, 98, 6, 0.5)',
    danger: '#bc4a38',
    markCyan: '#0b7fa6',
    markAmber: '#8f6206',
    markViolet: '#7147b8',
    markCyanBg: 'rgba(11, 127, 166, 0.12)',
    markAmberBg: 'rgba(143, 98, 6, 0.12)',
    markVioletBg: 'rgba(113, 71, 184, 0.12)',
    neutralBg: 'rgba(61, 106, 125, 0.07)',
    neutralLine: 'rgba(61, 106, 125, 0.35)',
    glow: { shadowColor: '#077aa3', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 4 },
  },
} as const;

type Pal = (typeof PALETTES)['dark'] | (typeof PALETTES)['light'];

const DAYS: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS: Record<Day, string> = {
  mon: 'MON', tue: 'TUE', wed: 'WED', thu: 'THU', fri: 'FRI', sat: 'SAT', sun: 'SUN',
};

const TODAY_CAP = 5; // R1 — the day must have a bottom.

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso + 'T23:59:59').getTime() - Date.now()) / 86400000);
}

function blockColors(pal: Pal, kind: WeekBlock['kind']) {
  switch (kind) {
    case 'goal': return { border: pal.markCyan, bg: pal.markCyanBg, text: pal.markCyan };
    case 'rest': return { border: pal.markAmber, bg: pal.markAmberBg, text: pal.markAmber };
    case 'routine': return { border: pal.markViolet, bg: pal.markVioletBg, text: pal.markViolet };
    default: return { border: pal.neutralLine, bg: pal.neutralBg, text: pal.ink2 };
  }
}

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

function Panel({ pal, title, kicker, children, warn }: {
  pal: Pal; title: string; kicker?: string; children: React.ReactNode; warn?: string | null;
}) {
  return (
    <View style={[styles.panel, { backgroundColor: pal.surface, borderColor: pal.line }, pal.glow]}>
      <View style={styles.panelHead}>
        <Text style={[styles.panelTitle, { color: pal.ink }]}>{title}</Text>
        {kicker ? <Text style={[styles.panelKicker, { color: pal.ink3 }]}>{kicker}</Text> : null}
      </View>
      {warn ? (
        <View style={[styles.warnBox, { borderColor: pal.danger }]}>
          <Text style={[styles.warnText, { color: pal.danger }]}>⚠ {warn}</Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

function Chip({ pal, label, tone }: { pal: Pal; label: string; tone: 'accent' | 'warm' | 'muted' | 'danger' }) {
  const color = tone === 'accent' ? pal.accent : tone === 'warm' ? pal.warm : tone === 'danger' ? pal.danger : pal.ink3;
  return (
    <View style={[styles.chip, { borderColor: color }]}>
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

function EmptyState({ pal, line1, line2 }: { pal: Pal; line1: string; line2?: string }) {
  return (
    <View style={[styles.empty, { borderColor: pal.lineSoft }]}>
      <Text style={[styles.emptyText, { color: pal.ink2 }]}>{line1}</Text>
      {line2 ? <Text style={[styles.emptySub, { color: pal.ink3 }]}>{line2}</Text> : null}
    </View>
  );
}

/** Baseline→target progress meter. Direct-labeled; track/fill carry a 1px gap per mark spec. */
function Meter({ pal, from, to, current, unit }: { pal: Pal; from: number; to: number; current: number; unit: string }) {
  const span = Math.max(to - from, 1);
  const pct = Math.min(Math.max((current - from) / span, 0), 1);
  return (
    <View style={styles.meterWrap}>
      <View style={[styles.meterTrack, { backgroundColor: pal.neutralBg }]}>
        <View style={[styles.meterFill, { width: `${Math.max(pct * 100, 2)}%`, backgroundColor: pal.markCyan }]} />
      </View>
      <Text style={[styles.meterLabel, { color: pal.ink2 }]}>
        {from} → <Text style={{ color: pal.ink, fontWeight: '800' }}>{current}</Text> of {to} {unit}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Goal cards — one renderer per shape (loadout/v1 discriminated union)
// ---------------------------------------------------------------------------

function goalWarnings(g: Goal, all: Goal[]): string | null {
  // R6 — an outcome goal with no inbound leading indicator is incomplete.
  if (g.type === 'outcome') {
    const inbound = all.filter(o => o.supports?.includes(g.id));
    if (inbound.length === 0) return 'No leading indicator — link a process goal via supports (R6).';
  }
  // R10 — a target above baseline with no scaled variant is aspiration, not a goal.
  if (g.type === 'threshold' && g.target.value > g.baseline.value && !g.scaledAs) {
    return 'No scaled variant — add what you can do this week (R10).';
  }
  return null;
}

function ThresholdCard({ pal, g }: { pal: Pal; g: ThresholdGoal }) {
  const latest = g.history.length ? g.history[g.history.length - 1].value : g.baseline.value;
  return (
    <>
      <Meter pal={pal} from={g.baseline.value} to={g.target.value} current={latest} unit={g.target.unit} />
      <Text style={[styles.cardMeta, { color: pal.ink3 }]}>
        {g.target.mode.toUpperCase()} · baseline {g.baseline.value} on {g.baseline.date}
        {g.history.length === 0 ? ' · no tests logged yet' : ''}
      </Text>
      {g.scaledAs ? <Chip pal={pal} label={`THIS WEEK: ${g.scaledAs}`} tone="warm" /> : null}
      {g.note ? <Text style={[styles.cardNote, { color: pal.ink3 }]}>{g.note}</Text> : null}
    </>
  );
}

function BenchmarkCard({ pal, g }: { pal: Pal; g: BenchmarkGoal }) {
  // Sparkline once history exists; every entry is labeled with its scaling so the
  // trend can't silently change meaning (R10). Hover layer lands with real data in Phase 2+.
  if (g.history.length === 0) {
    return (
      <>
        <EmptyState pal={pal} line1="No rounds logged yet." line2="Score = rounds completed, always recorded with its scaling." />
        {g.scaledAs ? <Chip pal={pal} label={`THIS WEEK: ${g.scaledAs}`} tone="warm" /> : null}
      </>
    );
  }
  const max = Math.max(...g.history.map(h => h.value));
  const recent = g.history.slice(-10);
  return (
    <>
      <View style={styles.sparkRow}>
        {recent.map((h, i) => (
          <View key={i} style={styles.sparkCol}>
            <View style={[styles.sparkBar, {
              height: Math.max((h.value / max) * 48, 4),
              backgroundColor: pal.markCyan,
            }]} />
            <Text style={[styles.sparkVal, { color: pal.ink2 }]}>{h.value}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.cardMeta, { color: pal.ink3 }]}>
        latest: {recent[recent.length - 1].value} rounds @ {recent[recent.length - 1].scaling}
      </Text>
      {g.scaledAs ? <Chip pal={pal} label={`THIS WEEK: ${g.scaledAs}`} tone="warm" /> : null}
    </>
  );
}

function AdherenceCard({ pal, g }: { pal: Pal; g: AdherenceGoal }) {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow);
  monday.setHours(0, 0, 0, 0);
  const thisWeek = g.history.filter(h => new Date(h.date + 'T12:00:00') >= monday).length;
  const done = Math.min(thisWeek, 7);
  return (
    <>
      <View style={styles.dotRow}>
        {DAYS.map((d, i) => (
          <View key={d} style={styles.dotCol}>
            <View style={[styles.dot, {
              backgroundColor: i < done ? pal.markCyan : 'transparent',
              borderColor: i < done ? pal.markCyan : pal.neutralLine,
            }]} />
            <Text style={[styles.dotLabel, { color: pal.ink3 }]}>{DAY_LABELS[d][0]}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.cardMeta, { color: thisWeek >= g.target.count ? pal.markCyan : pal.ink2 }]}>
        {thisWeek} / {g.target.count} this week{thisWeek >= g.target.count ? ' — met ✓' : ''}
      </Text>
      {g.history.length === 0 ? (
        <Text style={[styles.cardNote, { color: pal.ink3 }]}>No sessions logged yet — log via Claude after each one.</Text>
      ) : null}
    </>
  );
}

function OutcomeCard({ pal, g, all }: { pal: Pal; g: OutcomeGoal; all: Goal[] }) {
  const days = daysUntil(g.due);
  const weeks = Math.max(days / 7, 0.01);
  const inbound = all.filter(o => o.supports?.includes(g.id));
  return (
    <>
      <View style={styles.countRow}>
        <Text style={[styles.countNum, { color: days < 30 ? pal.warm : pal.ink }]}>{days}</Text>
        <Text style={[styles.countUnit, { color: pal.ink3 }]}>days to {g.due}</Text>
      </View>
      <Text style={[styles.cardNote, { color: pal.ink2 }]}>{g.definition}</Text>
      {inbound.map(sg => {
        // R10 — required pace vs actual, so a wishful timeline is visible early.
        if (sg.type === 'threshold') {
          const latest = sg.history.length ? sg.history[sg.history.length - 1].value : sg.baseline.value;
          const remaining = sg.target.value - latest;
          const perWeek = remaining / weeks;
          return (
            <Text key={sg.id} style={[styles.paceLine, { color: pal.ink2 }]}>
              ▸ {sg.title}: {latest} → {sg.target.value} · needs{' '}
              <Text style={{ color: pal.warm, fontWeight: '700' }}>+{perWeek.toFixed(2)}/wk</Text>
              {sg.history.length === 0 ? ' · pace unknown until first test' : ''}
            </Text>
          );
        }
        return (
          <Text key={sg.id} style={[styles.paceLine, { color: pal.ink2 }]}>▸ {sg.title} — leading indicator</Text>
        );
      })}
    </>
  );
}

function MetricCard({ pal, g }: { pal: Pal; g: MetricGoal }) {
  if (g.history.length === 0) {
    return <EmptyState pal={pal} line1={`No entries for "${g.prompt}" yet.`} />;
  }
  const recent = g.history.slice(-14);
  return (
    <View style={styles.sparkRow}>
      {recent.map((h, i) => (
        <View key={i} style={styles.sparkCol}>
          <View style={[styles.sparkBar, {
            height: Math.max((h.value / g.scale.max) * 40, 4),
            backgroundColor: pal.markViolet,
          }]} />
        </View>
      ))}
    </View>
  );
}

function GoalCard({ pal, g, all }: { pal: Pal; g: Goal; all: Goal[] }) {
  const warn = goalWarnings(g, all);
  return (
    <View style={[styles.goalCard, { backgroundColor: pal.surface2, borderColor: pal.lineSoft }]}>
      <View style={styles.goalHead}>
        <Text style={[styles.goalType, { color: pal.accent }]}>{g.type.toUpperCase()}</Text>
        <Text style={[styles.goalDomain, { color: pal.ink3 }]}>{g.domain.toUpperCase()}</Text>
      </View>
      <Text style={[styles.goalTitle, { color: pal.ink }]}>{g.title}</Text>
      {warn ? <Text style={[styles.warnText, { color: pal.danger }]}>⚠ {warn}</Text> : null}
      {g.type === 'threshold' && <ThresholdCard pal={pal} g={g} />}
      {g.type === 'benchmark' && <BenchmarkCard pal={pal} g={g} />}
      {g.type === 'adherence' && <AdherenceCard pal={pal} g={g} />}
      {g.type === 'outcome' && <OutcomeCard pal={pal} g={g} all={all} />}
      {g.type === 'metric' && <MetricCard pal={pal} g={g} />}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Week grid — template week, not a calendar mirror (D3). Horizontal scroll on
// phones; rest blocks are visually protected commitments, not whitespace (R2).
// ---------------------------------------------------------------------------

const HOUR_PX = 30;

function WeekGrid({ pal, blocks, goals }: { pal: Pal; blocks: WeekBlock[]; goals: Goal[] }) {
  const startHour = Math.min(6, ...blocks.map(b => Math.floor(minutes(b.start) / 60)));
  const endHour = Math.max(23, ...blocks.map(b => Math.ceil(minutes(b.end) / 60)));
  const hours: number[] = [];
  for (let h = startHour; h <= endHour; h++) hours.push(h);
  const gridH = (endHour - startHour) * HOUR_PX;
  const goalTitle = (id?: string) => goals.find(g => g.id === id)?.title;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.gridWrap}>
        <View style={styles.gridTimeCol}>
          <View style={styles.gridDayHead} />
          {hours.slice(0, -1).map(h => (
            <View key={h} style={{ height: HOUR_PX, justifyContent: 'flex-start' }}>
              <Text style={[styles.gridTime, { color: pal.ink3 }]}>{String(h).padStart(2, '0')}:00</Text>
            </View>
          ))}
        </View>
        {DAYS.map(day => (
          <View key={day} style={styles.gridDayCol}>
            <View style={styles.gridDayHead}>
              <Text style={[styles.gridDayLabel, { color: pal.ink2 }]}>{DAY_LABELS[day]}</Text>
            </View>
            <View style={[styles.gridDayBody, { height: gridH, borderColor: pal.lineSoft, backgroundColor: pal.surface2 }]}>
              {hours.slice(1, -1).map(h => (
                <View key={h} style={[styles.gridHourLine, { top: (h - startHour) * HOUR_PX, backgroundColor: pal.lineSoft }]} />
              ))}
              {blocks.filter(b => b.day === day).map(b => {
                const c = blockColors(pal, b.kind);
                const top = ((minutes(b.start) - startHour * 60) / 60) * HOUR_PX;
                const height = Math.max(((minutes(b.end) - minutes(b.start)) / 60) * HOUR_PX - 2, 16);
                return (
                  <View key={b.id} style={[styles.block, {
                    top, height,
                    borderColor: c.border,
                    backgroundColor: c.bg,
                    borderStyle: b.kind === 'rest' ? 'dashed' : 'solid',
                  }]}>
                    <Text numberOfLines={2} style={[styles.blockLabel, { color: c.text }]}>
                      {b.protected ? '◈ ' : ''}{b.label}
                    </Text>
                    {height > 34 && goalTitle(b.goalId) ? (
                      <Text numberOfLines={1} style={[styles.blockGoal, { color: pal.ink3 }]}>{goalTitle(b.goalId)}</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; errors: string[] }
  | { phase: 'ready'; data: LoadoutData };

export default function LoadoutScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const pal: Pal = scheme === 'light' ? PALETTES.light : PALETTES.dark;
  const { width } = useWindowDimensions();
  const twoCol = width >= 760;
  const [state, setState] = useState<LoadState>({ phase: 'loading' });

  useEffect(() => {
    if (Platform.OS !== 'web') {
      setState({ phase: 'error', errors: ['Loadout is a web console — open it at xaleths-domain.io/loadout.'] });
      return;
    }
    fetch('/private/loadout-data.json')
      .then(async res => {
        const type = res.headers.get('content-type') ?? '';
        if (!res.ok || !type.includes('json')) {
          // The edge worker 302s HTML to the login page when the session expired.
          window.location.href = '/login?next=/loadout';
          return;
        }
        const { data, errors } = validateLoadout(await res.json());
        setState(data ? { phase: 'ready', data } : { phase: 'error', errors });
      })
      .catch(err => setState({ phase: 'error', errors: [`Could not load loadout-data.json: ${String(err)}`] }));
  }, []);

  const body = useMemo(() => {
    if (state.phase === 'loading') {
      return <Text style={[styles.loading, { color: pal.ink2 }]}>LOADING…</Text>;
    }
    if (state.phase === 'error') {
      return (
        <Panel pal={pal} title="DATA ERROR" kicker="loadout-data.json failed validation">
          {state.errors.map((e, i) => (
            <Text key={i} style={[styles.warnText, { color: pal.danger }]}>▸ {e}</Text>
          ))}
        </Panel>
      );
    }
    const d = state.data;
    const activeGoals = d.goals.filter(g => g.status === 'active');
    const today = d.tasks.today;
    const overCap = today.length > TODAY_CAP;
    const preBed = d.routines.find(r => r.anchor === 'bedtime');

    return (
      <>
        <View style={[styles.row, !twoCol && styles.rowStack]}>
          {/* TODAY — R1: hard cap, no show-all affordance. */}
          <View style={twoCol ? styles.rowItem : undefined}>
            <Panel
              pal={pal}
              title="TODAY"
              kicker={`max ${TODAY_CAP} — the day has a bottom`}
              warn={overCap ? `${today.length} items committed — over the cap of ${TODAY_CAP}. Cut until it fits.` : null}
            >
              {today.length === 0 ? (
                <EmptyState
                  pal={pal}
                  line1="Nothing committed yet."
                  line2={`Plan the day with the Navi. Inbox holds ${d.tasks.inbox.length} item${d.tasks.inbox.length === 1 ? '' : 's'}.`}
                />
              ) : (
                today.slice(0, TODAY_CAP).map(t => (
                  <View key={t.id} style={[styles.taskRow, { borderColor: pal.lineSoft }]}>
                    <Text style={[styles.taskId, { color: pal.accent }]}>{t.id}</Text>
                    <View style={styles.taskBody}>
                      <Text style={[styles.taskItem, { color: pal.ink }]}>{t.item}</Text>
                      <Text style={[styles.taskMeta, { color: pal.ink3 }]}>
                        {t.estimate != null ? `~${t.estimate} min` : 'no estimate — Navi will ask'}
                        {t.by ? ` · by ${t.by}` : ''}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </Panel>
          </View>

          {/* TONIGHT — the stop signal slot (R5). Phase 2's Navi fills it. */}
          <View style={twoCol ? styles.rowItem : undefined}>
            <Panel pal={pal} title="TONIGHT" kicker="stop signal + deferrals">
              <EmptyState pal={pal} line1="No plan yet — ask the Navi." line2='"It’s this time, bed is at this time — what actually happens tonight?"' />
              {preBed ? (
                <View style={[styles.routineBox, { borderColor: pal.warmLine }]}>
                  <Text style={[styles.routineTitle, { color: pal.warm }]}>
                    {preBed.name.toUpperCase()} — {Math.abs(preBed.offset)} min before bed
                  </Text>
                  {preBed.steps.map((s, i) => (
                    <Text key={i} style={[styles.routineStep, { color: pal.ink2 }]}>▸ {s.label} · {s.minutes} min</Text>
                  ))}
                </View>
              ) : null}
            </Panel>
          </View>
        </View>

        <Panel pal={pal} title="WEEK" kicker="template — the routine you committed to, not a calendar mirror">
          <WeekGrid pal={pal} blocks={d.week.blocks} goals={d.goals} />
          <View style={styles.legendRow}>
            {([['goal', 'GOAL'], ['rest', '◈ REST (protected)'], ['routine', 'ROUTINE'], ['fixed', 'FIXED']] as const).map(([k, label]) => {
              const c = blockColors(pal, k);
              return (
                <View key={k} style={styles.legendItem}>
                  <View style={[styles.legendSwatch, { borderColor: c.border, backgroundColor: c.bg }]} />
                  <Text style={[styles.legendText, { color: pal.ink2 }]}>{label}</Text>
                </View>
              );
            })}
          </View>
        </Panel>

        <Panel pal={pal} title="GOALS" kicker={`${activeGoals.length} active`}>
          <View style={[styles.goalGrid, !twoCol && styles.rowStack]}>
            {activeGoals.map(g => (
              <View key={g.id} style={twoCol ? styles.goalGridItem : undefined}>
                <GoalCard pal={pal} g={g} all={d.goals} />
              </View>
            ))}
          </View>
        </Panel>

        <Panel pal={pal} title="CHECK-IN" kicker="nightly — M-004 is the whole system’s outcome variable">
          {d.metrics.definitions.map(m => {
            const entries = d.metrics.entries.filter(e => m.id in e.values);
            const latest = entries.length ? entries[entries.length - 1] : null;
            return (
              <View key={m.id} style={[styles.metricRow, { borderColor: pal.lineSoft }]}>
                <View style={styles.taskBody}>
                  <Text style={[styles.taskItem, { color: pal.ink }]}>{m.prompt}</Text>
                  <Text style={[styles.taskMeta, { color: pal.ink3 }]}>
                    {m.scale.min}–{m.scale.max} · {m.direction === 'lower-is-better' ? 'lower is better' : 'higher is better'}
                  </Text>
                </View>
                <Text style={[styles.metricVal, { color: latest ? pal.ink : pal.ink3 }]}>
                  {latest ? latest.values[m.id] : '—'}
                </Text>
              </View>
            );
          })}
          {d.metrics.entries.length === 0 ? (
            <Text style={[styles.cardNote, { color: pal.ink3 }]}>No entries yet — log tonight via Claude.</Text>
          ) : null}
        </Panel>

        {d.note ? <Text style={[styles.seedNote, { color: pal.ink3 }]}>⚠ {d.note}</Text> : null}
        <Text style={[styles.footer, { color: pal.ink3 }]}>loadout/v1 · updated {d.updated}</Text>
      </>
    );
  }, [state, pal, twoCol]);

  return (
    <View style={[styles.container, { backgroundColor: pal.page }]}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.inner}>
            <View style={styles.header}>
              <Pressable onPress={() => router.back()} style={styles.back}>
                <Text style={[styles.backText, { color: pal.ink2 }]}>← BACK</Text>
              </Pressable>
              <Text style={[styles.title, { color: pal.ink }]}>LOADOUT</Text>
              <Text style={[styles.subtitle, { color: pal.ink2 }]}>
                the doing console — earn the stop
              </Text>
            </View>
            {body}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // No alignItems:'center' here — it would shrink the ScrollView to its widest
  // child (the 1000px week grid) and blow the page out past narrow viewports.
  // Centering happens in `scroll` via the content container instead.
  safe: { flex: 1 },
  scroll: { width: '100%', alignItems: 'center' },
  inner: { width: '100%', maxWidth: 1100, paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.xxxl, gap: spacing.xl },
  header: { gap: spacing.xs },
  back: { marginBottom: spacing.xs },
  backText: { fontSize: 11, letterSpacing: 2, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: 4 },
  subtitle: { fontSize: 12, letterSpacing: 1 },
  loading: { fontSize: 12, letterSpacing: 2 },

  row: { flexDirection: 'row', gap: spacing.xl },
  rowStack: { flexDirection: 'column' },
  rowItem: { flex: 1, minWidth: 0 },

  panel: { borderWidth: 1, padding: spacing.xl, gap: spacing.md },
  panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: spacing.sm },
  panelTitle: { fontSize: 14, fontWeight: '800', letterSpacing: 3 },
  panelKicker: { fontSize: 10, letterSpacing: 1 },

  warnBox: { borderWidth: 1, borderStyle: 'dashed', padding: spacing.sm },
  warnText: { fontSize: 11, letterSpacing: 0.5, lineHeight: 16 },

  empty: { borderWidth: 1, borderStyle: 'dashed', padding: spacing.lg, gap: spacing.xs },
  emptyText: { fontSize: 12, letterSpacing: 0.5 },
  emptySub: { fontSize: 11, lineHeight: 16 },

  chip: { alignSelf: 'flex-start', borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  chipText: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },

  taskRow: { flexDirection: 'row', gap: spacing.md, borderBottomWidth: 1, paddingVertical: spacing.sm },
  taskId: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  taskBody: { flex: 1, gap: 2 },
  taskItem: { fontSize: 13, lineHeight: 18 },
  taskMeta: { fontSize: 10, letterSpacing: 0.5 },

  routineBox: { borderWidth: 1, padding: spacing.md, gap: spacing.xs, marginTop: spacing.sm },
  routineTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  routineStep: { fontSize: 11, lineHeight: 16 },

  gridWrap: { flexDirection: 'row', minWidth: 1000 },
  gridTimeCol: { width: 44 },
  gridDayCol: { flex: 1, minWidth: 92 },
  gridDayHead: { height: 24, justifyContent: 'center' },
  gridDayLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textAlign: 'center' },
  gridDayBody: { borderWidth: 1, marginHorizontal: 1, position: 'relative' },
  gridHourLine: { position: 'absolute', left: 0, right: 0, height: 1, opacity: 0.5 },
  gridTime: { fontSize: 8, letterSpacing: 0.5, textAlign: 'right', paddingRight: 6, marginTop: -4 },
  block: { position: 'absolute', left: 2, right: 2, borderWidth: 1, paddingHorizontal: 4, paddingVertical: 2 },
  blockLabel: { fontSize: 8.5, fontWeight: '700', letterSpacing: 0.3, lineHeight: 11 },
  blockGoal: { fontSize: 8, lineHeight: 10 },

  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendSwatch: { width: 12, height: 12, borderWidth: 1 },
  legendText: { fontSize: 10, letterSpacing: 1 },

  goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  goalGridItem: { flexBasis: '48%', flexGrow: 1, minWidth: 300 },
  goalCard: { borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  goalHead: { flexDirection: 'row', justifyContent: 'space-between' },
  goalType: { fontSize: 9, fontWeight: '800', letterSpacing: 2 },
  goalDomain: { fontSize: 9, letterSpacing: 2 },
  goalTitle: { fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
  cardMeta: { fontSize: 10, letterSpacing: 0.5 },
  cardNote: { fontSize: 11, lineHeight: 16 },
  paceLine: { fontSize: 11, lineHeight: 18 },

  meterWrap: { gap: spacing.xs },
  meterTrack: { height: 10, overflow: 'hidden' },
  meterFill: { height: '100%' },
  meterLabel: { fontSize: 11 },

  countRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  countNum: { fontSize: 34, fontWeight: '800', letterSpacing: 1 },
  countUnit: { fontSize: 11, letterSpacing: 1 },

  sparkRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 64 },
  sparkCol: { alignItems: 'center', gap: 2 },
  sparkBar: { width: 14 },
  sparkVal: { fontSize: 8 },

  dotRow: { flexDirection: 'row', gap: spacing.md },
  dotCol: { alignItems: 'center', gap: 4 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  dotLabel: { fontSize: 9, letterSpacing: 1 },

  metricRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, paddingVertical: spacing.sm },
  metricVal: { fontSize: 18, fontWeight: '800', minWidth: 32, textAlign: 'right' },

  seedNote: { fontSize: 10, lineHeight: 15, letterSpacing: 0.3 },
  footer: { fontSize: 9, letterSpacing: 1.5 },
});
