import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cents, EVENT_METADATA, formatUSD } from '@domain/index';
import { fetchBookingDetail } from '../api/endpoints';
import { Footer } from '../components/layout/Footer';
import { Header } from '../components/layout/Header';
import { BookNowModal } from '../features/booking/components/BookNowModal';
import { GroupBookingBuilder } from '../features/booking/components/GroupBookingBuilder';
import { IndividualForm } from '../features/booking/components/IndividualForm';
import { useQuoteSync } from '../features/booking/hooks/useQuoteSync';
import { useBookingStore } from '../features/booking/store/booking-store';
import { useAuthStore } from '../stores/auth-store';
import { useCatalogStore } from '../stores/catalog-store';
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl';

const BOOKING_MODES: readonly SegmentedOption<'individual' | 'group'>[] = [
  {
    value: 'individual',
    label: 'Individual',
    description: 'One pass for yourself (aged 18 or over)',
  },
  {
    value: 'group',
    label: 'Group or family',
    description: 'Adults, children, under-5s and family passes',
  },
];

export function BookingPage(): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const loadCatalog = useCatalogStore((s) => s.loadCatalog);
  const user = useAuthStore((s) => s.user);

  const {
    draft,
    quoteState,
    setMode,
    prefillBookerFromProfile,
    openConfirmedModal,
  } = useBookingStore();

  useQuoteSync();

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (user) {
      prefillBookerFromProfile({
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
      });
    }
  }, [user, prefillBookerFromProfile]);

  // Returning from /pay/:bookingId -> /book?bookingId=...&payment=success re-opens BookNowModal in confirmed state.
  useEffect(() => {
    const returnedBookingId = searchParams.get('bookingId');
    const paymentStatus = searchParams.get('payment');
    if (!returnedBookingId || paymentStatus !== 'success') return;

    let active = true;
    fetchBookingDetail(returnedBookingId)
      .then((detail) => {
        if (!active) return;
        if (detail.status === 'confirmed') {
          openConfirmedModal(detail);
          void loadCatalog(true);
          setSearchParams({}, { replace: true });
        }
      })
      .catch(() => {
        // Ignore stale or unknown query param
      });

    return () => {
      active = false;
    };
  }, [searchParams, openConfirmedModal, loadCatalog, setSearchParams]);

  const liveTotal =
    quoteState.status === 'ready' ? formatUSD(cents(quoteState.quote.totalCents)) : null;

  return (
    <div className="flex min-h-screen flex-col bg-primary-dark text-white">
      <Header />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pt-10 sm:px-6 sm:pt-14">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-white/10 pb-8">
          <div>
            <p className="text-sm tracking-wide text-bright-gold">
              10 – 14 December 2026 · {EVENT_METADATA.venue}
            </p>
            <h1 className="mt-2 font-serif text-4xl text-cream sm:text-5xl">Book tickets</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/65">
              Choose whether you are booking for yourself or for a group. Ages are counted on 10
              December 2026.
            </p>
          </div>

          {liveTotal && (
            <div className="text-left sm:text-right">
              <span className="block text-xs text-white/50">Estimated total</span>
              <span className="tabular font-serif text-3xl text-cream">{liveTotal}</span>
            </div>
          )}
        </div>

        <div className="mt-8">
          <SegmentedControl
            label="Booking type"
            options={BOOKING_MODES}
            value={draft.mode}
            onChange={setMode}
          />
        </div>

        <div className="mt-10">
          {draft.mode === 'individual' ? <IndividualForm /> : <GroupBookingBuilder />}
        </div>
      </main>

      <BookNowModal />
      <Footer />
    </div>
  );
}
