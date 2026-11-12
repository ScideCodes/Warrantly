import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { setUsername } from '@/settings';
import { markWhatsNewSeen } from '@/whatsNew';
import { colors } from '@/theme';

const MAX_NAME = 30;

// Onboarding (brainstorm section 13): username, then the app-lock offer (section 19). Gmail is connected from home.
export default function Onboarding() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [askLock, setAskLock] = useState(false);
  const trimmed = name.trim();

  function submit() {
    if (!trimmed) return;
    setUsername(trimmed);
    markWhatsNewSeen(); // a new user has nothing to compare with
    setAskLock(true);
  }

  function finish(withPin: boolean) {
    router.replace('/');
    if (withPin) router.push('/pin'); // PIN setup goes back to home when done
  }

  if (askLock) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.body}>
          <View style={styles.intro}>
            <Text style={styles.title} accessibilityRole="header">
              {t('onboarding.lockTitle')}
            </Text>
            <Text style={styles.subtitle}>{t('onboarding.lockBody')}</Text>
          </View>
          <View style={styles.choices}>
            <Pressable style={styles.button} onPress={() => finish(true)} accessibilityRole="button">
              <Text style={styles.buttonText}>{t('onboarding.setUpPin')}</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={() => finish(false)} accessibilityRole="button">
              <Text style={styles.secondaryText}>{t('onboarding.later')}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.intro}>
          <Text style={styles.title} accessibilityRole="header">
            {t('onboarding.title')}
          </Text>
          <Text style={styles.subtitle}>{t('onboarding.subtitle')}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label} nativeID="nameLabel">
            {t('onboarding.nameLabel')}
          </Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            onSubmitEditing={submit}
            placeholder={t('onboarding.namePlaceholder')}
            placeholderTextColor={colors.muted}
            maxLength={MAX_NAME}
            autoCapitalize="words"
            autoComplete="given-name"
            returnKeyType="done"
            accessibilityLabelledBy="nameLabel"
            accessibilityHint={t('onboarding.nameHelper')}
          />
          <Text style={styles.helper}>{t('onboarding.nameHelper')}</Text>
        </View>

        <Pressable
          style={[styles.button, !trimmed && styles.buttonDisabled]}
          onPress={submit}
          disabled={!trimmed}
          accessibilityRole="button"
          accessibilityState={{ disabled: !trimmed }}
        >
          <Text style={styles.buttonText}>{t('onboarding.continue')}</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, padding: 24, justifyContent: 'center', gap: 32 },
  intro: { gap: 8 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 16, lineHeight: 24, color: colors.muted },
  field: { gap: 8 },
  label: { fontSize: 16, fontWeight: '600', color: colors.text },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colors.text,
  },
  helper: { fontSize: 14, color: colors.muted },
  button: { minHeight: 48, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { backgroundColor: colors.primaryDisabled },
  choices: { gap: 12 },
  secondary: { minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 16, fontWeight: '600', color: colors.text },
  buttonText: { fontSize: 16, fontWeight: '600', color: colors.onPrimary },
});
