import React from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, DarkTheme, LinkingOptions } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useColors, tokens } from './src/theme';
import type { RootStackParams } from './src/types';
import { StoreProvider } from './src/store';
import InvoicesScreen from './src/screens/InvoicesScreen';
import InvoiceEditorScreen from './src/screens/InvoiceEditorScreen';
import CustomerPortalScreen from './src/screens/CustomerPortalScreen';
import CatalogScreen from './src/screens/CatalogScreen';
import BankingScreen from './src/screens/BankingScreen';
import SettingsScreen from './src/screens/SettingsScreen';

type TabParams = { Invoices: undefined; Catalog: undefined; Banking: undefined; Settings: undefined };

const Tab = createBottomTabNavigator<TabParams>();
const Stack = createNativeStackNavigator<RootStackParams>();

const TAB_ICONS: Record<keyof TabParams, React.ComponentProps<typeof Feather>['name']> = {
  Invoices: 'file-text',
  Catalog: 'package',
  Banking: 'dollar-sign',
  Settings: 'settings',
};

function Tabs(): JSX.Element {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const bottomPad = insets.bottom + tokens.space[2];
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.inkMuted,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.line,
          borderTopWidth: 1,
          paddingTop: tokens.space[2],
          paddingBottom: bottomPad,
          height: tokens.space[2] + tokens.space[7] + bottomPad,
        },
        tabBarLabelStyle: {
          fontSize: tokens.fontSize.xs,
          lineHeight: tokens.lineHeight.xs,
          fontWeight: tokens.fontWeight.medium,
          ...(Platform.OS === 'web' ? { fontFamily: 'System' } : null),
        },
        tabBarIcon: ({ color }) => <Feather name={TAB_ICONS[route.name]} size={22} color={color} />,
        tabBarAccessibilityLabel: `${route.name} tab`,
      })}
    >
      <Tab.Screen name="Invoices" component={InvoicesScreen} />
      <Tab.Screen name="Catalog" component={CatalogScreen} />
      <Tab.Screen name="Banking" component={BankingScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function Root(): JSX.Element {
  const c = useColors();
  // The tabs always mount; each screen shows its own loading skeleton until storage is ready.
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.accent,
        headerTitleStyle: { color: c.ink, fontWeight: tokens.fontWeight.bold },
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="InvoiceEditor"
        component={InvoiceEditorScreen as React.ComponentType<any>}
        options={{ title: 'Invoice', headerBackTitle: 'Invoices' }}
      />
      <Stack.Screen
        name="CustomerPortal"
        component={CustomerPortalScreen as React.ComponentType<any>}
        options={{ headerShown: false, title: 'Invoice & Payment' }}
      />
    </Stack.Navigator>
  );
}

function Themed(): JSX.Element {
  const c = useColors();
  const isDark = c.bg === '#0C171C';
  const base = isDark ? DarkTheme : DefaultTheme;
  if (Platform.OS === 'web') {
    const win = globalThis as {
      location?: { search?: string; pathname?: string; hash?: string };
      history?: { replaceState(data: unknown, unused: string, url?: string | null): void };
    };
    const search = win.location?.search || '';
    const m = /[?&]p=([^&]+)/.exec(search);
    if (m && win.history?.replaceState) {
      try {
        const restored = decodeURIComponent(m[1]);
        win.history.replaceState(null, '', restored + (win.location?.hash || ''));
      } catch {
        /* ignore malformed redirect */
      }
    }
  }
  const webPrefix =
    Platform.OS === 'web' && (globalThis as { location?: { pathname?: string } }).location?.pathname?.startsWith('/marine-invoice')
      ? 'marine-invoice/'
      : '';
  // On the web, /pay/<invoiceId> opens the read-only customer payment page directly.
  const linking: LinkingOptions<RootStackParams> = {
    prefixes: [],
    config: {
      screens: {
        Tabs: webPrefix,
        InvoiceEditor: `${webPrefix}edit/:invoiceId`,
        CustomerPortal: `${webPrefix}pay/:invoiceId`,
      },
    },
  };
  // One text family everywhere: on the web the navigation chrome uses the same system stack as the app's text.
  const fonts =
    Platform.OS === 'web'
      ? {
          regular: { ...base.fonts.regular, fontFamily: 'System' },
          medium: { ...base.fonts.medium, fontFamily: 'System' },
          bold: { ...base.fonts.bold, fontFamily: 'System' },
          heavy: { ...base.fonts.heavy, fontFamily: 'System' },
        }
      : base.fonts;
  const theme = {
    ...base,
    fonts,
    colors: {
      ...base.colors,
      primary: c.accent,
      background: c.bg,
      card: c.surface,
      text: c.ink,
      border: c.line,
      notification: c.accent,
    },
  };
  return (
    <NavigationContainer theme={theme} linking={linking}>
      <StatusBar style="auto" />
      <Root />
    </NavigationContainer>
  );
}

export default function App(): JSX.Element {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Themed />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
