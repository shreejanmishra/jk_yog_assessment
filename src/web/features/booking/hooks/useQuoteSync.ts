import { useEffect } from 'react';
import { AxiosError } from 'axios';
import { requestQuote } from '../../../api/endpoints';
import { ApiClientError } from '../../../api/http';
import { useBookingStore } from '../store/booking-store';
import { draftToBookingIntent } from '../store/transitions';

export function useQuoteSync(): void {
  const draft = useBookingStore((s) => s.draft);
  const draftVersion = useBookingStore((s) => s.draftVersion);
  const setQuoteState = useBookingStore((s) => s.setQuoteState);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const intent = draftToBookingIntent(draft);
      setQuoteState({ status: 'loading', forVersion: draftVersion });

      requestQuote(intent, controller.signal)
        .then((quote) => {
          if (controller.signal.aborted) return;
          const latestVersion = useBookingStore.getState().draftVersion;
          if (latestVersion !== draftVersion) return;
          setQuoteState({ status: 'ready', quote, forVersion: draftVersion });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          if (err instanceof AxiosError && err.code === 'ERR_CANCELED') return;
          const latestVersion = useBookingStore.getState().draftVersion;
          if (latestVersion !== draftVersion) return;

          if (err instanceof ApiClientError && err.statusCode === 422) {
            setQuoteState({
              status: 'invalid',
              issues: err.issues,
              forVersion: draftVersion,
            });
            return;
          }

          setQuoteState({
            status: 'error',
            message:
              err instanceof ApiClientError
                ? err.message
                : 'Unable to calculate live quote right now.',
          });
        });
    }, 240);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [draft, draftVersion, setQuoteState]);
}
