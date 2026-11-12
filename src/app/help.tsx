import { useState } from 'react';
import { router, Stack } from 'expo-router';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { versionLine } from '@/appUpdate';
import { sendClaim } from '@/documents';
import { readErrorLog } from '@/errorLog';
import { FEEDBACK_EMAIL } from '@/support';
import { colors, BUTTON_HEIGHT, BUTTON_RADIUS } from '@/theme';

// Help and feedback (section 13): short answers to the usual questions, and a feedback mail that carries
// the app version and, if the user wants, the error log from this phone.
export default function Help() {
  const { t, i18n } = useTranslation();
  const faq = t('help.faq', { returnObjects: true }) as { q: string; a: string }[];
  const [open, setOpen] = useState<number | null>(null);
  const [withLog, setWithLog] = useState(true);
  const errors = readErrorLog();

  function feedback() {
    const facts = [`Warrantly ${versionLine(i18n.language)}`, `${Platform.OS} ${Platform.Version}`, ...(withLog && errors.length ? ['', 'Errors:', ...errors] : [])];
    sendClaim(FEEDBACK_EMAIL, t('help.feedbackSubject'), `\n\n---\n${facts.join('\n')}`, []).catch(() => Alert.alert(t('detail.noMailApp')));
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('help.title') }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {faq.map((item, i) => (
          <Pressable key={i} style={styles.item} onPress={() => setOpen(open === i ? null : i)} accessibilityRole="button" accessibilityState={{ expanded: open === i }}>
            <Text style={styles.q}>{item.q}</Text>
            {open === i && <Text style={styles.a}>{item.a}</Text>}
          </Pressable>
        ))}
        <Text style={styles.heading} accessibilityRole="header">
          {t('help.feedbackTitle')}
        </Text>
        <Text style={styles.a}>{t('help.feedbackBody')}</Text>
        {errors.length > 0 && (
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('help.includeLog', { count: errors.length })}</Text>
            <Switch value={withLog} onValueChange={setWithLog} accessibilityLabel={t('help.includeLog', { count: errors.length })} />
          </View>
        )}
        <Pressable style={styles.button} onPress={feedback} accessibilityRole="button">
          <Text style={styles.buttonText}>{t('help.feedback')}</Text>
        </Pressable>
        <Pressable style={styles.link} onPress={() => router.push('/privacy')} accessibilityRole="link">
          <Text style={styles.linkText}>{t('privacy.title')}</Text>
        </Pressable>
        <Pressable style={styles.link} onPress={() => router.push('/whats-new')} accessibilityRole="link">
          <Text style={styles.linkText}>{t('whatsNew.title')}</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 4 },
  item: { paddingVertical: 14, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  q: { fontSize: 16, fontWeight: '600', color: colors.text },
  a: { fontSize: 15, lineHeight: 22, color: colors.muted },
  heading: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 24 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  switchLabel: { flex: 1, fontSize: 15, color: colors.text },
  button: { minHeight: BUTTON_HEIGHT, borderRadius: BUTTON_RADIUS, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  buttonText: { fontSize: 16, fontWeight: '600', color: colors.onPrimary },
  link: { minHeight: BUTTON_HEIGHT, justifyContent: 'center' },
  linkText: { fontSize: 16, fontWeight: '600', color: colors.primary },
});
