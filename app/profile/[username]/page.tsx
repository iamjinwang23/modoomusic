import { HomeLayout } from '../../HomeLayout'

interface Props {
  params: Promise<{ username: string }>
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params
  return <HomeLayout initialSection="profile" initialProfileUsername={username} />
}
