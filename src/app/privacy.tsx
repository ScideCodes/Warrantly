import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Page } from '@/components/Page';
import { colors, TYPE, themed } from '@/theme';

// Privacy policy (section 13). The same text is in docs/privacy.md for the store listing.
export default function Privacy() {
  const styles = useStyles();
  const { t } = useTranslation();
  const paragraphs = t('privacy.body', { returnObjects: true }) as string[];
  return (
    <Page title={t('privacy.title')} contentContainerStyle={styles.content}>
      {paragraphs.map((p, i) => (
        <Text key={i} style={p.startsWith('## ') ? styles.heading : styles.body} accessibilityRole={p.startsWith('## ') ? 'header' : undefined}>
          {p.replace(/^## /, '')}
        </Text>
      ))}
    </Page>
  );
}

const useStyles = themed(() => StyleSheet.create({
  content: { gap: 12 },
  heading: { ...TYPE.headline, color: colors.ink, marginTop: 16, paddingHorizontal: 4 },
  body: { ...TYPE.body, color: colors.ink, paddingHorizontal: 4 },
}));
