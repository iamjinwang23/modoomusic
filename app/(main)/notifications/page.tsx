// notifications §5.2 — 모바일 풀 페이지. 데스크톱은 layout이 알림 메뉴를 패널로 분기
import { NotificationPanel } from '@/components/NotificationPanel'

export default function NotificationsPage() {
  return <NotificationPanel mode="page" />
}
