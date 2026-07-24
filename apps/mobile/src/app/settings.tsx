import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import Constants from 'expo-constants'
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
  { key: 'whatsnew', label: '공지사항', icon: 'sparkle', url: `${WEB_BASE}/announcements`, external: true },
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

// App Store 최신 버전 확인용 — 숫자 App Store ID(= ascAppId / appAppleId) + 번들 ID.
const APP_STORE_ID = '6790648491'
const IOS_BUNDLE_ID = 'com.modoomusic.app'

// semver 비교: a<b → -1, a==b → 0, a>b → 1. (마케팅 버전 x.y.z 기준)
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

// 설정 — 계정정보 + 크레딧 + 알림 토글 + 이용안내 + 로그아웃 + 회원 탈퇴. 프로필 탭의 톱니에서 진입.
// (프로필 편집은 프로필 화면 우상단 pill로 진입 — 설정 중복 제거, 웹 파리티)
export default function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [credits, setCredits] = useState<CreditState | null>(null)
  const [loading, setLoading] = useState(true)
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

  // 버전 — App Store 최신 버전과 비교(iOS만). checking→불명 시 우측 텍스트 숨김.
  const version = Constants.expoConfig?.version ?? '—'
  const [updateStatus, setUpdateStatus] = useState<'checking' | 'latest' | 'update' | 'unknown'>('checking')
  const [storeUrl, setStoreUrl] = useState<string | null>(null)
  useEffect(() => {
    if (Platform.OS !== 'ios' || version === '—') { setUpdateStatus('unknown'); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`https://itunes.apple.com/lookup?bundleId=${IOS_BUNDLE_ID}&country=kr`)
        const j = (await res.json()) as { results?: { version?: string; trackViewUrl?: string }[] }
        const app = j.results?.[0]
        if (cancelled) return
        if (!app?.version) { setUpdateStatus('unknown'); return }
        setStoreUrl(app.trackViewUrl ?? `https://apps.apple.com/app/id${APP_STORE_ID}`)
        setUpdateStatus(compareVersions(version, app.version) < 0 ? 'update' : 'latest')
      } catch { if (!cancelled) setUpdateStatus('unknown') }
    })()
    return () => { cancelled = true }
  }, [version])
  const openAppStore = () => {
    Linking.openURL(storeUrl ?? `https://apps.apple.com/app/id${APP_STORE_ID}`).catch(() => {})
  }

  const openLink = (it: (typeof INFO_LINKS)[number]) => {
    if (it.mail) { Linking.openURL(it.url).catch(() => {}); return }
    WebBrowser.openBrowserAsync(it.url).catch(() => {})
  }

  const logout = async () => {
    await supabase.auth.signOut()
    toast.success('로그아웃했어요')
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
            <View style={styles.divider} />
            {/* 크레딧 내역(충전·사용) 대시보드 진입 */}
            <Pressable style={styles.cell} onPress={() => router.push('/credit-history')}>
              <Text style={styles.cellText}>크레딧 내역 보기</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
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

          {/* 알림 — 뎁스 진입(차단 목록 패턴). 마스터 + 항목별 토글은 하위 화면에서. */}
          <Text style={styles.section}>알림</Text>
          <View style={styles.group}>
            <Pressable style={styles.cell} onPress={() => router.push('/notification-settings')}>
              <Text style={styles.cellText}>알림 설정</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </View>

          {/* 신고·차단 — 차단 관리 */}
          <Text style={styles.section}>신고·차단</Text>
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
            <View style={styles.divider} />
            {/* 오픈소스 라이선스 — 인앱 뎁스 화면 */}
            <Pressable style={styles.cell} onPress={() => router.push('/oss-licenses')}>
              <View style={styles.linkLeft}>
                <Icon name="document" size={18} color={mono.color.textSecondary} />
                <Text style={styles.cellText}>오픈소스 라이선스</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </View>

          {/* 버전 정보 — 좌: 현재 버전(v prefix), 우: 최신 버전 / 업데이트(탭 시 앱스토어) */}
          <Text style={styles.section}>버전 정보</Text>
          <View style={styles.group}>
            <View style={styles.cell}>
              <Text style={styles.cellText}>{version === '—' ? version : `v${version}`}</Text>
              {updateStatus === 'update' ? (
                <Pressable onPress={openAppStore} hitSlop={10}>
                  <Text style={styles.updateText}>업데이트</Text>
                </Pressable>
              ) : updateStatus === 'latest' ? (
                <Text style={styles.latestText}>최신 버전</Text>
              ) : null}
            </View>
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
  chevron: { color: mono.color.textTertiary, fontSize: 22 },
  linkLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoLabel: { color: mono.color.textSecondary, fontSize: mono.font.body },
  infoValue: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600', flexShrink: 1, marginLeft: 12, textAlign: 'right' },
  infoStrong: { color: mono.color.text, fontWeight: '800' },
  divider: { height: 1, backgroundColor: mono.color.borderSoft },
  // 로그아웃 = 위험 빨강(자주 쓰는 액션 강조), 회원 탈퇴 = 비활성 흐린색(실수 방지)
  logoutText: { color: mono.color.danger, fontSize: mono.font.body, fontWeight: '600' },
  updateText: { color: mono.color.accentLight, fontSize: mono.font.body, fontWeight: '700' },
  latestText: { color: mono.color.textTertiary, fontSize: mono.font.body },
  deleteText: { color: mono.color.textTertiary, fontSize: mono.font.body, fontWeight: '500' },
  // 크레딧 CTA — 웹 사이드바 파리티(흰색 충전 / 바이올렛 업그레이드)
  ctaWhite: { marginTop: 10, height: 50, borderRadius: mono.radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  ctaWhiteText: { color: '#18181b', fontSize: mono.font.body, fontWeight: '700' },
  ctaViolet: { marginTop: 8, height: 50, borderRadius: mono.radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: mono.color.accent },
  ctaVioletText: { color: '#ffffff', fontSize: mono.font.body, fontWeight: '700' },
  ctaHint: { color: mono.color.textTertiary, fontSize: mono.font.tiny, textAlign: 'center', marginTop: 8 },
  pressed: { opacity: 0.85 },
})
