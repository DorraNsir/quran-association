import { useNavigation, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

/** How long a success confirmation stays readable before going back (as the attendance save). */
export const CONFIRMATION_MS = 1200;

/**
 * After a CONFIRMED server write: show `message`, then go back ONE step
 * through the real stack. Never twice: the timer is cleared when the screen
 * goes away (e.g. «رجوع» during the confirmation) and nothing happens if the
 * screen is no longer focused. Without history (opened from a link), the
 * fallback screen replaces this one.
 */
export function useConfirmThenBack(fallback: Href) {
  const router = useRouter();
  const navigation = useNavigation();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const confirm = useCallback(
    (text: string) => {
      setMessage(text);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        if (!navigation.isFocused()) return;
        if (router.canGoBack()) router.back();
        else router.replace(fallback);
      }, CONFIRMATION_MS);
    },
    [fallback, navigation, router],
  );

  return { confirmation: message, confirm };
}
