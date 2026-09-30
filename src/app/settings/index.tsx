import { useRouter } from 'expo-router';

import { SettingsScreen } from '@/screens/settings-screen';

export default function SettingsRoute() {
  const router = useRouter();
  return <SettingsScreen onOpenAppearance={() => router.push('/settings/appearance')} />;
}
