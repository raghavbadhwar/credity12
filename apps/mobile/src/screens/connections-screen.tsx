import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/tokens';

const DATA_ELEMENTS = [
  'Identity verified status',
  'Reputation score (0-1000)',
  'SafeDate score (0-100)',
  'Work verification status',
  'Platform behavior signals',
];

const DURATION_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
];

export function ConnectionsScreen() {
  const navigation = useNavigation();
  const canGoBack = navigation.canGoBack();
  const [platformName, setPlatformName] = useState('');
  const [platformId, setPlatformId] = useState('');
  const [purpose, setPurpose] = useState('Account verification');
  const [selectedElements, setSelectedElements] = useState<string[]>(['Identity verified status']);
  const [duration, setDuration] = useState(30);
  const [showConsent, setShowConsent] = useState(false);

  const canSubmit = platformName.trim().length > 0 && purpose.trim().length > 0;

  const consentSummary = useMemo(() => {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + duration);
    return {
      expiresAt: expiresAt.toLocaleDateString(),
      elements: selectedElements,
    };
  }, [duration, selectedElements]);

  function toggleElement(element: string) {
    setSelectedElements((prev) =>
      prev.includes(element)
        ? prev.filter((entry) => entry !== element)
        : [...prev, element],
    );
  }

  function onPreviewConsent() {
    if (!canSubmit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowConsent(true);
  }

  function onConfirmConsent() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowConsent(false);
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.kicker}>Connections</Text>
            <Text style={styles.title}>Link trusted platforms</Text>
            <Text style={styles.subtitle}>Control what gets shared and for how long.</Text>
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
          <Text style={styles.cardTitle}>Connected platforms</Text>
          <Text style={styles.meta}>No platforms linked yet.</Text>
          <Text style={styles.meta}>Connect a platform to boost your reputation signals.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Request connection</Text>
          <TextInput
            style={styles.input}
            placeholder="Platform name"
            placeholderTextColor={colors.muted}
            value={platformName}
            onChangeText={setPlatformName}
          />
          <TextInput
            style={styles.input}
            placeholder="Platform ID (optional)"
            placeholderTextColor={colors.muted}
            value={platformId}
            onChangeText={setPlatformId}
          />
          <TextInput
            style={styles.input}
            placeholder="Purpose"
            placeholderTextColor={colors.muted}
            value={purpose}
            onChangeText={setPurpose}
          />

          <Text style={styles.sectionTitle}>Share duration</Text>
          <View style={styles.row}>
            {DURATION_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.chip,
                  duration === option.value && styles.chipActive,
                ]}
                onPress={() => setDuration(option.value)}
              >
                <Text style={duration === option.value ? styles.chipTextActive : styles.chipText}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Data elements</Text>
          {DATA_ELEMENTS.map((element) => (
            <Pressable key={element} style={styles.toggleRow} onPress={() => toggleElement(element)}>
              <View style={[styles.toggleDot, selectedElements.includes(element) && styles.toggleDotActive]} />
              <Text style={styles.toggleText}>{element}</Text>
            </Pressable>
          ))}

          <Pressable
            style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}
            onPress={onPreviewConsent}
            disabled={!canSubmit}
          >
            <Text style={styles.primaryButtonText}>Preview consent</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        transparent
        visible={showConsent}
        animationType="slide"
        onRequestClose={() => {
          Haptics.selectionAsync();
          setShowConsent(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Consent preview</Text>
            <Text style={styles.modalSubtitle}>You are sharing only the selected fields.</Text>

            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>Platform</Text>
              <Text style={styles.modalValue}>{platformName || 'Not set'}</Text>
              {platformId ? <Text style={styles.modalMeta}>ID: {platformId}</Text> : null}
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>Purpose</Text>
              <Text style={styles.modalValue}>{purpose}</Text>
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>Shared data</Text>
              {consentSummary.elements.length === 0 ? (
                <Text style={styles.modalMeta}>No data selected.</Text>
              ) : (
                consentSummary.elements.map((element) => (
                  <Text key={element} style={styles.modalMeta}>• {element}</Text>
                ))
              )}
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>Expiry</Text>
              <Text style={styles.modalValue}>{consentSummary.expiresAt}</Text>
            </View>

            <Text style={styles.modalHint}>
              You can revoke access at any time from the consent settings.
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowConsent(false);
                }}
              >
                <Text style={styles.secondaryButtonText}>Back</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={onConfirmConsent}>
                <Text style={styles.primaryButtonText}>Confirm</Text>
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
    gap: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  cardTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  meta: { color: colors.muted, fontSize: 13 },
  input: {
    backgroundColor: colors.elevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
  },
  sectionTitle: { color: colors.text, fontWeight: '700', marginTop: 8 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: '#DBEAFE',
  },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleDotActive: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  toggleText: { color: colors.text, fontSize: 13 },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: { color: 'white', fontWeight: '800' },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    alignItems: 'center',
    paddingHorizontal: 20,
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
  modalSection: { gap: 4 },
  modalLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  modalValue: { color: colors.text, fontSize: 15, fontWeight: '700' },
  modalMeta: { color: colors.muted, fontSize: 12 },
  modalHint: { color: colors.muted, fontSize: 12 },
  modalActions: { flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
});
