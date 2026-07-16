import { Link } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { AuthField, AuthScreen, GoogleSignInButton, OrDivider, PrimaryButton } from '@/components/auth';
import { useAuth } from '@/context/AuthContext';
import { AuthError, messageForError } from '@/services/auth';
import { Colors, Fonts } from '@/theme';
import { type RegisterErrors, validateRegister } from '@/lib/auth/validation';

export default function RegisterScreen() {
  const { signUp, signInWithGoogle } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  async function onGooglePress() {
    if (submitting || googleSubmitting) return; // one auth attempt at a time
    setFormError(null);
    setGoogleSubmitting(true);
    try {
      // Signs up or signs in as appropriate; resolves silently on dismissal.
      await signInWithGoogle();
    } catch (err) {
      setFormError(messageForError(err));
    } finally {
      setGoogleSubmitting(false);
    }
  }

  async function onSubmit() {
    if (submitting || googleSubmitting) return; // guard against double taps
    setFormError(null);

    const nextErrors = validateRegister({ displayName, email, password, confirmPassword });
    setErrors(nextErrors);
    if (nextErrors.displayName || nextErrors.email || nextErrors.password || nextErrors.confirmPassword) {
      return;
    }

    setSubmitting(true);
    try {
      // Only the backend's success response confirms the account was created;
      // signUp resolves only on a 2xx from /auth/register/.
      await signUp({ email: email.trim(), password, displayName: displayName.trim() });
    } catch (err) {
      if (err instanceof AuthError && err.fieldErrors) {
        // Map backend field errors (e.g. duplicate email, weak password) inline.
        setErrors({
          displayName: err.fieldErrors.display_name,
          email: err.fieldErrors.email,
          password: err.fieldErrors.password,
        });
        // Only show the banner when the failure isn't already attached to a field.
        if (!err.fieldErrors.display_name && !err.fieldErrors.email && !err.fieldErrors.password) {
          setFormError(messageForError(err));
        }
      } else {
        setFormError(messageForError(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthScreen
      title="Create account"
      subtitle="Start building your daily practice habit."
      formError={formError}>
      {Platform.OS === 'web' ? null : (
        <>
          <GoogleSignInButton
            onPress={onGooglePress}
            loading={googleSubmitting}
            disabled={submitting}
          />
          <OrDivider />
        </>
      )}
      <AuthField
        label="Display name"
        value={displayName}
        onChangeText={setDisplayName}
        error={errors.displayName}
        autoCapitalize="words"
        textContentType="name"
        placeholder="e.g. Marcus Bell"
        editable={!submitting}
      />
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
      />
      <AuthField
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secure
        autoCapitalize="none"
        textContentType="newPassword"
        placeholder="At least 8 characters"
        editable={!submitting}
      />
      <AuthField
        label="Confirm password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        error={errors.confirmPassword}
        secure
        autoCapitalize="none"
        textContentType="newPassword"
        placeholder="Re-enter your password"
        editable={!submitting}
        onSubmitEditing={onSubmit}
        returnKeyType="go"
      />

      <PrimaryButton
        label="Create account"
        onPress={onSubmit}
        loading={submitting}
        disabled={googleSubmitting}
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <Link href="/login" style={styles.link} disabled={submitting}>
          <Text style={styles.linkText}>Sign in</Text>
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
