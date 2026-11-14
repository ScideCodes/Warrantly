import { Text, View } from '@/components/themeMotion';
import { Button, GlassButton, Input } from '@/components/ui';
import { colors, TYPE, useRoom } from '@/theme';
import { MAX_SERIALS, type SerialEntry } from '@/serialNumbers';
import { useTranslation } from 'react-i18next';

export default function SerialNumbersEditor({ entries, onChange, onScan, disabled, showErrors }: {
  entries: SerialEntry[]; onChange: (entries: SerialEntry[]) => void; onScan: (index: number) => void; disabled: boolean; showErrors: boolean;
}) {
  const { t } = useTranslation();
  const room = useRoom();
  const inline = room(330);
  const change = (index: number, key: keyof SerialEntry, value: string) => onChange(entries.map((entry, i) => i === index ? { ...entry, [key]: value } : entry));
  return <View style={{ gap: 12 }}>
    <View style={{ gap: 4 }}>
      <Text style={{ ...TYPE.body, color: colors.ink }}>{t('serials.title')}</Text>
      <Text style={{ ...TYPE.foot, color: colors.ink2 }}>{t('serials.hint')}</Text>
    </View>
    {entries.map((entry, index) => <View key={index} style={{ gap: 8, paddingTop: index ? 12 : 0, borderTopWidth: index ? 0.5 : 0, borderTopColor: colors.fill }}>
      <Input value={entry.label} onChangeText={value => change(index, 'label', value)} placeholder={t('serials.placeholder')} accessibilityLabel={`${t('serials.number', { n: index + 1 })}, ${t('serials.label')}`} editable={!disabled} maxLength={60} />
      <View style={{ flexDirection: inline ? 'row' : 'column', gap: 8, alignItems: inline ? 'center' : 'stretch' }}>
        <Input style={inline ? { flex: 1, minWidth: 0 } : undefined} value={entry.value} onChangeText={value => change(index, 'value', value)} placeholder={t('serials.number', { n: index + 1 })} accessibilityLabel={t('serials.number', { n: index + 1 })} editable={!disabled} maxLength={120} autoCorrect={false} autoCapitalize="characters" />
        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
          <GlassButton icon="barcode-outline" label={t('serials.scan', { n: index + 1 })} onPress={() => onScan(index)} disabled={disabled} />
          <GlassButton icon="trash-outline" label={t('serials.remove', { n: index + 1 })} onPress={() => onChange(entries.length > 1 ? entries.filter((_, i) => i !== index) : [{ label: '', value: '' }])} disabled={disabled || (entries.length === 1 && !entry.label && !entry.value)} />
        </View>
      </View>
      {showErrors && !!entry.label.trim() && !entry.value.trim() && <Text style={{ ...TYPE.foot, color: colors.bad }} accessibilityRole="alert">{t('serials.required')}</Text>}
    </View>)}
    <Button kind="glass" icon="add" title={t('serials.add')} onPress={() => onChange([...entries, { label: '', value: '' }])} disabled={disabled || entries.length >= MAX_SERIALS} />
  </View>;
}
