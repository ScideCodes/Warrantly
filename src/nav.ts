import { router } from 'expo-router';

// A screen opened by a link (widget tap) has nothing under it; "back" then means the home screen.
export const goBack = (): void => (router.canGoBack() ? router.back() : router.replace('/'));
