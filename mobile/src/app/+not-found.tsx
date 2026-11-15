import { Stack, useRouter } from 'expo-router';

import { EmptyState } from '@/components/feedback';
import { Button, Screen } from '@/components/ui';
import { ar } from '@/i18n/ar';

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: ar.notFound.title }} />
      <Screen scroll={false}>
        <EmptyState
          icon="error"
          title={ar.notFound.title}
          description={ar.notFound.description}
          action={<Button label={ar.notFound.back} onPress={() => router.replace('/')} />}
        />
      </Screen>
    </>
  );
}
