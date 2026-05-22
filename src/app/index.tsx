import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, MaxContentWidth, shadows, spacing } from '@/constants/theme';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <View style={styles.hero}>
            <Text style={styles.title}>XALETH.DEV</Text>
            <Text style={styles.subtitle}>personal domain</Text>
          </View>

          <View style={styles.nav}>
            <Pressable
              style={({ pressed }) => [styles.navButton, pressed && styles.navButtonPressed]}
              onPress={() => router.push('/artifacts')}
            >
              <Text style={styles.navButtonText}>ARTIFACTS</Text>
              <Text style={styles.navButtonArrow}>→</Text>
            </Pressable>
          </View>
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
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: spacing.xl,
    justifyContent: 'space-between',
    paddingVertical: spacing.xxxl,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 4,
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: 13,
    letterSpacing: 3,
    color: colors.text.secondary,
    textTransform: 'uppercase',
  },
  nav: {
    gap: spacing.md,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.accent.cyan,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    ...shadows.cyanGlow,
  },
  navButtonPressed: {
    borderColor: colors.accent.gold,
    ...shadows.goldGlow,
  },
  navButtonText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
    color: colors.accent.cyan,
  },
  navButtonArrow: {
    fontSize: 16,
    color: colors.accent.cyan,
  },
});
