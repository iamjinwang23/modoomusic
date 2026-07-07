import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { supabase } from '@/lib/supabase'
import { signInWithProvider, type SocialProvider } from '@/lib/social-auth'
import { Button } from '@/components/ui/button'
import { mono } from '@/theme/mono'

// 미로그인 오버레이 — 소셜 로그인(주) + 이메일(보조) + 게스트. MONO 토큰 기반.
export function LoginScreen({ onGuest }: { onGuest?: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState<null | 'email' | SocialProvider>(null)
  const [error, setError] = useState<string | null>(null)

  async function emailLogin() {
    setLoading('email'); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(null)
    if (error) setError(error.message)
  }

  async function social(provider: SocialProvider) {
    setLoading(provider); setError(null)
    const { error } = await signInWithProvider(provider)
    setLoading(null)
    if (error && error !== 'cancelled') setError(error)
  }

  const canEmail = email.trim().length > 0 && password.length > 0 && !loading

  return (
    <ScrollView style={styles.overlay} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>MONO</Text>
      <Text style={styles.subtitle}>로그인하고 시작하세요</Text>

      <SocialButton label="Google로 계속하기" bg="#fff" fg="#111" loading={loading === 'google'} onPress={() => social('google')} />
      <SocialButton label="카카오로 계속하기" bg={mono.color.kakao} fg={mono.color.kakaoText} loading={loading === 'kakao'} onPress={() => social('kakao')} />
      <SocialButton label="Apple로 계속하기" bg="#000" fg="#fff" border loading={loading === 'apple'} onPress={() => social('apple')} />

      <View style={styles.divider}><Text style={styles.dividerText}>또는 이메일</Text></View>

      <TextInput style={styles.input} placeholder="이메일" placeholderTextColor={mono.color.textTertiary}
        autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="비밀번호" placeholderTextColor={mono.color.textTertiary}
        secureTextEntry value={password} onChangeText={setPassword} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button label="이메일 로그인" variant="secondary" loading={loading === 'email'} disabled={!canEmail} onPress={emailLogin} style={{ marginTop: 4 }} />

      {onGuest ? (
        <Pressable style={styles.guest} onPress={onGuest}>
          <Text style={styles.guestText}>게스트로 둘러보기</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  )
}

function SocialButton({ label, bg, fg, border, loading, onPress }: {
  label: string; bg: string; fg: string; border?: boolean; loading: boolean; onPress: () => void
}) {
  return (
    <Pressable style={[styles.social, { backgroundColor: bg }, border && styles.socialBorder]} onPress={loading ? undefined : onPress}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.socialText, { color: fg }]}>{label}</Text>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: mono.color.bg },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: mono.space(7), paddingVertical: mono.space(12) },
  title: { color: mono.color.text, fontSize: mono.font.title, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: mono.color.textSecondary, fontSize: mono.font.body, textAlign: 'center', marginTop: 6, marginBottom: mono.space(6) },
  social: { borderRadius: mono.radius.md, paddingVertical: 15, alignItems: 'center', marginBottom: 10 },
  socialBorder: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  socialText: { fontSize: mono.font.body, fontWeight: '700' },
  divider: { alignItems: 'center', marginVertical: mono.space(4) },
  dividerText: { color: mono.color.textTertiary, fontSize: mono.font.tiny },
  input: {
    backgroundColor: mono.color.fill, borderWidth: 1, borderColor: mono.color.border,
    borderRadius: mono.radius.md, paddingHorizontal: 16, paddingVertical: 14,
    color: mono.color.text, fontSize: mono.font.body, marginBottom: 12,
  },
  error: { color: mono.color.danger, fontSize: mono.font.small, marginBottom: 8, textAlign: 'center' },
  guest: { alignItems: 'center', marginTop: mono.space(4.5) },
  guestText: { color: mono.color.textSecondary, fontSize: mono.font.body },
})
