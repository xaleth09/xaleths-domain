import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing } from '@/constants/theme';
import {
  Account,
  Bill,
  billAmountValue,
  currentBalance,
  validateZenny,
  ZennyData,
} from '@/types/zenny';

// ---------------------------------------------------------------------------
// Zenny — the financial console. Dark-only BN/PET, same conventions as
// Loadout (src/app/loadout.tsx). Chrome = BN neons; data marks = the
// dataviz-validated set (#1e93b5 / #b57917 / #8f62cf on #0d1526).
// Debt bars are a single-measure magnitude → one hue, direct-labeled.
// ---------------------------------------------------------------------------

const PALETTE = {
  page: '#080d1a',
  surface: '#0d1526',
  surface2: '#101c33',
  ink: '#ffffff',
  ink2: '#7eb8cc',
  ink3: '#4a6a7a',
  line: 'rgba(0, 212, 255, 0.4)',
  lineSoft: 'rgba(0, 212, 255, 0.15)',
  accent: '#00d4ff',
  warm: '#f5a623',
  warmLine: 'rgba(245, 166, 35, 0.5)',
  danger: '#ff6b6b',
  good: '#4fb07a',
  markCyan: '#1e93b5',
  markAmber: '#b57917',
  markViolet: '#8f62cf',
  markCyanBg: 'rgba(30, 147, 181, 0.18)',
  neutralBg: 'rgba(126, 184, 204, 0.08)',
  neutralLine: 'rgba(126, 184, 204, 0.35)',
  inkAmber: '#f0b445',
  glow: { shadowColor: '#00d4ff', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
} as const;

type Pal = typeof PALETTE;

const KIND_LABELS: Record<Account['kind'], string> = {
  cc: 'CARD', loan: 'LOAN', student: 'STUDENT', auto: 'AUTO',
};

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso + 'T23:59:59').getTime() - Date.now()) / 86400000);
}

// ---------------------------------------------------------------------------
// Shared pieces (kept page-local for now, mirroring loadout.tsx — consolidate
// into components/ when a third console lands).
// ---------------------------------------------------------------------------

function Panel({ pal, title, kicker, children }: {
  pal: Pal; title: string; kicker?: string; children: React.ReactNode;
}) {
  return (
    <View style={[styles.panel, { backgroundColor: pal.surface, borderColor: pal.line }, pal.glow]}>
      <View style={styles.panelHead}>
        <Text style={[styles.panelTitle, { color: pal.ink }]}>{title}</Text>
        {kicker ? <Text style={[styles.panelKicker, { color: pal.ink3 }]}>{kicker}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Chip({ pal, label, tone }: { pal: Pal; label: string; tone: 'accent' | 'warm' | 'muted' | 'good' }) {
  const color = tone === 'accent' ? pal.accent : tone === 'warm' ? pal.warm : tone === 'good' ? pal.good : pal.ink3;
  return (
    <View style={[styles.chip, { borderColor: color }]}>
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Bills — grouped by the paycheck that funds them (Robbi's own split).
// ---------------------------------------------------------------------------

function BillRow({ pal, bill, paid, account }: { pal: Pal; bill: Bill; paid: boolean; account?: Account }) {
  const amt = billAmountValue(bill.amount);
  const bal = account ? currentBalance(account) : null;
  return (
    <View style={[styles.billRow, { borderColor: pal.lineSoft }]}>
      <View style={[styles.payBox, {
        borderColor: paid ? pal.good : pal.neutralLine,
        backgroundColor: paid ? 'rgba(79, 176, 122, 0.15)' : 'transparent',
      }]}>
        <Text style={[styles.payMark, { color: paid ? pal.good : 'transparent' }]}>✓</Text>
      </View>
      <View style={styles.billBody}>
        <View style={styles.billTop}>
          <Text style={[styles.billName, { color: paid ? pal.ink3 : pal.ink }]}>{bill.name}</Text>
          {bill.autopay ? <Text style={[styles.autoTag, { color: pal.ink3 }]}>AUTO</Text> : <Text style={[styles.autoTag, { color: pal.inkAmber }]}>MANUAL</Text>}
        </View>
        <Text style={[styles.billMeta, { color: pal.ink3 }]}>
          due {bill.dueDay}{ordinal(bill.dueDay)}
          {bal != null ? ` · balance ${money(bal)}` : ''}
        </Text>
      </View>
      <Text style={[styles.billAmt, { color: paid ? pal.ink3 : pal.ink2 }]}>{amt.display}</Text>
    </View>
  );
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][Math.min(n % 10, 4) % 4] ?? 'th';
}

// ---------------------------------------------------------------------------
// Debt — composition bars (magnitude → single hue, direct-labeled) and the
// burndown line once history has more than one snapshot per account.
// ---------------------------------------------------------------------------

function DebtPanelBody({ pal, accounts }: { pal: Pal; accounts: Account[] }) {
  const withBal = accounts
    .map(a => ({ a, bal: currentBalance(a) }))
    .filter((x): x is { a: Account; bal: number } => x.bal != null)
    .sort((x, y) => y.bal - x.bal);
  const total = withBal.reduce((s, x) => s + x.bal, 0);
  const max = withBal.length ? withBal[0].bal : 1;
  const snapshots = Math.max(...accounts.map(a => a.history.length), 0);
  const missingApr = accounts.filter(a => a.apr == null).length;
  // Never silently drop an account: unknown balances render as pending rows,
  // and the total is labeled as excluding them.
  const unknown = accounts.filter(a => currentBalance(a) == null);

  return (
    <>
      <View style={styles.debtHead}>
        <Text style={[styles.debtTotal, { color: pal.ink }]}>{money(total)}</Text>
        <Text style={[styles.debtTotalLabel, { color: pal.ink3 }]}>
          total debt · {withBal.length} accounts{unknown.length ? ` · excludes ${unknown.length} pending` : ''}
        </Text>
      </View>
      {withBal.map(({ a, bal }) => (
        <View key={a.id} style={styles.debtRow}>
          <View style={styles.debtRowTop}>
            <Text style={[styles.debtName, { color: pal.ink }]}>
              {a.name} <Text style={{ color: pal.ink3, fontSize: 9 }}>{KIND_LABELS[a.kind]}</Text>
            </Text>
            <Text style={[styles.debtBal, { color: pal.ink2 }]}>{money(bal)}</Text>
          </View>
          <View style={[styles.debtTrack, { backgroundColor: pal.neutralBg }]}>
            <View style={[styles.debtFill, { width: `${(bal / max) * 100}%`, backgroundColor: pal.markCyan }]} />
          </View>
          <Text style={[styles.debtMeta, { color: pal.ink3 }]}>
            {a.apr != null ? `${a.apr}% APR` : 'APR pending'}
            {a.minPayment != null ? ` · pays ${money(a.minPayment)}/mo` : ''}
            {a.autopay ? ' · auto' : ' · manual'}
          </Text>
        </View>
      ))}
      {unknown.map(a => (
        <View key={a.id} style={styles.debtRow}>
          <View style={styles.debtRowTop}>
            <Text style={[styles.debtName, { color: pal.ink2 }]}>
              {a.name} <Text style={{ color: pal.ink3, fontSize: 9 }}>{KIND_LABELS[a.kind]}</Text>
            </Text>
            <Text style={[styles.debtBal, { color: pal.inkAmber }]}>balance pending</Text>
          </View>
          <Text style={[styles.debtMeta, { color: pal.ink3 }]}>
            {a.minPayment != null ? `pays ${money(a.minPayment)}/mo · ` : ''}{a.autopay ? 'auto' : 'manual'} · not in total until logged
          </Text>
        </View>
      ))}
      {snapshots < 2 ? (
        <Text style={[styles.note, { color: pal.ink3 }]}>
          Burndown line appears after the second monthly snapshot — one point in history so far. Log balances monthly and the chart draws itself.
        </Text>
      ) : null}
      {missingApr > 0 ? (
        <Text style={[styles.note, { color: pal.inkAmber }]}>
          ⚠ {missingApr} account{missingApr === 1 ? '' : 's'} missing APR — payoff ordering and projections need them.
        </Text>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; errors: string[] }
  | { phase: 'ready'; data: ZennyData };

export default function ZennyScreen() {
  const router = useRouter();
  const pal: Pal = PALETTE;
  const { width } = useWindowDimensions();
  const twoCol = width >= 760;
  const [state, setState] = useState<LoadState>({ phase: 'loading' });

  useEffect(() => {
    if (Platform.OS !== 'web') {
      setState({ phase: 'error', errors: ['Zenny is a web console — open it at xaleths-domain.io/zenny.'] });
      return;
    }
    fetch('/private/zenny-data.json')
      .then(async res => {
        const type = res.headers.get('content-type') ?? '';
        if (!res.ok || !type.includes('json')) {
          window.location.href = '/login?next=/zenny';
          return;
        }
        const { data, errors } = validateZenny(await res.json());
        setState(data ? { phase: 'ready', data } : { phase: 'error', errors });
      })
      .catch(err => setState({ phase: 'error', errors: [`Could not load zenny-data.json: ${String(err)}`] }));
  }, []);

  const body = useMemo(() => {
    if (state.phase === 'loading') {
      return <Text style={[styles.loading, { color: pal.ink2 }]}>LOADING…</Text>;
    }
    if (state.phase === 'error') {
      return (
        <Panel pal={pal} title="DATA ERROR" kicker="zenny-data.json failed validation">
          {state.errors.map((e, i) => (
            <Text key={i} style={[styles.warnText, { color: pal.danger }]}>▸ {e}</Text>
          ))}
        </Panel>
      );
    }

    const d = state.data;
    const now = new Date();
    const mk = monthKey(now);
    const paid = new Set(d.paidLog[mk] ?? []);
    const accountById = new Map(d.accounts.map(a => [a.id, a]));

    const periods = d.income.paychecks.map(p => {
      const bills = d.bills.filter(b => b.period === p.id).sort((a, b) => a.dueDay - b.dueDay);
      let committed = 0;
      let hasFlex = false;
      let hasRange = false;
      for (const b of bills) {
        const v = billAmountValue(b.amount);
        if (v.mid == null) hasFlex = true;
        else {
          committed += v.mid;
          if (b.amount.type === 'range') hasRange = true;
        }
      }
      const leftover = p.net - committed;
      const paidCount = bills.filter(b => paid.has(b.id)).length;
      return { p, bills, committed, leftover, hasFlex, hasRange, paidCount };
    });

    const monthNet = d.income.paychecks.reduce((s, p) => s + p.net, 0);
    const monthCommitted = periods.reduce((s, x) => s + x.committed, 0);
    const monthLeft = monthNet - monthCommitted;

    const grant = d.equity.grants[0];
    const nextVest = grant?.vests.find(v => daysUntil(v.date) >= 0) ?? null;
    const price = d.equity.price;
    const vestGross = nextVest && price ? nextVest.shares * price.value : null;
    const vestNet = vestGross != null ? vestGross * (1 - d.equity.withholdingPct) : null;
    const totalDebt = d.accounts.reduce((s, a) => s + (currentBalance(a) ?? 0), 0);

    return (
      <>
        {d.demo ? (
          <View style={[styles.demoBanner, { borderColor: pal.warm }]}>
            <Text style={[styles.demoText, { color: pal.warm }]}>
              ◈ DEMO DATA — every number here is fake. Real data lands after the repo goes private.
            </Text>
          </View>
        ) : null}

        <Panel
          pal={pal}
          title="BILLS"
          kicker={`${now.toLocaleString('en-US', { month: 'long' })} · grouped by the paycheck that funds them`}
        >
          <View style={[styles.row, !twoCol && styles.rowStack]}>
            {periods.map(({ p, bills, committed, leftover, hasFlex, hasRange, paidCount }) => (
              <View key={p.id} style={twoCol ? styles.rowItem : undefined}>
                <View style={[styles.periodBox, { borderColor: pal.lineSoft, backgroundColor: pal.surface2 }]}>
                  <View style={styles.periodHead}>
                    <Text style={[styles.periodTitle, { color: pal.accent }]}>
                      PAID ON THE {p.day}{ordinal(p.day)}
                    </Text>
                    <Text style={[styles.periodNet, { color: pal.ink2 }]}>{money(p.net)} in</Text>
                  </View>
                  {bills.map(b => (
                    <BillRow key={b.id} pal={pal} bill={b} paid={paid.has(b.id)} account={b.accountId ? accountById.get(b.accountId) : undefined} />
                  ))}
                  <View style={styles.periodFoot}>
                    <Text style={[styles.periodFootText, { color: pal.ink3 }]}>
                      {paidCount}/{bills.length} paid · {hasRange ? '~' : ''}{money(committed)} committed{hasFlex ? ' + flex' : ''}
                    </Text>
                    <Text style={[styles.periodLeft, { color: leftover > 400 ? pal.good : pal.inkAmber }]}>
                      {money(leftover)} left
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </Panel>

        <View style={[styles.row, !twoCol && styles.rowStack]}>
          <View style={twoCol ? styles.rowItem : undefined}>
            <Panel pal={pal} title="DEBT" kicker="burndown — the line that goes down">
              <DebtPanelBody pal={pal} accounts={d.accounts} />
            </Panel>
          </View>

          <View style={twoCol ? styles.rowItem : undefined}>
            <Panel pal={pal} title="SAFE TO SPEND" kicker="income − committed bills, per month">
              <View style={styles.debtHead}>
                <Text style={[styles.debtTotal, { color: monthLeft > 0 ? pal.good : pal.danger }]}>{money(monthLeft)}</Text>
                <Text style={[styles.debtTotalLabel, { color: pal.ink3 }]}>
                  before food, gas, and everything unbilled
                </Text>
              </View>
              <Text style={[styles.note, { color: pal.ink2 }]}>
                {money(monthNet)} in − {money(monthCommitted)} committed. This number is the whole budget story: what
                you spend past it comes out of savings.
              </Text>
              {d.savings.balance != null && d.savings.target != null ? (
                <View style={styles.savingsWrap}>
                  <View style={styles.debtRowTop}>
                    <Text style={[styles.debtName, { color: pal.ink }]}>Savings</Text>
                    <Text style={[styles.debtBal, { color: pal.ink2 }]}>
                      {money(d.savings.balance)} / {money(d.savings.target)}
                    </Text>
                  </View>
                  <View style={[styles.debtTrack, { backgroundColor: pal.neutralBg }]}>
                    <View style={[styles.debtFill, {
                      width: `${Math.min((d.savings.balance / d.savings.target) * 100, 100)}%`,
                      backgroundColor: pal.markAmber,
                    }]} />
                  </View>
                </View>
              ) : (
                <Text style={[styles.note, { color: pal.ink3 }]}>No savings target set yet.</Text>
              )}
            </Panel>
          </View>
        </View>

        <Panel pal={pal} title="EQUITY" kicker={grant ? `${grant.totalShares.toLocaleString()} RSUs · ${grant.ticker}` : 'no grants'}>
          {grant && nextVest ? (
            <>
              <View style={styles.debtHead}>
                <Text style={[styles.debtTotal, { color: pal.ink }]}>{daysUntil(nextVest.date)}</Text>
                <Text style={[styles.debtTotalLabel, { color: pal.ink3 }]}>
                  days to first cliff · {nextVest.pct}% = {nextVest.shares.toLocaleString()} shares on {nextVest.date}
                </Text>
              </View>
              {price && vestGross != null && vestNet != null ? (
                <>
                  <View style={[styles.vestGrid, !twoCol && styles.rowStack]}>
                    <View style={[styles.vestCell, { borderColor: pal.lineSoft }]}>
                      <Text style={[styles.vestLabel, { color: pal.ink3 }]}>AT {money(price.value)}/SH ({price.asOf})</Text>
                      <Text style={[styles.vestValue, { color: pal.ink }]}>{money(vestGross)}</Text>
                      <Text style={[styles.vestSub, { color: pal.ink3 }]}>gross</Text>
                    </View>
                    <View style={[styles.vestCell, { borderColor: pal.lineSoft }]}>
                      <Text style={[styles.vestLabel, { color: pal.ink3 }]}>EST. AFTER ~{Math.round(d.equity.withholdingPct * 100)}% WITHHOLDING</Text>
                      <Text style={[styles.vestValue, { color: pal.good }]}>{money(vestNet)}</Text>
                      <Text style={[styles.vestSub, { color: pal.ink3 }]}>estimate — not tax advice</Text>
                    </View>
                    <View style={[styles.vestCell, { borderColor: pal.lineSoft }]}>
                      <Text style={[styles.vestLabel, { color: pal.ink3 }]}>VS TOTAL DEBT {money(totalDebt)}</Text>
                      <Text style={[styles.vestValue, { color: pal.inkAmber }]}>
                        {totalDebt > 0 ? `${Math.min(Math.round((vestNet / totalDebt) * 100), 100)}%` : '—'}
                      </Text>
                      <Text style={[styles.vestSub, { color: pal.ink3 }]}>coverage if all goes to debt</Text>
                    </View>
                  </View>
                  {nextVest.plan ? <Chip pal={pal} label={`PLAN: ${nextVest.plan}`} tone="warm" /> : null}
                </>
              ) : (
                <Text style={[styles.note, { color: pal.ink3 }]}>No share price on file — set equity.price to value this.</Text>
              )}
              {grant.note ? <Text style={[styles.note, { color: pal.ink3 }]}>{grant.note}</Text> : null}
            </>
          ) : (
            <Text style={[styles.note, { color: pal.ink3 }]}>No upcoming vests.</Text>
          )}
        </Panel>

        {d.note ? <Text style={[styles.seedNote, { color: pal.ink3 }]}>⚠ {d.note}</Text> : null}
        <Text style={[styles.footer, { color: pal.ink3 }]}>zenny/v1 · updated {d.updated}</Text>
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
              <Text style={[styles.title, { color: pal.ink }]}>ZENNY</Text>
              <Text style={[styles.subtitle, { color: pal.ink2 }]}>
                the money console — know the number, watch the line go down
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
  // No alignItems:'center' on safe — see loadout.tsx (it blows out narrow viewports).
  safe: { flex: 1 },
  scroll: { width: '100%', alignItems: 'center' },
  inner: { width: '100%', maxWidth: 1100, paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.xxxl, gap: spacing.xl },
  header: { gap: spacing.xs },
  back: { marginBottom: spacing.xs },
  backText: { fontSize: 11, letterSpacing: 2, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: 4 },
  subtitle: { fontSize: 12, letterSpacing: 1 },
  loading: { fontSize: 12, letterSpacing: 2 },

  demoBanner: { borderWidth: 1, borderStyle: 'dashed', padding: spacing.md },
  demoText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },

  row: { flexDirection: 'row', gap: spacing.xl },
  rowStack: { flexDirection: 'column' },
  rowItem: { flex: 1, minWidth: 0 },

  panel: { borderWidth: 1, padding: spacing.xl, gap: spacing.md },
  panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: spacing.sm },
  panelTitle: { fontSize: 14, fontWeight: '800', letterSpacing: 3 },
  panelKicker: { fontSize: 10, letterSpacing: 1 },
  warnText: { fontSize: 11, letterSpacing: 0.5, lineHeight: 16 },
  note: { fontSize: 11, lineHeight: 16 },

  chip: { alignSelf: 'flex-start', borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  chipText: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },

  periodBox: { borderWidth: 1, padding: spacing.lg, gap: 2 },
  periodHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing.sm },
  periodTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  periodNet: { fontSize: 11, fontWeight: '600' },
  periodFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: spacing.sm },
  periodFootText: { fontSize: 10, letterSpacing: 0.5 },
  periodLeft: { fontSize: 13, fontWeight: '800' },

  billRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, paddingVertical: spacing.sm },
  payBox: { width: 20, height: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  payMark: { fontSize: 12, fontWeight: '800' },
  billBody: { flex: 1, gap: 1 },
  billTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  billName: { fontSize: 13, fontWeight: '600' },
  autoTag: { fontSize: 8, fontWeight: '700', letterSpacing: 1.5 },
  billMeta: { fontSize: 10, letterSpacing: 0.3 },
  billAmt: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },

  debtHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
  debtTotal: { fontSize: 30, fontWeight: '800', letterSpacing: 0.5 },
  debtTotalLabel: { fontSize: 11, letterSpacing: 0.5 },
  debtRow: { gap: 3, marginTop: spacing.xs },
  debtRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  debtName: { fontSize: 12, fontWeight: '600' },
  debtBal: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  debtTrack: { height: 8, overflow: 'hidden' },
  debtFill: { height: '100%' },
  debtMeta: { fontSize: 9.5, letterSpacing: 0.3 },

  savingsWrap: { gap: 3, marginTop: spacing.sm },

  vestGrid: { flexDirection: 'row', gap: spacing.md },
  vestCell: { flex: 1, borderWidth: 1, padding: spacing.md, gap: 2, minWidth: 150 },
  vestLabel: { fontSize: 8.5, fontWeight: '700', letterSpacing: 1 },
  vestValue: { fontSize: 22, fontWeight: '800' },
  vestSub: { fontSize: 9, letterSpacing: 0.5 },

  seedNote: { fontSize: 10, lineHeight: 15, letterSpacing: 0.3 },
  footer: { fontSize: 9, letterSpacing: 1.5 },
});
