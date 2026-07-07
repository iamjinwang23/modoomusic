// 어드민 모듈 정의 — 권한 키와 라벨 매핑.
// dashboard는 모든 관리자 기본 접근.

export const ADMIN_MODULES = [
  'users',
  'content',
  'credits',
  'reports',
  'audit',
  'announcements',
  'models',
  'payments',
] as const

export type AdminModule = typeof ADMIN_MODULES[number]

export const MODULE_LABELS: Record<AdminModule, string> = {
  users:         '사용자',
  content:       '콘텐츠',
  credits:       '크레딧',
  reports:       '신고',
  audit:         '감사 로그',
  announcements: '공지',
  models:        '모델',
  payments:      '결제',
}

/**
 * 권한 체크 — null이면 최고관리자(전체 허용), 배열이면 명시된 모듈만 허용.
 */
export function hasPermission(
  permissions: string[] | null | undefined,
  module: AdminModule,
): boolean {
  if (permissions == null) return true  // 최고관리자
  return permissions.includes(module)
}

/**
 * 최고관리자 여부 — admin_permissions가 NULL.
 */
export function isSuperAdmin(permissions: string[] | null | undefined): boolean {
  return permissions == null
}
