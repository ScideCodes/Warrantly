import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { goBack } from '@/nav';
import { colors } from '@/theme';
import { markWhatsNewSeen } from '@/whatsNew';

// What's new in this version (section 13). Opened once after an update, and from Help.
export default function WhatsNew() {
  const { t } = useTranslation();
  const notes = t('whatsNew.notes', { returnObjects: true }) as string[];
  useEffect(markWhatsNewSeen, []);
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('whatsNew.title') }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {notes.map((n, i) => (
          <Text key={i} style={styles.note}>
            •  {n}
          </Text>
        ))}
        <Pressable style={styles.button} onPress={goBack} accessibilityRole="button">
          <Text style={styles.buttonText}>{t('whatsNew.ok')}</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 12 },
  note: { fontSize: 16, lineHeight: 23, color: colors.text },
  button: { minHeight: 48, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  buttonText: { fontSize: 16, fontWeight: '600', color: colors.onPrimary },
});
