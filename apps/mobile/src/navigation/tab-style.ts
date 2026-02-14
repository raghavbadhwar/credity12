import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { colors } from '../theme/tokens';

export function createBottomTabOptions(accentColor: string): BottomTabNavigationOptions {
  return {
    headerShown: false,
    tabBarHideOnKeyboard: true,
    tabBarStyle: {
      backgroundColor: colors.card,
      borderTopColor: colors.border,
      height: 64,
      paddingTop: 6,
      paddingBottom: 10,
    },
    tabBarActiveTintColor: accentColor,
    tabBarInactiveTintColor: colors.muted,
    tabBarLabelStyle: {
      fontSize: 12,
      fontWeight: '700',
    },
  };
}
