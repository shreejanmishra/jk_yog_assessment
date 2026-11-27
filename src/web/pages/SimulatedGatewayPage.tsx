import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Clock, CreditCard, Lock, ShieldCheck } from 'lucide-react';
import type { BookingDetailResponseDTO } from '@contract/index';
import { cents, formatUSD, type PaymentMethodChoice } from '@domain/index';
import { fetchBookingDetail, submitSimulatedPayment } from '../api/endpoints';
import { ApiClientError } from '../api/http';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { TextField } from '../ui/TextField';

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

  // Live 10-minute stock hold countdown
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
    // Typing test decline card ending in 0002 also triggers decline
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
    <div className="min-h-screen bg-[#222222] text-white flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg space-y-5">
        <button
          type="button"
          onClick={() => navigate('/book')}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-white/70 hover:text-white cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Booking Form
        </button>

        <Card className="p-6 sm:p-8 space-y-6 border-[#BC9226]/70">
          <div className="flex items-start justify-between gap-3 border-b border-white/15 pb-4">
            <div>
              <Badge variant="gold">
                {methodParam === 'stripe'
                  ? 'Stripe Checkout Simulator'
                  : 'Credit Card Gateway Simulator'}
              </Badge>
              <h1 className="mt-2 font-display text-2xl font-bold text-[#FDF3E4]">
                Complete Your Festival Booking
              </h1>
              {booking && (
                <p className="text-xs text-white/70 mt-0.5">
                  Ref: <strong>{booking.reference}</strong> · {booking.passes.length} Pass
                  {booking.passes.length === 1 ? '' : 'es'}
                </p>
              )}
            </div>

            {secondsLeft !== null && (
              <div className="rounded-xl border border-[#C99B24]/60 bg-[#C99B24]/15 px-3 py-1.5 text-right shrink-0">
                <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[#D1AC3E]">
                  <Clock className="h-3 w-3" /> Stock Hold
                </span>
                <span className="font-mono text-sm font-bold text-white">
                  {formatRemainingSeconds(secondsLeft)}
                </span>
              </div>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-white/70 py-8 text-center">Loading payment session…</p>
          ) : booking ? (
            <>
              <div className="rounded-xl bg-[#FDF3E4] p-4 text-[#291900] flex items-center justify-between">
                <div>
                  <span className="block text-xs font-bold uppercase tracking-wider text-[#645743]">
                    Server-Verified Amount Due
                  </span>
                  <span className="text-xs text-[#645743]">{booking.event.venue}</span>
                </div>
                <span className="font-display text-2xl font-bold text-[#291900]">
                  {formatUSD(cents(booking.totalCents))}
                </span>
              </div>

              <div className="space-y-3.5">
                <TextField
                  label="Cardholder Name"
                  value={cardholder}
                  onChange={(e) => setCardholder(e.target.value)}
                />
                <TextField
                  label="Simulated Card Number"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  hint="4242…4242 succeeds · 4000…0002 simulates a declined card"
                />
                <div className="grid grid-cols-2 gap-3.5">
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

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-[#EF1F1F] bg-[#EF1F1F]/15 p-3.5 flex items-start gap-2 text-xs sm:text-sm text-[#FF7A7A]"
                >
                  <AlertCircle className="h-4 w-4 text-[#EF1F1F] shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2.5 pt-2">
                <Button
                  variant="primary"
                  size="lg"
                  loading={processing}
                  disabled={secondsLeft === 0}
                  onClick={() => void handleAction('success')}
                  className="w-full"
                >
                  <Lock className="h-4 w-4" />
                  Confirm Simulated Payment ({formatUSD(cents(booking.totalCents))})
                </Button>

                <div className="grid grid-cols-2 gap-2.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={processing}
                    onClick={() => void handleAction('decline')}
                  >
                    <CreditCard className="h-4 w-4" />
                    Simulate Decline
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={processing}
                    onClick={() => void handleAction('cancel')}
                  >
                    Cancel & Release Hold
                  </Button>
                </div>
              </div>

              <p className="flex items-center justify-center gap-1.5 text-xs text-white/55 text-center">
                <ShieldCheck className="h-4 w-4 text-[#4CC75A]" />
                <span>
                  Simulated aggregator — no real card is charged. Confirming returns to your pass
                  modal.
                </span>
              </p>
            </>
          ) : (
            <p className="text-sm text-[#FF7A7A]">{error ?? 'Booking session not found.'}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
