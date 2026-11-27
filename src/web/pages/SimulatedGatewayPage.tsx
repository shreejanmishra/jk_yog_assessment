import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import type { BookingDetailResponseDTO } from '@contract/index';
import { cents, formatUSD, type PaymentMethodChoice } from '@domain/index';
import { fetchBookingDetail, submitSimulatedPayment } from '../api/endpoints';
import { ApiClientError } from '../api/http';
import { Button } from '../ui/Button';
import { FieldError, TextField } from '../ui/TextField';

function formatRemainingSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function SimulatedGatewayPage(): React.ReactElement {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const methodParam: PaymentMethodChoice =
    searchParams.get('method') === 'stripe' ? 'stripe' : 'card';

  const [booking, setBooking] = useState<BookingDetailResponseDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const [cardholder, setCardholder] = useState('');
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [expiry, setExpiry] = useState('12/28');
  const [cvc, setCvc] = useState('424');

  useEffect(() => {
    if (!bookingId) return;
    setLoading(true);
    fetchBookingDetail(bookingId)
      .then((detail) => {
        setBooking(detail);
        setCardholder(detail.booker.fullName);
        if (detail.status === 'confirmed') {
          navigate(`/book?bookingId=${detail.bookingId}&payment=success`, { replace: true });
        }
      })
      .catch((err) => {
        setError(err instanceof ApiClientError ? err.message : 'Unable to load payment session.');
      })
      .finally(() => setLoading(false));
  }, [bookingId, navigate]);

  useEffect(() => {
    if (!booking) return;
    const tick = (): void => {
      const diff = Math.max(
        0,
        Math.floor((new Date(booking.holdExpiresAt).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(diff);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [booking]);

  const handleAction = async (outcome: 'success' | 'decline' | 'cancel'): Promise<void> => {
    if (!bookingId || processing) return;
    setProcessing(true);
    setError(null);

    const digits = cardNumber.replace(/\D/g, '');
    const cardLast4 = digits.length >= 4 ? digits.slice(-4) : '4242';
    const effectiveOutcome =
      outcome === 'success' && cardLast4 === '0002' ? 'decline' : outcome;

    try {
      const res = await submitSimulatedPayment(bookingId, {
        outcome: effectiveOutcome,
        method: methodParam,
        cardLast4,
        cardholderName: cardholder,
      });

      if (res.status === 'confirmed') {
        navigate(res.redirectUrl, { replace: true });
      } else {
        navigate('/book', { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Payment communication error. Your card has not been charged.');
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-primary-dark p-4 text-white sm:p-6">
      <div className="w-full max-w-lg space-y-5">
        <button
          type="button"
          onClick={() => {
            if (booking?.status === 'pending_payment') {
              void handleAction('cancel');
            } else {
              navigate('/book');
            }
          }}
          className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-white/65 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to booking
        </button>

        <div className="space-y-6 rounded-card border border-white/15 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
            <div>
              <p className="text-xs uppercase tracking-wider text-bright-gold">
                {methodParam === 'stripe' ? 'Simulated Stripe checkout' : 'Simulated card payment'}
              </p>
              <h1 className="mt-1 font-serif text-2xl text-cream sm:text-3xl">
                Complete payment
              </h1>
              {booking && (
                <p className="mt-1 text-xs text-white/60">
                  Reference {booking.reference} · {booking.passes.length}{' '}
                  {booking.passes.length === 1 ? 'pass' : 'passes'}
                </p>
              )}
            </div>

            {secondsLeft !== null && (
              <div className="shrink-0 text-right">
                <span className="block text-xs text-white/50">Hold expires in</span>
                <span className="tabular font-mono text-base font-semibold text-bright-gold">
                  {formatRemainingSeconds(secondsLeft)}
                </span>
              </div>
            )}
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-white/60">Loading payment session…</p>
          ) : booking ? (
            <>
              <div className="flex items-baseline justify-between rounded-control bg-cream px-5 py-4 text-heading">
                <div>
                  <span className="block text-xs text-primary-text">Amount due</span>
                  <span className="text-xs text-primary-text">{booking.event.venue}</span>
                </div>
                <span className="tabular font-serif text-2xl font-semibold">
                  {formatUSD(cents(booking.totalCents))}
                </span>
              </div>

              <div className="space-y-4">
                <TextField
                  label="Name on card"
                  value={cardholder}
                  onChange={(e) => setCardholder(e.target.value)}
                />
                <TextField
                  label="Card number (simulated)"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  hint="4242…4242 approves · 4000…0002 declines"
                />
                <div className="grid grid-cols-2 gap-4">
                  <TextField
                    label="Expiry"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                  />
                  <TextField
                    label="CVC"
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value)}
                  />
                </div>
              </div>

              <FieldError message={error} />

              <div className="space-y-2.5 pt-2">
                <Button
                  size="lg"
                  loading={processing}
                  disabled={secondsLeft === 0}
                  onClick={() => void handleAction('success')}
                  className="w-full"
                >
                  <Lock className="h-4 w-4" aria-hidden="true" />
                  Pay {formatUSD(cents(booking.totalCents))}
                </Button>

                <div className="grid grid-cols-2 gap-2.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={processing}
                    onClick={() => void handleAction('decline')}
                  >
                    Simulate decline
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={processing}
                    onClick={() => void handleAction('cancel')}
                  >
                    Cancel and release hold
                  </Button>
                </div>
              </div>

              <p className="text-center text-xs text-white/45">
                Simulated payment gateway — no real card is charged.
              </p>
            </>
          ) : (
            <p className="text-sm text-error-on-dark">{error ?? 'Booking session not found.'}</p>
          )}
        </div>
      </div>
    </div>
  );
}
