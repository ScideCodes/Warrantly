import { Redirect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { getUsername } from '@/settings';
import { colors } from '@/theme';

// Home. Becomes the warranty list in build step 3.
export default function Home() {
  const { t } = useTranslation();
  const name = getUsername();
  if (!name) return <Redirect href="/onboarding" />;

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.greeting} accessibilityRole="header">
        {t('home.greeting', { name })}
      </Text>
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>{t('home.emptyTitle')}</Text>
        <Text style={styles.emptyBody}>{t('home.emptyBody')}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 24 },
  greeting: { fontSize: 28, fontWeight: '700', color: colors.text },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: colors.text, textAlign: 'center' },
  emptyBody: { fontSize: 16, lineHeight: 24, color: colors.muted, textAlign: 'center', maxWidth: 320 },
});
