import { useCallback, useState } from 'react';
import { Stack, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/components/WarrantyRow';
import { getDb } from '@/db/client';
import { listIgnored, restoreIgnored, type IgnoredRow } from '@/db/repo.ts';
import { colors, BUTTON_HEIGHT, BUTTON_RADIUS } from '@/theme';

// Ignored mails (section 8): hidden from the lists, but reviewable and restorable.
export default function Ignored() {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<IgnoredRow[]>([]);
  const reload = useCallback(() => {
    void getDb().then(listIgnored).then(setRows);
  }, []);
  useFocusEffect(reload);

  async function restore(id: number) {
    await restoreIgnored(await getDb(), id); // goes to "Needs your attention" to be completed
    reload();
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('ignored.title') }} />
      <FlatList
        style={styles.screen}
        contentContainerStyle={styles.list}
        data={rows}
        keyExtractor={(r) => String(r.id)}
        ListHeaderComponent={<Text style={styles.hint}>{t('ignored.hint')}</Text>}
        ListEmptyComponent={<Text style={styles.empty}>{t('ignored.empty')}</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.text}>
              <Text style={styles.title} numberOfLines={2}>
                {item.subject ?? item.product_name ?? item.store_name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {item.sender ?? item.store_name} · {formatDate(item.purchase_date, i18n.language)}
              </Text>
            </View>
            <Pressable style={styles.button} onPress={() => restore(item.id)} accessibilityRole="button" accessibilityLabel={`${t('ignored.restore')}: ${item.subject ?? item.store_name}`}>
              <Text style={styles.buttonText}>{t('ignored.restore')}</Text>
            </Pressable>
          </View>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: 24, paddingBottom: 24 },
  hint: { fontSize: 14, color: colors.muted, paddingVertical: 16 },
  empty: { fontSize: 16, color: colors.muted, textAlign: 'center', marginTop: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { fontSize: 14, color: colors.muted },
  button: { minHeight: BUTTON_HEIGHT, paddingHorizontal: 14, borderRadius: BUTTON_RADIUS, borderWidth: 1, borderColor: colors.primary, justifyContent: 'center' },
  buttonText: { fontSize: 14, fontWeight: '600', color: colors.primary },
});
