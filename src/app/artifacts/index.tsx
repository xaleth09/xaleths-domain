import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, MaxContentWidth, shadows, spacing } from '@/constants/theme';

type Artifact = {
  id: string;
  title: string;
  description: string;
  url: string;
  tag?: string;
  // Real protection lives in the Worker; this flag is only the UI marker.
  requiresAuth?: boolean;
};

const ARTIFACTS: Artifact[] = [
  {
    id: 'team-splitter',
    title: 'Team Splitter',
    description: 'Every valid way to split the player pool into two 3-person core teams for 9-ball league play — both teams kept in Gold or Silver (never Platinum), leftovers as rating-free subs. Enforces Robbi & Aaron on opposite teams and the higher-rated-only sub rule, with a balance thermometer, division-matchup views, and a "same team" player filter.',
    url: '/team-splitter.html',
    tag: 'TOOL',
  },
  {
    id: 'weed-comparison',
    title: 'California Cannabis Flower Guide',
    description: 'Buyer\'s guide to nine prominent California cannabis flower brands (2026) — ranked from ultra-premium boutique down to budget bulk, with a quality matrix, brand profiles, and a shopping playbook.',
    url: '/weed-comparison.html',
    tag: 'GUIDE',
  },
  {
    id: 'flavor-form-study',
    title: 'Flavor Form Study',
    description: 'Visual design exploration for distld — studying how flavor maps to form. Part of the distilled visual design direction work.',
    url: '/private/flavor-form-study.html',
    tag: 'DESIGN',
    requiresAuth: true,
  },
  {
    id: 'fanime-2026',
    title: 'FanimeCon 2026 Schedule',
    description: 'Interactive event schedule for FanimeCon 2026. May 22–26, San Jose CA. Filter by category, search by name, tap for details.',
    url: '/fanime.html',
    tag: 'EVENT',
  },
  {
    id: 'napa-wineries',
    title: 'Napa Valley Winery Comparison',
    description: 'Tasting-day planner comparing four grand, Cabernet-forward Napa estates — HALL St. Helena, PEJU, Stag\'s Leap Wine Cellars, and Duckhorn\'s Paraduxx — all under a $125/person cap. Photo cards for each estate plus a click-to-sort comparison matrix of price, wine focus, architectural vibe, and planning notes.',
    url: '/napa-wineries.html',
    tag: 'GUIDE',
  },
  {
    id: 'flamecraft',
    title: 'Flamecraft — Turn, Setup, Rulebook & FAQ',
    description: 'Table reference for the board game Flamecraft. An interactive turn script that walks you through every fork — Gather or Enchant, place a Dragon, fire up, shop ability — one decision at a time, with a full linear version on a toggle. Plus a setup guide keyed to player count (1–5, solo included), the complete 20-page rulebook as a browsable gallery, and a searchable FAQ that grows as questions come up.',
    url: '/flamecraft.html',
    tag: 'GUIDE',
  },
];

export default function ArtifactsScreen() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    fetch('/api/auth-status')
      .then(res => res.json())
      .then((data: { authed?: boolean }) => setAuthed(Boolean(data.authed)))
      .catch(() => setAuthed(false));
  }, []);

  function openArtifact(artifact: Artifact) {
    if (Platform.OS !== 'web') return;
    if (artifact.requiresAuth && !authed) {
      // Bounce through the styled login, then land back on the artifact.
      window.location.href = `/login?next=${encodeURIComponent(artifact.url)}`;
      return;
    }
    (window as Window).open(artifact.url, '_blank');
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.inner}>

          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.back}>
              <Text style={styles.backText}>← BACK</Text>
            </Pressable>
            <Text style={styles.title}>ARTIFACTS</Text>
            <Text style={styles.subtitle}>random docs, tools, and things that need a URL</Text>
          </View>

          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {ARTIFACTS.map(artifact => {
              const locked = Boolean(artifact.requiresAuth) && !authed;
              return (
                <View key={artifact.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.tagRow}>
                      {artifact.tag && (
                        <Text style={styles.tag}>{artifact.tag}</Text>
                      )}
                      {artifact.requiresAuth && (
                        <Text style={styles.lockBadge}>
                          {locked ? '🔒 LOCKED' : '🔓 UNLOCKED'}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.cardTitle}>{artifact.title}</Text>
                  </View>
                  <Text style={styles.cardDescription}>{artifact.description}</Text>
                  <Pressable
                    style={({ pressed }) => [styles.openButton, pressed && styles.openButtonPressed]}
                    onPress={() => openArtifact(artifact)}
                  >
                    <Text style={styles.openButtonText}>{locked ? 'UNLOCK →' : 'OPEN →'}</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>

        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.page,
  },
  safe: {
    flex: 1,
    alignItems: 'center',
  },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    gap: spacing.xxl,
  },
  header: {
    gap: spacing.sm,
  },
  back: {
    marginBottom: spacing.xs,
  },
  backText: {
    fontSize: 11,
    letterSpacing: 2,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 4,
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: 12,
    letterSpacing: 1,
    color: colors.text.secondary,
  },
  list: {
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  card: {
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.border.cyan,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadows.cyanGlow,
  },
  cardHeader: {
    gap: spacing.xs,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: colors.accent.cyan,
  },
  lockBadge: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: colors.accent.gold,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.text.primary,
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.text.secondary,
  },
  openButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.accent.gold,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    ...shadows.goldGlow,
  },
  openButtonPressed: {
    borderColor: colors.accent.cyan,
    ...shadows.cyanGlow,
  },
  openButtonText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: colors.accent.gold,
  },
});
