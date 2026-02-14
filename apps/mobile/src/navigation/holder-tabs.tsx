import React, { useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { HolderDashboardScreen } from '../screens/holder-dashboard-screen';
import { ConnectionsScreen } from '../screens/connections-screen';
import { ActivityScreen } from '../screens/activity-screen';
import { SettingsScreen } from '../screens/settings-screen';
import { colors } from '../theme/tokens';
import { createBottomTabOptions } from './tab-style';

interface Props {
  onSwitchRole: () => void;
  onLogout: () => Promise<void>;
}

const Tab = createBottomTabNavigator();

export function HolderTabs({ onSwitchRole, onLogout }: Props) {
  const [fabOpen, setFabOpen] = useState(false);
  const navigation = useNavigation();

  async function handleFabAction(target: 'Wallet' | 'Connections') {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFabOpen(false);
    (navigation as any).navigate(target);
  }

  async function handleFabOpen() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFabOpen(true);
  }

  async function handleTabPress() {
    await Haptics.selectionAsync();
  }

  return (
    <View style={styles.container}>
      <Tab.Navigator
        screenOptions={createBottomTabOptions(colors.holder)}
        screenListeners={{
          tabPress: () => {
            void handleTabPress();
          },
        }}
      >
        <Tab.Screen name="Wallet" options={{ title: 'Wallet' }}>
          {() => <HolderDashboardScreen onSwitchRole={onSwitchRole} onLogout={onLogout} />}
        </Tab.Screen>
        <Tab.Screen name="Connections" component={ConnectionsScreen} />
        <Tab.Screen name="Activity" component={ActivityScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
      <Pressable style={styles.fab} onPress={handleFabOpen}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <Modal transparent visible={fabOpen} animationType="fade" onRequestClose={() => setFabOpen(false)}>
        <Pressable style={styles.fabBackdrop} onPress={() => setFabOpen(false)}>
          <View style={styles.fabSheet}>
            <Text style={styles.fabTitle}>Quick actions</Text>
            <Pressable style={styles.fabAction} onPress={() => handleFabAction('Wallet')}>
              <Text style={styles.fabActionText}>Share credential</Text>
              <Text style={styles.fabActionHint}>Open Wallet to share</Text>
            </Pressable>
            <Pressable style={styles.fabAction} onPress={() => handleFabAction('Wallet')}>
              <Text style={styles.fabActionText}>Generate ZK proof</Text>
              <Text style={styles.fabActionHint}>Open Wallet to prove</Text>
            </Pressable>
            <Pressable style={styles.fabAction} onPress={() => handleFabAction('Connections')}>
              <Text style={styles.fabActionText}>Connect platform</Text>
              <Text style={styles.fabActionHint}>Open Connections</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 82,
    height: 52,
    width: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  fabText: { color: 'white', fontSize: 28, fontWeight: '800' },
  fabBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'flex-end',
  },
  fabSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 16,
    gap: 12,
  },
  fabTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  fabAction: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    backgroundColor: colors.card,
    gap: 4,
  },
  fabActionText: { color: colors.text, fontWeight: '700' },
  fabActionHint: { color: colors.muted, fontSize: 12 },
});
