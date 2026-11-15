import type { ReactNode } from 'react';

import type { IconName } from '@/components/ui';
import { ar } from '@/i18n/ar';

import { StateLayout } from './state-layout';

export function EmptyState({
  icon = 'empty',
  title = ar.states.emptyTitle,
  description,
  action,
}: {
  icon?: IconName;
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return <StateLayout icon={icon} title={title} description={description} action={action} />;
}
