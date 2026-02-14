import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthScreen } from '../screens/auth-screen';
import { HomeShellScreen } from '../screens/home-shell-screen';
import { RoleSelectScreen } from '../screens/role-select-screen';
import { useSessionStore } from '../store/session-store';
import type { AppRole } from '../types';

const Stack = createNativeStackNavigator();

function RoleFlow() {
  const activeRole = useSessionStore((s) => s.activeRole);
  const sessions = useSessionStore((s) => s.sessions);
  const setActiveRole = useSessionStore((s) => s.setActiveRole);

  if (!activeRole) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="RoleSelect">
          {() => <RoleSelectScreen onSelectRole={(role: AppRole) => setActiveRole(role)} />}
        </Stack.Screen>
      </Stack.Navigator>
    );
  }

  const activeSession = sessions[activeRole];
  if (!activeSession.accessToken) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Auth" component={AuthScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeShellScreen} />
    </Stack.Navigator>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer>
      <RoleFlow />
    </NavigationContainer>
  );
}
