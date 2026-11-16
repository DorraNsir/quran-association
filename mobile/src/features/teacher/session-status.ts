import type { IconName, PillTone } from '@/components/ui';

import type { SessionStatus } from './types';

/**
 * ONE status styling for sessions, used by the dashboard cards, the sessions
 * list, the session details and the attendance screen:
 *  - CANCELLED → soft red, dark red text
 *  - COMPLETED → soft green, dark green text
 *  - SCHEDULED → neutral
 *  - an EXTRA session → soft amber, dark amber text (a kind, not a status:
 *    shown next to the status, so it stays distinct from both)
 */
export const SESSION_STATUS_TONE: Record<SessionStatus, PillTone> = {
  CANCELLED: 'danger',
  COMPLETED: 'success',
  SCHEDULED: 'muted',
};

export const SESSION_STATUS_ICON: Record<SessionStatus, IconName> = {
  CANCELLED: 'cancelledSession',
  COMPLETED: 'completed',
  SCHEDULED: 'clock',
};

export const EXTRA_SESSION_TONE: PillTone = 'warning';
