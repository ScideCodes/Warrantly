import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, Pressable } from '@/components/themeMotion';
import { Button, Input } from '@/components/ui';
import AppIcon from '@/components/Icon';
import { ACCENTS, contrast, validAccent } from '@/accent';
import { applyTheme, colors, TYPE, useTheme } from '@/theme';
import { getAccentSetting, setAccentSetting } from '@/settings';

export default function AccentPicker({ onChange }: { onChange: () => void }) {
  useTheme();
  const { t } = useTranslation();
  const [value, setValue] = useState(getAccentSetting);
  const [custom, setCustom] = useState(value.startsWith('#'));
  const [draft, setDraft] = useState(value.startsWith('#') ? value : '#8652CE');
  const choose = (next: string) => { setAccentSetting(next); setValue(next); applyTheme(); onChange(); };
  const valid = /^#[0-9a-f]{6}$/i.test(draft) && validAccent(draft);
  return <View style={{ padding: 16, gap: 12 }}>
    <Text style={{ ...TYPE.body, color: colors.ink }}>{t('accent.title')}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }} accessibilityRole="radiogroup">
      {Object.entries(ACCENTS).map(([key, color]) => <Pressable key={key} onPress={() => { choose(key); setCustom(false); }} accessibilityRole="radio" accessibilityLabel={t(`accent.${key}`)} accessibilityState={{ selected: value === key }}
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: value === key ? colors.ink : colors.line }}>
        {value === key && <AppIcon name="checkmark" size={22} color={contrast(color, '#ffffff') >= 4.5 ? '#ffffff' : '#000000'} />}
      </Pressable>)}
    </View>
    <Button kind="glass" title={t('accent.custom')} onPress={() => { if (!custom) setDraft(ACCENTS[value as keyof typeof ACCENTS] ?? value); setCustom(v => !v); }} />
    {custom && <>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: valid ? draft : colors.fill, borderWidth: 1, borderColor: colors.line }} />
      <Input style={{ flex: 1 }} value={draft} onChangeText={text => setDraft(text.startsWith('#') ? text : '#' + text)} maxLength={7} autoCapitalize="characters" autoCorrect={false} accessibilityLabel={t('accent.hex')} placeholder="#8652CE" />
      </View>
      {!valid && <Text style={{ ...TYPE.foot, color: colors.ink2 }}>{t('accent.hex')}</Text>}
      <Button title={t('accent.apply')} disabled={!valid} onPress={() => choose(draft.toUpperCase())} />
    </>}
  </View>;
}
