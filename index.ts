// App entry: Expo Router as usual, plus the home-screen widget's handler, which Android runs headless
// (react-native-android-widget needs it registered at startup, outside the router).
import 'expo-router/entry';
import { registerWidget } from './src/widget';

registerWidget();
