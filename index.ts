// App entry: Expo Router as usual, plus the home-screen widget's handler, which Android runs headless
// (react-native-android-widget needs it registered at startup, outside the router).
import { installErrorLog } from './src/errorLog';
import 'expo-router/entry';
import { registerWidget } from './src/widget';

installErrorLog();
registerWidget();
