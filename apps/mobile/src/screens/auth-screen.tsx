import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { loginRole, registerRole, restoreRoleSession } from '../lib/api-client';
import { useSessionStore } from '../store/session-store';
import { colors } from '../theme/tokens';
import type { AppRole } from '../types';

const roleText: Record<AppRole, string> = {
  holder: 'Holder Wallet',
  issuer: 'Issuer Console',
  recruiter: 'Recruiter Verify',
};

export function AuthScreen() {
  const role = useSessionStore((s) => s.activeRole);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);

  const title = useMemo(() => {
    if (!role) return 'Authenticate';
    return `${mode === 'login' ? 'Sign in to' : 'Create'} ${roleText[role]}`;
  }, [mode, role]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap(): Promise<void> {
      if (!role) {
        setBootstrapping(false);
        return;
      }

      setBootstrapping(true);
      try {
        await restoreRoleSession(role);
      } finally {
        if (!cancelled) {
          setBootstrapping(false);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [role]);

  async function onSubmit() {
    if (!role) return;
    if (!username || !password) {
      Alert.alert('Missing fields', 'Username and password are required.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await loginRole(role, username.trim(), password);
      } else {
        await registerRole(role, {
          username: username.trim(),
          password,
          email: email.trim() || undefined,
          name: name.trim() || undefined,
        });
      }
    } catch (error: any) {
      Alert.alert('Authentication failed', error?.message || 'Unable to authenticate.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.kicker}>Secure access</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>Sessions are isolated by role. Switch anytime.</Text>

      {bootstrapping ? (
        <View style={styles.bootstrapRow}>
          <ActivityIndicator color={colors.issuer} />
          <Text style={styles.bootstrapText}>Checking saved session...</Text>
        </View>
      ) : null}

      <View style={styles.formCard}>
        {mode === 'register' && (
          <TextInput
            placeholder="Display name"
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
            style={styles.input}
          />
        )}

        {mode === 'register' && (
          <TextInput
            placeholder="Email"
            placeholderTextColor={colors.muted}
            value={email}
            keyboardType="email-address"
            autoCapitalize="none"
            onChangeText={setEmail}
            style={styles.input}
          />
        )}

        <TextInput
          placeholder="Username"
          placeholderTextColor={colors.muted}
          value={username}
          autoCapitalize="none"
          onChangeText={setUsername}
          style={styles.input}
        />
        <TextInput
          placeholder="Password"
          placeholderTextColor={colors.muted}
          value={password}
          secureTextEntry
          onChangeText={setPassword}
          style={styles.input}
        />

        <Pressable onPress={onSubmit} style={styles.primaryButton} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>{mode === 'login' ? 'Sign In' : 'Create Account'}</Text>
          )}
        </Pressable>

        <Pressable onPress={() => setMode((m) => (m === 'login' ? 'register' : 'login'))}>
          <Text style={styles.linkText}>
            {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    paddingTop: 72,
    gap: 10,
  },
  kicker: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    marginBottom: 12,
  },
  formCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  bootstrapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  bootstrapText: {
    color: colors.muted,
    fontSize: 13,
  },
  input: {
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryText: {
    color: '#fff',
    fontWeight: '700',
  },
  linkText: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: 8,
  },
});
