import { useCallback, useState } from 'react';
import { Stack, useFocusEffect } from 'expo-router';
import { FlatList, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { WarrantyRow } from '@/components/WarrantyRow';
import { getDb } from '@/db/client';
import { listWarranties, type Warranty } from '@/db/repo.ts';
import { colors } from '@/theme';

// "Needs your attention" list (section 9). Resolving items comes in build step 5.
export default function Attention() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Warranty[]>([]);
  useFocusEffect(
    useCallback(() => {
      void getDb()
        .then((db) => listWarranties(db, 'needs_input'))
        .then((rows) => setItems(rows.sort((a, b) => b.purchase_date.localeCompare(a.purchase_date))));
    }, []),
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('attention.title') }} />
      <FlatList
        style={styles.screen}
        contentContainerStyle={styles.list}
        data={items}
        keyExtractor={(w) => String(w.id)}
        renderItem={({ item }) => <WarrantyRow warranty={item} />}
        ListEmptyComponent={<Text style={styles.empty}>{t('attention.empty')}</Text>}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: 24, paddingBottom: 24 },
  empty: { fontSize: 16, color: colors.muted, textAlign: 'center', marginTop: 48 },
});
