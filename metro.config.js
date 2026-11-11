// Web preview only: expo-sqlite's web build loads a .wasm file (Android/iOS ignore this).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm');

module.exports = config;
