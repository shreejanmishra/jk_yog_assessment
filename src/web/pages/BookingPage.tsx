import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { User, Users } from 'lucide-react';
import { cents, formatUSD } from '@domain/index';
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
import { Badge } from '../ui/Badge';

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

  // When returning from the Simulated Payment Aggregator (/pay/:bookingId -> /book?bookingId=...&payment=success),
  // automatically re-open the Book Now Modal in its confirmed pass-download state!
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
        // Ignore invalid/expired query param
      });

    return () => {
      active = false;
    };
  }, [searchParams, openConfirmedModal, loadCatalog, setSearchParams]);

  const liveTotal =
    quoteState.status === 'ready' ? formatUSD(cents(quoteState.quote.totalCents)) : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#2C2C2C] text-white">
      <Header />

      <main className="flex-1 mx-auto w-full max-w-4xl px-4 sm:px-6 pt-8 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Badge variant="gold">Sharad Utsav 2026 · Dec 10–14</Badge>
            <h1 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-[#FDF3E4]">
              Book Festival Passes
            </h1>
            <p className="mt-1 text-sm text-white/75">
              Choose Individual or Group booking below. All prices & rules are verified server-side.
            </p>
          </div>

          {liveTotal && (
            <div className="rounded-xl border border-[#BC9226] bg-[#C99B24]/15 px-4 py-2 text-right">
              <span className="block text-[11px] uppercase tracking-wider text-[#D1AC3E]">
                Live Server Estimate
              </span>
              <span className="font-display text-xl font-bold text-[#FDF3E4]">{liveTotal}</span>
            </div>
          )}
        </div>

        {/* Mode Switcher: Individual vs Group Booking */}
        <div
          role="radiogroup"
          aria-label="Booking mode"
          className="grid grid-cols-1 sm:grid-cols-2 gap-3.5"
        >
          <button
            type="button"
            role="radio"
            aria-checked={draft.mode === 'individual'}
            onClick={() => setMode('individual')}
            className={`flex items-start gap-3.5 rounded-2xl border p-4 sm:p-5 text-left transition-all cursor-pointer ${
              draft.mode === 'individual'
                ? 'border-[#C99B24] bg-[#C99B24]/15 shadow-md'
                : 'border-white/20 bg-white/[0.04] hover:border-white/40'
            }`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#C99B24]/20 text-[#D1AC3E]">
              <User className="h-5 w-5" />
            </span>
            <div>
              <span className="block font-display text-lg font-bold text-[#FDF3E4]">
                Individual Booking
              </span>
              <span className="block text-xs sm:text-sm text-white/70 mt-0.5">
                Booking for yourself only (must be 18 or older).
              </span>
            </div>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={draft.mode === 'group'}
            onClick={() => setMode('group')}
            className={`flex items-start gap-3.5 rounded-2xl border p-4 sm:p-5 text-left transition-all cursor-pointer ${
              draft.mode === 'group'
                ? 'border-[#C99B24] bg-[#C99B24]/15 shadow-md'
                : 'border-white/20 bg-white/[0.04] hover:border-white/40'
            }`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#C99B24]/20 text-[#D1AC3E]">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <span className="block font-display text-lg font-bold text-[#FDF3E4]">
                Group / Family Booking
              </span>
              <span className="block text-xs sm:text-sm text-white/70 mt-0.5">
                Book for family & friends — adults, children (5–11), toddlers under 5, & Family
                Passes.
              </span>
            </div>
          </button>
        </div>

        {/* Active Booking Form */}
        {draft.mode === 'individual' ? <IndividualForm /> : <GroupBookingBuilder />}
      </main>

      <BookNowModal />
      <Footer />
    </div>
  );
}
