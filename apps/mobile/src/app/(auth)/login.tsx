import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AuthField, AuthScreen, PrimaryButton } from '@/components/auth';
import { useAuth } from '@/context/AuthContext';
import { AuthError, messageForError } from '@/services/auth';
import { Colors, Fonts } from '@/theme';
import { type LoginErrors, validateLogin } from '@/lib/auth/validation';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<LoginErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    if (submitting) return; // guard against double taps
    setFormError(null);

    const nextErrors = validateLogin(email, password);
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) return;

    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      // Navigation is handled by the root route guard once status flips to
      // "authenticated"; no manual navigation here.
    } catch (err) {
      // Login uses a single generic message (never reveals whether the email
      // exists). Field-level server errors, if any, are surfaced inline.
      if (err instanceof AuthError && err.fieldErrors) {
        setErrors({ email: err.fieldErrors.email, password: err.fieldErrors.password });
      }
      setFormError(messageForError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthScreen
      title="Welcome back"
      subtitle="Sign in to continue your practice."
      formError={formError}>
      <AuthField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        placeholder="you@example.com"
        editable={!submitting}
        returnKeyType="next"
      />
      <AuthField
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secure
        autoCapitalize="none"
        textContentType="password"
        autoComplete="password"
        placeholder="Your password"
        editable={!submitting}
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />

      <PrimaryButton label="Sign in" onPress={onSubmit} loading={submitting} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>New to Clarke Coach? </Text>
        <Link href="/register" style={styles.link} disabled={submitting}>
          <Text style={styles.linkText}>Create an account</Text>
        </Link>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  footerText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.textMuted },
  link: {},
  linkText: { fontFamily: Fonts.sansSemibold, fontSize: 14, color: Colors.gold },
});
