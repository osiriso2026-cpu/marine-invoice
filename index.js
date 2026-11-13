import React from 'react';
import { registerRootComponent } from 'expo';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import App from './App';

function Root() {
  return React.createElement(SafeAreaProvider, { initialMetrics: initialWindowMetrics }, React.createElement(App));
}

registerRootComponent(Root);
