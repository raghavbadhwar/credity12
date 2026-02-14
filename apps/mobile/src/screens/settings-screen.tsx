import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/tokens';

export function SettingsScreen() {
  const navigation = useNavigation();
  const canGoBack = navigation.canGoBack();
  const [biometricEnabled, setBiometricEnabled] = useState(true);
  const [sharePrompts, setSharePrompts] = useState(true);
  const [showExport, setShowExport] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.kicker}>Settings</Text>
            <Text style={styles.title}>Privacy & control</Text>
            <Text style={styles.subtitle}>Manage consent, exports, and security preferences.</Text>
          </View>
          {canGoBack ? (
            <Pressable
              style={styles.backButton}
              onPress={() => {
                Haptics.selectionAsync();
                (navigation as any).goBack();
              }}
            >
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Consent & sharing</Text>
          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingTitle}>Prompt before sharing</Text>
              <Text style={styles.settingSubtitle}>Always show consent preview before sharing data.</Text>
            </View>
            <Switch
              value={sharePrompts}
              onValueChange={setSharePrompts}
              trackColor={{ false: '#E5E7EB', true: '#BFDBFE' }}
              thumbColor={sharePrompts ? colors.primary : '#94A3B8'}
            />
          </View>
          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingTitle}>Biometric confirmations</Text>
              <Text style={styles.settingSubtitle}>Require biometrics for sharing or revoking access.</Text>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={setBiometricEnabled}
              trackColor={{ false: '#E5E7EB', true: '#BBF7D0' }}
              thumbColor={biometricEnabled ? colors.success : '#94A3B8'}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Data rights</Text>
          <Text style={styles.meta}>Export or remove your data at any time.</Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowExport(true);
            }}
          >
            <Text style={styles.primaryButtonText}>Request data export</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowDelete(true);
            }}
          >
            <Text style={styles.secondaryButtonText}>Request account deletion</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Audit retention</Text>
          <Text style={styles.meta}>Audit logs are retained for 180 days for compliance.</Text>
          <Text style={styles.meta}>You can revoke consent grants instantly in the activity log.</Text>
        </View>
      </ScrollView>

      <Modal
        transparent
        visible={showExport}
        animationType="slide"
        onRequestClose={() => {
          Haptics.selectionAsync();
          setShowExport(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Export your data</Text>
            <Text style={styles.modalSubtitle}>
              We will prepare your data package and notify you within 72 hours.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowExport(false);
                }}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.primaryButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowExport(false);
                }}
              >
                <Text style={styles.primaryButtonText}>Confirm export</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={showDelete}
        animationType="slide"
        onRequestClose={() => {
          Haptics.selectionAsync();
          setShowDelete(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Request deletion</Text>
            <Text style={styles.modalSubtitle}>
              Deletion revokes all active share grants. Audit logs are retained for compliance.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowDelete(false);
                }}
              >
                <Text style={styles.secondaryButtonText}>Keep account</Text>
              </Pressable>
              <Pressable
                style={styles.primaryButton}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  setShowDelete(false);
                }}
              >
                <Text style={styles.primaryButtonText}>Request deletion</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  kicker: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: { color: colors.text, fontSize: 26, fontWeight: '800' },
  subtitle: { color: colors.muted, marginTop: 4, maxWidth: 220 },
  backButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  backText: { color: colors.primary, fontWeight: '700' },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  cardTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  meta: { color: colors.muted, fontSize: 13 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  settingTitle: { color: colors.text, fontWeight: '700', fontSize: 14 },
  settingSubtitle: { color: colors.muted, fontSize: 12, marginTop: 2, maxWidth: 220 },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonText: { color: 'white', fontWeight: '800' },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  secondaryButtonText: { color: colors.primary, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 12,
  },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  modalSubtitle: { color: colors.muted, fontSize: 13 },
  modalActions: { flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
});
