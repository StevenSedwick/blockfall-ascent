import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.blockfall.ascent',
  appName: 'Blockfall Ascent',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    // Fullscreen game: hide the status bar and let the web view use every px.
    backgroundColor: '#000000'
  },
  ios: {
    backgroundColor: '#000000',
    contentInset: 'never'
  }
};

export default config;
