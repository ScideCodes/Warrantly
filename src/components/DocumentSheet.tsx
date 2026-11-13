import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from '@/components/themeMotion';
import AppIcon from '@/components/Icon';
import { SheetBody, SheetFrame } from '@/components/Sheet';
import { DocThumb } from '@/components/DocThumb';
import { Group, Row } from '@/components/ui';
import type { Attachment, Warranty } from '@/db/repo.ts';
import { documentExists } from '@/documents';
import { openViewer } from '@/docOpen';
import { colors, ROW_X, TYPE, themed } from '@/theme';

// The document picker behind the row's document button (shortlist 2): every document of the product with
// its first page and label; a file that is not on this phone says so and offers to restore or replace it;
// with no document, ways to add one. The row itself still opens the details.
export function DocumentSheet({ warranty, docs, title, onClose }: { warranty: Warranty | null; docs: Attachment[]; title: string; onClose: () => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const go = (attach: 'add' | null) => {
    onClose();
    if (warranty) router.push({ pathname: '/warranty/[id]', params: { id: String(warranty.id), ...(attach ? { attach } : {}) } });
  };
  return (
    <SheetFrame open={warranty !== null} onClose={onClose} title={title}>
      <SheetBody>
      {docs.length > 0 && (
        <Group inSheet>
          {docs.map((d, i) => {
            const missing = !documentExists(d.local_path);
            return (
              <Row
                key={d.id}
                separator={i > 0}
                onPress={() => {
                  if (missing) return go(null);
                  onClose();
                  openViewer({ ...d, warranty_id: warranty!.id }, title);
                }}
                accessibilityLabel={`${t(`docLabel.${d.label}`)}: ${d.filename}${missing ? `, ${t('detail.fileMissing')}` : ''}`}
                chevron
              >
                <DocThumb localPath={d.local_path} size={34} />
                <View style={styles.text}>
                  <Text style={styles.name} numberOfLines={2}>{d.filename}</Text>
                  <Text style={[styles.meta, missing && styles.missing]}>{missing ? t('docs.missingFix') : t(`docLabel.${d.label}`)}</Text>
                </View>
              </Row>
            );
          })}
        </Group>
      )}
      {docs.length === 0 && <Text style={styles.empty}>{t('docs.noneYet')}</Text>}
      <Group inSheet style={styles.actions}>
        <Row onPress={() => go('add')} iconInset>
          <AppIcon name="add-circle-outline" size={22} color={colors.tint} />
          <Text style={styles.action}>{t('detail.addDocument')}</Text>
        </Row>
        {docs.some((d) => !documentExists(d.local_path)) && (
          <Row onPress={() => { onClose(); router.push('/restore'); }} iconInset separator>
            <AppIcon name="cloud-download-outline" size={22} color={colors.tint} />
            <Text style={styles.action}>{t('backup.restore')}</Text>
          </Row>
        )}
      </Group>
      </SheetBody>
    </SheetFrame>
  );
}

const useStyles = themed(() => StyleSheet.create({
  text: { flex: 1, gap: 2 },
  name: { ...TYPE.body, color: colors.ink },
  meta: { ...TYPE.foot, color: colors.ink2 },
  missing: { color: colors.bad },
  empty: { ...TYPE.sub, color: colors.ink2, paddingHorizontal: ROW_X, paddingVertical: 8 },
  actions: { marginTop: 12 },
  action: { ...TYPE.body, flex: 1, color: colors.link },
}));
