import { Text } from '@/components/themeMotion';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { goBack } from '@/nav';
import { Page } from '@/components/Page';
import { Button, Group, Row } from '@/components/ui';
import { colors, TYPE, themed } from '@/theme';
import { markWhatsNewSeen } from '@/whatsNew';

// What's new in this version (section 13). Opened once after an update, and from Help.
export default function WhatsNew() {
  const styles = useStyles();
  const { t } = useTranslation();
  const notes = t('whatsNew.notes', { returnObjects: true }) as string[];
  useEffect(markWhatsNewSeen, []);
  return (
    <Page title={t('whatsNew.title')} footer={<Button title={t('whatsNew.ok')} onPress={goBack} />}>
      <Group style={styles.group}>
        {notes.map((n, i) => (
          <Row key={i} separator={i > 0}>
            <Text style={styles.note}>{n}</Text>
          </Row>
        ))}
      </Group>
    </Page>
  );
}

const useStyles = themed(() => StyleSheet.create({
  group: { marginTop: 8 },
  note: { ...TYPE.body, color: colors.ink, flex: 1 },
}));
