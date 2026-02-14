import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { RecruiterDashboardScreen } from '../screens/recruiter-dashboard-screen';
import { ActivityScreen } from '../screens/activity-screen';
import { SettingsScreen } from '../screens/settings-screen';
import { colors } from '../theme/tokens';
import { createBottomTabOptions } from './tab-style';

interface Props {
  onSwitchRole: () => void;
  onLogout: () => Promise<void>;
}

const Tab = createBottomTabNavigator();

export function RecruiterTabs({ onSwitchRole, onLogout }: Props) {
  return (
    <Tab.Navigator screenOptions={createBottomTabOptions(colors.recruiter)}>
      <Tab.Screen name="Verify" options={{ title: 'Verify' }}>
        {() => <RecruiterDashboardScreen onSwitchRole={onSwitchRole} onLogout={onLogout} />}
      </Tab.Screen>
      <Tab.Screen name="Activity" component={ActivityScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
