import { memo, useEffect, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import { View } from '@/components/themeMotion';
import AppIcon from '@/components/Icon';
import { documentThumbnail } from '@/documents';
import { colors, themed } from '@/theme';

// First-page preview (shortlist 14). Made once per file and size by the native side and cached there; here
// a module cache avoids asking again while the list scrolls. A missing or broken file shows a plain icon.
const cache = new Map<string, string>();

export const DocThumb = memo(function DocThumb({ localPath, size = 40 }: { localPath: string; size?: number }) {
  const styles = useStyles();
  const key = `${localPath}:${size}`;
  const [uri, setUri] = useState<string | null | undefined>(() => cache.get(key));
  useEffect(() => {
    if (cache.has(key)) return setUri(cache.get(key));
    let live = true;
    // Rendered at 2x for sharpness; the PNG is small (a 80px wide page).
    void documentThumbnail(localPath, size * 2).then((u) => {
      if (u) cache.set(key, u); // a missing file may come back (restore), so null is asked again next time
      if (live) setUri(u);
    });
    return () => { live = false; };
  }, [key, localPath, size]);
  const box = { width: size, height: Math.round(size * 1.3) };
  if (uri) return <Image source={{ uri }} style={[styles.page, box]} resizeMode="cover" accessibilityIgnoresInvertColors />;
  return (
    <View style={[styles.page, styles.empty, box]} importantForAccessibility="no-hide-descendants">
      <AppIcon name={uri === null ? 'alert-circle-outline' : 'document-text-outline'} size={size * 0.45} color={uri === null ? colors.ink3 : colors.tint} />
    </View>
  );
});

export const forgetThumb = (localPath: string): void => {
  for (const k of [...cache.keys()]) if (k.startsWith(`${localPath}:`)) cache.delete(k);
};

const useStyles = themed(() => StyleSheet.create({
  page: { borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, backgroundColor: '#fff' },
  empty: { backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
}));
