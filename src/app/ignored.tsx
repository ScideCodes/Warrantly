import { EmptyState } from '@/components/EmptyState';
import { Pressable, Text, View } from '@/components/themeMotion';
import { useCallback, useState } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/components/WarrantyRow';
import { ListPage } from '@/components/Page';
import { Button, Group, Row } from '@/components/ui';
import { SheetBody, SheetFrame } from '@/components/Sheet';
import { DocThumb } from '@/components/DocThumb';
import AppIcon, { type IconName } from '@/components/Icon';
import { getDb } from '@/db/client';
import { getIgnoredDetail, listIgnored, restoreIgnored, type IgnoredDetail, type IgnoredRow } from '@/db/repo.ts';
import { colors, RADIUS, TYPE, themed } from '@/theme';

// Ignored mails (section 8): hidden from the lists, but reviewable and restorable.
export default function Ignored() {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<IgnoredRow[]>([]);
  const [detail, setDetail] = useState<IgnoredDetail | null>(null);

  const reload = useCallback(() => {
    void getDb().then(listIgnored).then(setRows);
  }, []);
  useFocusEffect(reload);

  async function openDetail(id: number) {
    const item = await getIgnoredDetail(await getDb(), id);
    if (item) setDetail(item);
  }

  async function restore(id: number) {
    await restoreIgnored(await getDb(), id); // goes to "Needs your attention" to be completed
    if (detail?.id === id) setDetail(null);
    reload();
  }

  const reasonInfo = (reason: IgnoredDetail['reason']): { icon: IconName; title: string; desc: string } => {
    switch (reason) {
      case 'sender':
        return {
          icon: 'filter-outline',
          title: t('ignored.reasonSender'),
          desc: t('ignored.reasonSenderDesc'),
        };
      case 'manual':
        return {
          icon: 'hand-left-outline',
          title: t('ignored.reasonManual'),
          desc: t('ignored.reasonManualDesc'),
        };
      case 'no_warranty':
      default:
        return {
          icon: 'document-text-outline',
          title: t('ignored.reasonNoWarranty'),
          desc: t('ignored.reasonNoWarrantyDesc'),
        };
    }
  };

  return (
    <>
      <ListPage
        title={t('ignored.title')}
        lead={t('ignored.hint')}
        header={<View style={styles.gap} />}
        data={rows}
        keyExtractor={(r) => String(r.id)}
        ListEmptyComponent={<EmptyState message={t('ignored.empty')} icon="mail-outline" />}
        renderItem={({ item, index }) => (
          <Row separator={index > 0} style={[styles.card, index === 0 && styles.first, index === rows.length - 1 && styles.last]}>
            <Pressable
              onPress={() => void openDetail(item.id)}
              style={styles.text}
              accessibilityRole="button"
              accessibilityLabel={`${t('ignored.detailsTitle')}: ${item.subject ?? item.product_name ?? item.store_name}`}
            >
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.subject ?? item.product_name ?? item.store_name}
                </Text>
                <AppIcon name="information-circle-outline" size={16} color={colors.ink2} style={styles.infoIcon} />
              </View>
              <Text style={styles.meta} numberOfLines={1}>
                {item.sender ?? item.store_name} · {formatDate(item.purchase_date, i18n.language)}
              </Text>
            </Pressable>
            <Button
              kind="glass"
              title={t('ignored.restore')}
              onPress={() => restore(item.id)}
              accessibilityLabel={`${t('ignored.restore')}: ${item.subject ?? item.store_name}`}
            />
          </Row>
        )}
      />

      <SheetFrame open={detail !== null} onClose={() => setDetail(null)} title={t('ignored.detailsTitle')}>
        <SheetBody>
          {detail && (
            <View style={styles.sheetContent}>
              {(() => {
                const info = reasonInfo(detail.reason);
                return (
                  <View style={styles.reasonCard}>
                    <View style={styles.reasonHeader}>
                      <View style={styles.reasonIconPill}>
                        <AppIcon name={info.icon} size={18} color={colors.tint} />
                      </View>
                      <View style={styles.reasonHeaderText}>
                        <Text style={styles.reasonLabel}>{t('ignored.reasonTitle')}</Text>
                        <Text style={styles.reasonTitle}>{info.title}</Text>
                      </View>
                    </View>
                    <Text style={styles.reasonDesc}>{info.desc}</Text>
                  </View>
                );
              })()}

              <Group inSheet>
                {detail.subject && (
                  <View style={styles.detailField}>
                    <Text style={styles.detailLabel}>{t('ignored.subject')}</Text>
                    <Text selectable style={styles.detailValue}>{detail.subject}</Text>
                  </View>
                )}
                <View style={styles.detailField}>
                  <Text style={styles.detailLabel}>{t('ignored.sender')}</Text>
                  <Text selectable style={styles.detailValue}>{detail.sender ?? detail.store_name}</Text>
                </View>
                {detail.account_email && (
                  <View style={styles.detailField}>
                    <Text style={styles.detailLabel}>{t('ignored.account')}</Text>
                    <Text selectable style={styles.detailValue}>{detail.account_email}</Text>
                  </View>
                )}
                <View style={styles.detailField}>
                  <Text style={styles.detailLabel}>{t('ignored.date')}</Text>
                  <Text style={[styles.detailValue, styles.tabular]}>{formatDate(detail.purchase_date, i18n.language)}</Text>
                </View>
                {detail.order_number && (
                  <View style={styles.detailField}>
                    <Text style={styles.detailLabel}>{t('ignored.orderNumber')}</Text>
                    <Text selectable style={[styles.detailValue, styles.tabular]}>{detail.order_number}</Text>
                  </View>
                )}
                {detail.product_name && (
                  <View style={[styles.detailField, styles.lastField]}>
                    <Text style={styles.detailLabel}>{t('ignored.product')}</Text>
                    <Text selectable style={styles.detailValue}>{detail.product_name}</Text>
                  </View>
                )}
              </Group>

              {detail.attachments.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>{t('ignored.attachments')}</Text>
                  <Group inSheet>
                    {detail.attachments.map((att, i) => (
                      <Row
                        key={att.id}
                        separator={i > 0}
                        onPress={() => router.push({ pathname: '/document', params: { path: att.local_path, title: att.filename } })}
                        chevron
                        accessibilityLabel={`${att.filename}, ${t('ignored.viewDocument')}`}
                      >
                        <DocThumb localPath={att.local_path} size={32} />
                        <View style={styles.attText}>
                          <Text style={styles.attName} numberOfLines={1}>{att.filename}</Text>
                          <Text style={styles.attAction}>{t('ignored.viewDocument')}</Text>
                        </View>
                      </Row>
                    ))}
                  </Group>
                </>
              )}

              <View style={styles.sheetActions}>
                <Button
                  kind="prominent"
                  title={t('ignored.restore')}
                  onPress={() => void restore(detail.id)}
                  accessibilityLabel={`${t('ignored.restore')}: ${detail.subject ?? detail.store_name}`}
                />
              </View>
            </View>
          )}
        </SheetBody>
      </SheetFrame>
    </>
  );
}

const useStyles = themed(() => StyleSheet.create({
  gap: { height: 20 },
  card: { backgroundColor: colors.card, paddingVertical: 8 },
  first: { borderTopLeftRadius: RADIUS, borderTopRightRadius: RADIUS },
  last: { borderBottomLeftRadius: RADIUS, borderBottomRightRadius: RADIUS },
  text: { flex: 1, paddingRight: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { ...TYPE.body, color: colors.ink, flexShrink: 1 },
  infoIcon: { opacity: 0.8 },
  meta: { ...TYPE.foot, color: colors.ink2, marginTop: 2 },
  sheetContent: { gap: 16, paddingBottom: 16 },
  reasonCard: {
    backgroundColor: colors.card,
    borderRadius: RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: 16,
    gap: 8,
  },
  reasonHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reasonIconPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.tintSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonHeaderText: { flex: 1 },
  reasonLabel: { ...TYPE.foot, color: colors.ink2, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  reasonTitle: { ...TYPE.body, fontWeight: '600', color: colors.ink },
  reasonDesc: { ...TYPE.foot, color: colors.ink2, lineHeight: 18 },
  detailField: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    gap: 2,
  },
  lastField: { borderBottomWidth: 0 },
  detailLabel: { ...TYPE.foot, color: colors.ink2, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { ...TYPE.body, color: colors.ink },
  tabular: { fontVariant: ['tabular-nums'] },
  sectionTitle: { ...TYPE.foot, color: colors.ink2, textTransform: 'uppercase', fontSize: 12, letterSpacing: 0.5, marginTop: 8, marginHorizontal: 4 },
  attText: { flex: 1, marginLeft: 8 },
  attName: { ...TYPE.body, color: colors.ink },
  attAction: { ...TYPE.foot, color: colors.link },
  sheetActions: { marginTop: 12 },
}));
