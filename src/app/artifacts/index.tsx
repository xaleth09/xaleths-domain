import { useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, MaxContentWidth, shadows, spacing } from '@/constants/theme';

type Artifact = {
  id: string;
  title: string;
  description: string;
  url: string;
  tag?: string;
};

const ARTIFACTS: Artifact[] = [
  {
    id: 'fanime-2026',
    title: 'FanimeCon 2026 Schedule',
    description: 'Interactive event schedule for FanimeCon 2026. May 22–26, San Jose CA. Filter by category, search by name, tap for details.',
    url: '/fanime.html',
    tag: 'EVENT',
  },
];

export default function ArtifactsScreen() {
  const router = useRouter();

  function openArtifact(url: string) {
    if (Platform.OS === 'web') {
      (window as Window).open(url, '_blank');
    }
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
            {ARTIFACTS.map(artifact => (
              <View key={artifact.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  {artifact.tag && (
                    <Text style={styles.tag}>{artifact.tag}</Text>
                  )}
                  <Text style={styles.cardTitle}>{artifact.title}</Text>
                </View>
                <Text style={styles.cardDescription}>{artifact.description}</Text>
                <Pressable
                  style={({ pressed }) => [styles.openButton, pressed && styles.openButtonPressed]}
                  onPress={() => openArtifact(artifact.url)}
                >
                  <Text style={styles.openButtonText}>OPEN →</Text>
                </Pressable>
              </View>
            ))}
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
  tag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: colors.accent.cyan,
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
