import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '@/theme';

// Privacy policy (section 13). The same text is in docs/privacy.md for the store listing.
export default function Privacy() {
  const { t } = useTranslation();
  const paragraphs = t('privacy.body', { returnObjects: true }) as string[];
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('privacy.title') }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {paragraphs.map((p, i) => (
          <Text key={i} style={p.startsWith('## ') ? styles.heading : styles.body} accessibilityRole={p.startsWith('## ') ? 'header' : undefined}>
            {p.replace(/^## /, '')}
          </Text>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 12 },
  heading: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 8 },
  body: { fontSize: 15, lineHeight: 22, color: colors.text },
});
