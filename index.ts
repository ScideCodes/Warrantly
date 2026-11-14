// App entry: Expo Router as usual, plus the home-screen widget's handler, which Android runs headless
// (react-native-android-widget needs it registered at startup, outside the router).
import { installErrorLog } from './src/errorLog';
import 'expo-router/entry';
import { registerWidgetConfigurationScreen } from 'react-native-android-widget';
import { registerWidget } from './src/widget';
import { WidgetConfigScreen } from './src/widgetConfigScreen';

installErrorLog();
registerWidget();
registerWidgetConfigurationScreen(WidgetConfigScreen);
