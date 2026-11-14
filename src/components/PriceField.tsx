import { useMemo, useState } from 'react';
import { FlatList, Keyboard, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from '@/components/themeMotion';
import { Input, inputStyle, Row } from '@/components/ui';
import { SheetFrame } from '@/components/Sheet';
import AppIcon from '@/components/Icon';
import { colors, TYPE, themed, useRoom } from '@/theme';
import { currencyChoices, currencyFirst, currencyName, editingPrice, priceDisplay, priceInput, priceNumber } from '@/money';

export default function PriceField({ amount, currency, onAmount, onCurrency, disabled }: {
  amount: string; currency: string; onAmount: (amount: string) => void; onCurrency: (currency: string) => void; disabled: boolean;
}) {
  const { t, i18n } = useTranslation();
  const styles = useStyles();
  const room = useRoom();
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const choices = useMemo(() => currencyChoices(i18n.language, currency), [i18n.language, currency]);
  const search = query.trim().toLocaleLowerCase(i18n.language).normalize('NFD').replace(/\p{M}/gu, '');
  const shown = choices.filter(item => `${item.name} ${item.code}`.toLocaleLowerCase(i18n.language).normalize('NFD').replace(/\p{M}/gu, '').includes(search));
  const first = currencyFirst(i18n.language);
  const finish = () => {
    setFocused(false);
    const value = priceNumber(amount, currency);
    onAmount(value === null ? '' : String(value));
  };
  const unit = <Text style={styles.unit} importantForAccessibility="no">{currency}</Text>;
  return <>
    <View style={[styles.pair, !room(270) && styles.stacked]}>
      <View style={styles.amount}>
        <Text style={styles.label}>{t('form.price')}</Text>
        <View style={[inputStyle(), styles.amountControl, focused && styles.focus]}>
          {first && unit}
          <Input testID="price" style={styles.number} editable={!disabled} value={focused ? editingPrice(amount, i18n.language) : priceDisplay(amount, currency, i18n.language)}
            placeholder={priceDisplay('0', currency, i18n.language)} keyboardType="decimal-pad" inputMode="decimal" autoCorrect={false} autoComplete="off" maxLength={24}
            accessibilityLabel={`${t('form.price')}, ${currency}`} onFocus={() => setFocused(true)} onBlur={finish}
            onChangeText={text => { const value = priceInput(text, currency, i18n.language); if (value !== null) onAmount(value); }} />
          {!first && unit}
        </View>
      </View>
      <View style={!room(270) ? styles.fullCurrency : styles.currency}>
        <Text style={styles.label}>{t('form.currency')}</Text>
        <Pressable testID="currency" accessibilityRole="button" accessibilityLabel={`${t('form.currency')}: ${currencyName(currency, i18n.language)} (${currency})`} accessibilityState={{ expanded: open, disabled }} disabled={disabled}
          style={[inputStyle(), styles.currencyControl]} onPress={() => { Keyboard.dismiss(); setQuery(''); setOpen(true); }}>
          <Text style={styles.code}>{currency}</Text><AppIcon name="chevron-down" size={16} color={colors.ink2} />
        </Pressable>
      </View>
    </View>
    <SheetFrame open={open} onClose={() => setOpen(false)} title={t('form.currency')}>
      <View style={styles.picker}>
        <Input inSheet testID="currency-search" value={query} onChangeText={setQuery} placeholder={t('money.search')} accessibilityLabel={t('money.search')} autoCorrect={false} autoCapitalize="none" clearButtonMode="while-editing" />
        <FlatList style={styles.list} data={shown} extraData={currency} keyExtractor={item => item.code} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" initialNumToRender={12}
          ListEmptyComponent={<Text style={styles.empty}>{t('money.none')}</Text>}
          renderItem={({ item, index }) => <Row separator={index > 0} selected={item.code === currency} accessibilityRole="radio" accessibilityState={{ selected: item.code === currency }} accessibilityLabel={`${item.name}, ${item.code}`} onPress={() => {
            const value = priceNumber(amount, item.code);
            onAmount(value === null ? '' : String(value)); onCurrency(item.code); Keyboard.dismiss(); setOpen(false);
          }}>
            <Text style={styles.name}>{item.name}</Text><Text style={styles.listCode}>{item.code}</Text>
            <View style={styles.check}>{item.code === currency && <AppIcon name="checkmark" size={18} color={colors.tintInk} />}</View>
          </Row>} />
      </View>
    </SheetFrame>
  </>;
}
const useStyles = themed(() => StyleSheet.create({
  pair: { flexDirection: 'row', gap: 12, paddingTop: 8 },
  stacked: { flexDirection: 'column' },
  amount: { flex: 1, minWidth: 0, gap: 6 },
  label: { ...TYPE.foot, color: colors.ink2 },
  amountControl: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 0 },
  focus: { outlineWidth: 2, outlineColor: colors.tint, outlineStyle: 'solid' },
  unit: { ...TYPE.sub, fontVariant: ['tabular-nums'], color: colors.ink2 },
  number: { flex: 1, minWidth: 0, paddingHorizontal: 0, backgroundColor: 'transparent', outlineWidth: 0, fontVariant: ['tabular-nums'] },
  currency: { width: 104, gap: 6 },
  fullCurrency: { gap: 6 },
  currencyControl: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  code: { ...TYPE.body, fontVariant: ['tabular-nums'], color: colors.ink },
  picker: { paddingHorizontal: 16, paddingBottom: 16, gap: 12, flexShrink: 1, minHeight: 0 },
  list: { flexGrow: 0, flexShrink: 1, minHeight: 0, backgroundColor: colors.sheetGroup, borderRadius: 26 },
  name: { ...TYPE.body, color: colors.ink, flex: 1, minWidth: 0 },
  listCode: { ...TYPE.sub, fontVariant: ['tabular-nums'], color: colors.ink2 },
  check: { width: 18, alignItems: 'center' },
  empty: { ...TYPE.body, color: colors.ink2, padding: 16 },
}));
