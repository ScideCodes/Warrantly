import { Text, View } from '@/components/themeMotion';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { setUsername } from '@/settings';
import { markWhatsNewSeen } from '@/whatsNew';
import { Button, Group, Input } from '@/components/ui';
import { colors, TYPE, themed } from '@/theme';

const MAX_NAME = 30;

// Onboarding (brainstorm section 13): username, then the app-lock offer (section 19). Gmail is connected from home.
export default function Onboarding() {
  const styles = useStyles();
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [askLock, setAskLock] = useState(false);
  const trimmed = name.trim();

  function submit() {
    if (!trimmed) return;
    markWhatsNewSeen(); // a new user has nothing to compare with
    setAskLock(true);
  }

  function finish(withPin: boolean) {
    setUsername(trimmed); // saved only now: the name ends onboarding, so closing the app before this asks about the lock again
    router.replace('/');
    if (withPin) router.push('/pin'); // PIN setup goes back to home when done
  }

  if (askLock) {
    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.intro}>
            <Text style={styles.title} accessibilityRole="header">
              {t('onboarding.lockTitle')}
            </Text>
            <Text style={styles.subtitle}>{t('onboarding.lockBody')}</Text>
          </View>
          <View style={styles.choices}>
            <Button title={t('onboarding.setUpPin')} onPress={() => finish(true)} />
            <Button kind="glass" title={t('onboarding.later')} onPress={() => finish(false)} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <Text style={styles.title} accessibilityRole="header">
            {t('onboarding.title')}
          </Text>
          <Text style={styles.subtitle}>{t('onboarding.subtitle')}</Text>
        </View>

        <Group style={styles.field}>
          <Text style={styles.label} nativeID="nameLabel">
            {t('onboarding.nameLabel')}
          </Text>
          <Input
            value={name}
            onChangeText={setName}
            onSubmitEditing={submit}
            placeholder={t('onboarding.namePlaceholder')}
            maxLength={MAX_NAME}
            autoCapitalize="words"
            autoComplete="given-name"
            returnKeyType="done"
            accessibilityLabelledBy="nameLabel"
            accessibilityHint={t('onboarding.nameHelper')}
          />
          <Text style={styles.helper}>{t('onboarding.nameHelper')}</Text>
        </Group>

        <Button title={t('onboarding.continue')} onPress={submit} disabled={!trimmed} />
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { maxWidth: 520, width: '100%', alignSelf: 'center', flexGrow: 1, paddingHorizontal: 20, paddingVertical: 24, justifyContent: 'center', gap: 28 },
  intro: { gap: 2, paddingHorizontal: 4 },
  title: { ...TYPE.large, color: colors.ink },
  subtitle: { ...TYPE.sub, color: colors.ink2 },
  field: { paddingVertical: 12, paddingHorizontal: 16, gap: 10 },
  label: { ...TYPE.foot, color: colors.ink2 },
  helper: { ...TYPE.foot, color: colors.ink2 },
  choices: { gap: 12 },
}));
