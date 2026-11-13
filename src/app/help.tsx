import { useState } from 'react';
import AppIcon from '@/components/Icon';
import { router } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { versionLine } from '@/appUpdate';
import { sendClaim } from '@/documents';
import { readErrorLog } from '@/errorLog';
import { FEEDBACK_EMAIL } from '@/support';
import { Page } from '@/components/Page';
import { showAlert } from '@/components/Dialog';
import { Button, Group, Row, SectionHeader, Switch } from '@/components/ui';
import { colors, ROW_X, TYPE, themed } from '@/theme';

// Help and feedback (section 13): short answers to the usual questions, and a feedback mail that carries
// the app version and, if wanted, the error log from this phone.
export default function Help() {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const faq = t('help.faq', { returnObjects: true }) as { q: string; a: string }[];
  const [open, setOpen] = useState<number | null>(null);
  const [withLog, setWithLog] = useState(true);
  const errors = readErrorLog();

  function feedback() {
    const facts = [`Warrantly ${versionLine(i18n.language)}`, `${Platform.OS} ${Platform.Version}`, ...(withLog && errors.length ? ['', 'Errors:', ...errors] : [])];
    sendClaim(FEEDBACK_EMAIL, t('help.feedbackSubject'), `\n\n---\n${facts.join('\n')}`, []).catch(() => showAlert(t('detail.noMailApp')));
  }

  return (
    <Page title={t('help.title')}>
      {/* The reference's fold rows: a Body summary with a + that turns to x, the answer in Subheadline. */}
      <Group style={styles.first}>
        {faq.map((item, i) => (
          <View key={i}>
            <Row separator={i > 0} onPress={() => setOpen(open === i ? null : i)} accessibilityState={{ expanded: open === i }}>
              <Text style={styles.q}>{item.q}</Text>
              <AppIcon name="add" size={16} color={colors.ink3} style={open === i && styles.turned} />
            </Row>
            {open === i && <Text style={styles.a}>{item.a}</Text>}
          </View>
        ))}
      </Group>
      <SectionHeader title={t('help.feedbackTitle')} />
      <Text style={styles.note}>{t('help.feedbackBody')}</Text>
      {errors.length > 0 && (
        <Group style={styles.gap}>
          <Row>
            <Text style={styles.q}>{t('help.includeLog', { count: errors.length })}</Text>
            <Switch value={withLog} onValueChange={setWithLog} accessibilityLabel={t('help.includeLog', { count: errors.length })} />
          </Row>
        </Group>
      )}
      <Button title={t('help.feedback')} onPress={feedback} style={styles.gap} />
      <Group style={styles.links}>
        <Row chevron onPress={() => router.push('/privacy')} accessibilityRole="link">
          <Text style={styles.q}>{t('privacy.title')}</Text>
        </Row>
        <Row chevron separator onPress={() => router.push('/whats-new')} accessibilityRole="link">
          <Text style={styles.q}>{t('whatsNew.title')}</Text>
        </Row>
      </Group>
    </Page>
  );
}

const useStyles = themed(() => StyleSheet.create({
  first: { marginTop: 8 },
  q: { ...TYPE.body, flex: 1, color: colors.ink },
  turned: { transform: [{ rotate: '45deg' }] },
  a: { ...TYPE.sub, color: colors.ink2, paddingTop: 8, paddingBottom: 12, paddingHorizontal: ROW_X },
  note: { ...TYPE.sub, color: colors.ink2, paddingHorizontal: 4 },
  gap: { marginTop: 16 },
  links: { marginTop: 20 },
}));
