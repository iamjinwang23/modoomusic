import { ProfilePanel } from '@/features/explore/components/ProfilePanel'

interface Props {
  params: Promise<{ username: string }>
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params
  return <ProfilePanel username={username} />
}
