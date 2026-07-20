import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { PUSH_CATEGORIES, PUSH_CATEGORY_LABELS, type PushCategory } from '@mono/shared'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { Icon, type IconName } from '@/components/ui/icon'
import { AccountDeletionSheet } from '@/components/ui/account-deletion-sheet'
import { mono } from '@/theme/mono'

interface CreditState { used: number; limit: number; remaining: number; bonus: number; paid: number; total: number }
interface AccountInfo { nickname: string; email: string; provider: string; joinedAt: string }

// 모든 설정 셀의 공통 높이 — '프로필 편집'과 동일하게 통일.
const CELL = 54

const WEB_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://www.modoonorae.com'

const PROVIDER_LABEL: Record<string, string> = {
  google: '구글', kakao: '카카오', naver: '네이버', apple: '애플', email: '이메일',
}

// 이용 안내·지원 — 웹 더보기/내 계정과 동일 항목. 대부분 웹 페이지라 인앱 브라우저로 연다.
const INFO_LINKS: { key: string; label: string; icon: IconName; url: string; external: boolean; mail?: boolean }[] = [
  { key: 'whatsnew', label: "What's New", icon: 'sparkle', url: `${WEB_BASE}/announcements`, external: false },
  { key: 'terms', label: '이용약관', icon: 'document', url: `${WEB_BASE}/terms`, external: true },
  { key: 'privacy', label: '개인정보처리방침', icon: 'document', url: `${WEB_BASE}/privacy`, external: true },
  { key: 'policy', label: '운영정책', icon: 'document', url: `${WEB_BASE}/policy`, external: true },
  { key: 'help', label: '도움말', icon: 'question', url: `${WEB_BASE}/help`, external: true },
  { key: 'faq', label: '자주 묻는 질문', icon: 'question', url: `${WEB_BASE}/faq`, external: true },
  { key: 'contact', label: '문의하기', icon: 'bubble.left', url: 'mailto:bee202408@gmail.com', external: false, mail: true },
]

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

// 설정 — 계정정보 + 크레딧 + 알림 토글 + 이용안내 + 로그아웃 + 회원 탈퇴. 프로필 탭의 톱니에서 진입.
// (프로필 편집은 프로필 화면 우상단 pill로 진입 — 설정 중복 제거, 웹 파리티)
export default function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [credits, setCredits] = useState<CreditState | null>(null)
  const [loading, setLoading] = useState(true)
  const [prefs, setPrefs] = useState<Record<PushCategory, boolean> | null>(null)
  const [deletionOpen, setDeletionOpen] = useState(false)

  const load = useCallback(async () => {
    const [c, { data: { user } }] = await Promise.all([
      api.get('/api/credits/me').catch(() => null) as Promise<CreditState | null>,
      supabase.auth.getUser(),
    ])
    setCredits(c)
    if (user) {
      const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
      const provider = (user.app_metadata?.provider as string) || 'email'
      setAccount({
        nickname: (prof as { display_name?: string } | null)?.display_name ?? '-',
        email: user.email ?? '-',
        provider: PROVIDER_LABEL[provider] ?? provider,
        joinedAt: user.created_at ? fmtDate(user.created_at) : '-',
      })
    }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.get('/api/notifications/preferences')
      .then((j) => setPrefs((j as { preferences: Record<PushCategory, boolean> }).preferences))
      .catch(() => setPrefs(null))
  }, [])

  const toggle = async (c: PushCategory, v: boolean) => {
    setPrefs((p) => (p ? { ...p, [c]: v } : p))            // 낙관적
    try { await api.post('/api/notifications/preferences', { category: c, enabled: v }) }
    catch { setPrefs((p) => (p ? { ...p, [c]: !v } : p)) }  // 롤백
  }

  const openLink = (it: (typeof INFO_LINKS)[number]) => {
    if (it.mail) { Linking.openURL(it.url).catch(() => {}); return }
    WebBrowser.openBrowserAsync(it.url).catch(() => {})
  }

  const logout = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Icon name="close" size={20} color={mono.color.text} /></Pressable>
        <Text style={styles.h1}>설정</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={mono.color.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
          {account && (
            <>
              <Text style={styles.section}>계정 정보</Text>
              <View style={styles.group}>
                <InfoRow label="닉네임" value={account.nickname} />
                <View style={styles.divider} />
                <InfoRow label="이메일" value={account.email} />
                <View style={styles.divider} />
                <InfoRow label="로그인 수단" value={account.provider} />
                <View style={styles.divider} />
                <InfoRow label="가입일" value={account.joinedAt} />
              </View>
            </>
          )}

          <Text style={styles.section}>크레딧</Text>
          <View style={styles.group}>
            <InfoRow label="오늘 남은 크레딧" value={credits ? `${credits.remaining} / ${credits.limit}` : '-'} strong />
            <View style={styles.divider} />
            <InfoRow label="보너스" value={credits ? `${credits.bonus}` : '-'} />
            <View style={styles.divider} />
            <InfoRow label="충전(유상)" value={credits ? `${credits.paid}` : '-'} />
            <View style={styles.divider} />
            <InfoRow label="사용 가능 총량" value={credits ? `${credits.total}` : '-'} strong />
          </View>

          {/* 크레딧 충전 · 플랜 업그레이드 — 결제(IAP) 도입 전까지 준비중 안내 */}
          <Pressable
            style={({ pressed }) => [styles.ctaWhite, pressed && styles.pressed]}
            onPress={() => router.push('/credit-purchase')}
          >
            <Text style={styles.ctaWhiteText}>크레딧 충전하기</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.ctaViolet, pressed && styles.pressed]}
            onPress={() => Alert.alert('플랜 업그레이드', '곧 만나요! 업그레이드 시 추가 크레딧을 제공할 예정이에요.')}
          >
            <Text style={styles.ctaVioletText}>플랜 업그레이드</Text>
          </Pressable>
          <Text style={styles.ctaHint}>업그레이드 시 추가 크레딧 제공</Text>

          {prefs && (
            <>
              <Text style={styles.section}>알림</Text>
              <View style={styles.group}>
                {PUSH_CATEGORIES.map((c, i) => (
                  <View key={c}>
                    <View style={styles.cell}>
                      <Text style={styles.cellText}>{PUSH_CATEGORY_LABELS[c]}</Text>
                      <Switch
                        style={styles.cellSwitch}
                        value={prefs[c]}
                        onValueChange={(v) => toggle(c, v)}
                        trackColor={{ false: mono.color.fillStrong, true: mono.color.accent }}
                        ios_backgroundColor={mono.color.fillStrong}
                        thumbColor="#ffffff"
                      />
                    </View>
                    {i < PUSH_CATEGORIES.length - 1 && <View style={styles.divider} />}
                  </View>
                ))}
              </View>
            </>
          )}

          {/* 안전 — 차단 관리 */}
          <Text style={styles.section}>안전</Text>
          <View style={styles.group}>
            <Pressable style={styles.cell} onPress={() => router.push('/blocked-users')}>
              <Text style={styles.cellText}>차단 목록</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </View>

          {/* 이용 안내·지원 */}
          <Text style={styles.section}>이용 안내·지원</Text>
          <View style={styles.group}>
            {INFO_LINKS.map((it, i) => (
              <View key={it.key}>
                <Pressable style={styles.cell} onPress={() => openLink(it)}>
                  <View style={styles.linkLeft}>
                    <Icon name={it.icon} size={18} color={mono.color.textSecondary} />
                    <Text style={styles.cellText}>{it.label}</Text>
                  </View>
                  {it.external ? <Icon name="external.link" size={15} color={mono.color.textTertiary} /> : <Text style={styles.chevron}>›</Text>}
                </Pressable>
                {i < INFO_LINKS.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>

          {/* 로그아웃 · 회원 탈퇴 — 동일 셀 높이 */}
          <View style={[styles.group, { marginTop: 28 }]}>
            <Pressable style={styles.cell} onPress={logout}>
              <Text style={styles.logoutText}>로그아웃</Text>
            </Pressable>
          </View>
          <View style={[styles.group, { marginTop: 10 }]}>
            <Pressable style={styles.cell} onPress={() => setDeletionOpen(true)}>
              <Text style={styles.deleteText}>회원 탈퇴</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}

      <AccountDeletionSheet open={deletionOpen} onClose={() => setDeletionOpen(false)} />
    </View>
  )
}

function InfoRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.cell}>
      <Text style={[styles.infoLabel, strong && styles.infoStrong]}>{label}</Text>
      <Text style={[styles.infoValue, strong && styles.infoStrong]} numberOfLines={1}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  h1: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  section: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700', marginTop: 28, marginBottom: 10 },
  // 카드(그룹) — 내부 셀들을 감싸고 divider를 풀블리드로 떨어뜨림.
  group: {
    backgroundColor: mono.color.surface, borderRadius: mono.radius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: mono.color.borderSoft,
  },
  // 모든 설정 셀의 공통 형태 — 높이 통일.
  cell: {
    minHeight: CELL, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  cellText: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '500' },
  cellSwitch: { alignSelf: 'center' },
  chevron: { color: mono.color.textTertiary, fontSize: 22 },
  linkLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoLabel: { color: mono.color.textSecondary, fontSize: mono.font.body },
  infoValue: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600', flexShrink: 1, marginLeft: 12, textAlign: 'right' },
  infoStrong: { color: mono.color.text, fontWeight: '800' },
  divider: { height: 1, backgroundColor: mono.color.borderSoft },
  // 로그아웃 = 위험 빨강(자주 쓰는 액션 강조), 회원 탈퇴 = 비활성 흐린색(실수 방지)
  logoutText: { color: mono.color.danger, fontSize: mono.font.body, fontWeight: '600' },
  deleteText: { color: mono.color.textTertiary, fontSize: mono.font.body, fontWeight: '500' },
  // 크레딧 CTA — 웹 사이드바 파리티(흰색 충전 / 바이올렛 업그레이드)
  ctaWhite: { marginTop: 10, height: 50, borderRadius: mono.radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  ctaWhiteText: { color: '#18181b', fontSize: mono.font.body, fontWeight: '700' },
  ctaViolet: { marginTop: 8, height: 50, borderRadius: mono.radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: mono.color.accent },
  ctaVioletText: { color: '#ffffff', fontSize: mono.font.body, fontWeight: '700' },
  ctaHint: { color: mono.color.textTertiary, fontSize: mono.font.tiny, textAlign: 'center', marginTop: 8 },
  pressed: { opacity: 0.85 },
})
