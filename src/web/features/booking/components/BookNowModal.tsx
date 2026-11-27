import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  Landmark,
  Mail,
  MapPin,
  Tag,
} from 'lucide-react';
import { cents, EVENT_METADATA, formatUSD } from '@domain/index';
import {
  createBooking,
  fetchBookingDetail,
  getInvoicePdfUrl,
  getPassesPdfUrl,
} from '../../../api/endpoints';
import { ApiClientError } from '../../../api/http';
import { useCatalogStore } from '../../../stores/catalog-store';
import { Button } from '../../../ui/Button';
import { Modal } from '../../../ui/Modal';
import { FieldError } from '../../../ui/TextField';
import { useBookingStore } from '../store/booking-store';
import { draftToBookingIntent } from '../store/transitions';
import { BoardingPassTicket } from './BoardingPassTicket';
import { SentEmailPreviewModal } from './SentEmailPreviewModal';

export function BookNowModal(): React.ReactElement {
  const navigate = useNavigate();
  const loadCatalog = useCatalogStore((s) => s.loadCatalog);

  const {
    draft,
    draftVersion,
    quoteState,
    bookModal,
    closeBookModal,
    setPromoCode,
    setPaymentMethod,
    ensureIdempotencyKey,
    recordHoldCreated,
    openConfirmedModal,
    resetDraftAfterCompletion,
  } = useBookingStore();

  const [couponInput, setCouponInput] = useState(draft.promoCode);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [passCarouselIdx, setPassCarouselIdx] = useState(0);
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);

  const isQuoteReadyForDraft =
    quoteState.status === 'ready' && quoteState.forVersion === draftVersion;
  const quote = quoteState.status === 'ready' ? quoteState.quote : null;

  const handleApplyCoupon = (e: React.FormEvent): void => {
    e.preventDefault();
    setSubmitError(null);
    setPromoCode(couponInput.trim());
  };

  const handleProceedToPayment = async (): Promise<void> => {
    if (!quote || !isQuoteReadyForDraft || submitting) return;
    if (quote.promo.status === 'rejected') {
      setSubmitError(
        `Please clear or replace invalid coupon "${quote.promo.code}" before paying.`,
      );
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const idemKey = ensureIdempotencyKey();
      const intent = draftToBookingIntent(draft);
      const created = await createBooking(
        {
          ...intent,
          paymentMethod: draft.paymentMethod,
          expectedTotalCents: quote.totalCents,
        },
        idemKey,
      );

      recordHoldCreated({
        bookingId: created.bookingId,
        reference: created.reference,
        holdExpiresAt: created.holdExpiresAt,
      });

      // $0 total after promo (e.g. FLAT20 on $15 pass) confirms immediately on the server!
      if (created.status === 'confirmed' || !created.paymentUrl) {
        const detail = await fetchBookingDetail(created.bookingId);
        await loadCatalog(true);
        openConfirmedModal(detail);
        return;
      }

      // Navigate in the SAME window (no popup!) to the simulated payment aggregator
      closeBookModal();
      navigate(created.paymentUrl);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSubmitError(err.message);
        if (err.code === 'INSUFFICIENT_STOCK' || err.code === 'PRICE_CHANGED') {
          await loadCatalog(true);
        }
      } else {
        setSubmitError('Unable to initiate booking hold. Please check your connection.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const confirmed = bookModal.confirmedBooking;
  const activePass = confirmed?.passes[passCarouselIdx];

  return (
    <>
      <Modal
        open={bookModal.open}
        onClose={closeBookModal}
        title={
          bookModal.stage === 'confirmed'
            ? 'Booking Confirmed · Boarding Passes Ready'
            : 'Review Pass Details & Complete Payment'
        }
        subtitle={`${EVENT_METADATA.name} · ${EVENT_METADATA.venue}`}
        maxWidthClass="max-w-3xl"
      >
        {bookModal.stage === 'confirmed' && confirmed ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-[#28A736]/70 bg-[#28A736]/15 p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-[#4CC75A] shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-[#4CC75A]">
                    Booking Successful! Reference: {confirmed.reference}
                  </p>
                  <p className="text-xs text-white/80 mt-0.5">
                    Confirmation and boarding pass PDFs have been dispatched to{' '}
                    <strong>{confirmed.booker.email}</strong>.
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEmailPreviewOpen(true)}
              >
                <Mail className="h-4 w-4 text-[#D1AC3E]" />
                View Sent Email
              </Button>
            </div>

            {confirmed.passes.length > 1 && (
              <div className="flex items-center justify-between rounded-xl bg-white/[0.06] px-4 py-2.5 text-sm">
                <button
                  type="button"
                  disabled={passCarouselIdx === 0}
                  onClick={() => setPassCarouselIdx((i) => Math.max(0, i - 1))}
                  className="inline-flex items-center gap-1 text-[#D1AC3E] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" /> Previous Pass
                </button>
                <span className="text-xs font-semibold">
                  Pass {passCarouselIdx + 1} of {confirmed.passes.length}
                </span>
                <button
                  type="button"
                  disabled={passCarouselIdx >= confirmed.passes.length - 1}
                  onClick={() =>
                    setPassCarouselIdx((i) => Math.min(confirmed.passes.length - 1, i + 1))
                  }
                  className="inline-flex items-center gap-1 text-[#D1AC3E] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  Next Pass <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {activePass && (
              <BoardingPassTicket
                bookingId={confirmed.bookingId}
                reference={confirmed.reference}
                pass={activePass}
                showSingleDownloadButton={confirmed.passes.length > 1}
              />
            )}

            <div className="pt-4 border-t border-white/15 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2.5">
                <a href={getPassesPdfUrl(confirmed.bookingId)} download>
                  <Button variant="primary">
                    <Download className="h-4 w-4" />
                    Download {confirmed.passes.length > 1 ? 'All Passes (PDF)' : 'Pass (PDF)'}
                  </Button>
                </a>
                {confirmed.invoice && (
                  <a href={getInvoicePdfUrl(confirmed.bookingId)} download>
                    <Button variant="secondary">
                      <Download className="h-4 w-4" />
                      Download Invoice (PDF)
                    </Button>
                  </a>
                )}
              </div>

              <Button variant="ghost" onClick={resetDraftAfterCompletion}>
                Start Another Booking
              </Button>
            </div>
          </div>
        ) : (
          /* CHECKOUT REVIEW STAGE */
          <div className="space-y-5">
            {/* Venue Banner */}
            <div className="rounded-xl border border-white/15 bg-white/[0.04] p-3.5 flex items-center gap-2.5 text-xs sm:text-sm text-white/85">
              <MapPin className="h-4 w-4 text-[#D1AC3E] shrink-0" />
              <span>
                <strong>Venue:</strong> {EVENT_METADATA.venue}, {EVENT_METADATA.address}
              </span>
            </div>

            {quoteState.status === 'loading' && (
              <p className="text-sm text-white/70 py-6 text-center">
                Verifying rules and calculating authoritative server price…
              </p>
            )}

            {quoteState.status === 'invalid' && (
              <div className="rounded-xl border border-[#EF1F1F]/70 bg-[#EF1F1F]/10 p-4 space-y-2">
                <p className="text-sm font-semibold text-[#FF7A7A]">
                  Please resolve the following before booking:
                </p>
                <ul className="list-disc pl-5 text-xs sm:text-sm text-[#FF7A7A] space-y-1">
                  {quoteState.issues.map((iss, idx) => (
                    <li key={`${iss.code}-${idx}`}>{iss.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {quote && (
              <>
                {/* Pass Validity & Extras per Passholder */}
                <div className="space-y-2.5">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[#D1AC3E]">
                    Pass Validity & Extras Summary
                  </h3>
                  <div className="space-y-2">
                    {quote.attendeePasses.map((p) => (
                      <div
                        key={p.clientId}
                        className="rounded-xl border border-[#BC9226]/50 bg-[#FDF3E4] px-4 py-3 text-[#291900] text-xs sm:text-sm space-y-1"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong className="text-base">{p.fullName}</strong>
                          <span className="font-semibold text-[#645743]">
                            {p.passLabel} · Age {p.age}
                          </span>
                        </div>
                        <div>
                          <strong>Validity:</strong> {p.validDatesDisplay}
                        </div>
                        <div>
                          <strong>Extras:</strong> {p.extrasSummary.join(' · ')}
                        </div>
                        {p.guardian && (
                          <div className="text-xs font-semibold text-[#291900] pt-0.5">
                            Guardian: {p.guardian.name} ({p.guardian.phone})
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Warnings (e.g. cheaper pass option or low workshop stock) */}
                {quote.warnings.length > 0 && (
                  <div className="rounded-xl border border-[#D1AC3E]/60 bg-[#C99B24]/15 p-3.5 space-y-1.5">
                    {quote.warnings.map((w, i) => (
                      <p key={i} className="flex items-start gap-2 text-xs text-[#F5C76B]">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{w.message}</span>
                      </p>
                    ))}
                  </div>
                )}

                {/* Coupon Code Box */}
                <form onSubmit={handleApplyCoupon} className="space-y-2">
                  <label
                    htmlFor="coupon-input"
                    className="block text-sm font-medium text-white"
                  >
                    Promo / Coupon Code
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Tag className="h-4 w-4 text-[#D1AC3E] absolute left-3.5 top-3.5" />
                      <input
                        id="coupon-input"
                        type="text"
                        placeholder="Try SEVA10, FLAT20, or KIDSFREE"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value)}
                        className="w-full min-h-11 rounded-[10px] border border-white/25 bg-white/[0.06] pl-10 pr-3.5 py-2 text-sm uppercase text-white placeholder:normal-case placeholder:text-white/40 focus:border-[#D1AC3E]"
                      />
                    </div>
                    <Button type="submit" variant="secondary">
                      Apply
                    </Button>
                    {draft.promoCode && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setCouponInput('');
                          setPromoCode('');
                        }}
                      >
                        Clear
                      </Button>
                    )}
                  </div>

                  {quote.promo.status === 'applied' && (
                    <p className="text-xs font-medium text-[#4CC75A]">{quote.promo.message}</p>
                  )}
                  {quote.promo.status === 'rejected' && (
                    <FieldError message={quote.promo.message} />
                  )}
                </form>

                {/* Server Itemized Totals */}
                <div className="rounded-xl border border-white/15 bg-white/[0.04] p-4 space-y-2 text-sm">
                  {quote.lines.map((line, i) => (
                    <div key={i} className="flex justify-between gap-3 text-xs sm:text-sm text-white/80">
                      <span>{line.label}</span>
                      <span className="font-medium shrink-0">
                        {formatUSD(cents(line.lineTotalCents))}
                      </span>
                    </div>
                  ))}
                  <div className="border-t border-white/15 pt-2 flex justify-between text-white/75">
                    <span>Subtotal</span>
                    <span>{formatUSD(cents(quote.subtotalCents))}</span>
                  </div>
                  {quote.discountCents > 0 && (
                    <div className="flex justify-between text-[#4CC75A] font-medium">
                      <span>Coupon Discount ({quote.promo.code})</span>
                      <span>-{formatUSD(cents(quote.discountCents))}</span>
                    </div>
                  )}
                  <div className="border-t border-white/20 pt-2 flex justify-between text-lg font-bold text-[#FDF3E4]">
                    <span>Total Payable</span>
                    <span className="text-[#D1AC3E]">{formatUSD(cents(quote.totalCents))}</span>
                  </div>
                </div>

                {/* Payment Method Options: Credit Card or Stripe */}
                {quote.totalCents > 0 && (
                  <div className="space-y-2">
                    <span className="block text-sm font-medium text-white">
                      Select Payment Option
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('card')}
                        aria-pressed={draft.paymentMethod === 'card'}
                        className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors cursor-pointer ${
                          draft.paymentMethod === 'card'
                            ? 'border-[#C99B24] bg-[#C99B24]/15'
                            : 'border-white/20 bg-white/[0.04] hover:border-white/40'
                        }`}
                      >
                        <CreditCard className="h-5 w-5 text-[#D1AC3E] shrink-0" />
                        <div>
                          <span className="block text-sm font-bold text-white">Credit Card</span>
                          <span className="block text-xs text-white/65">
                            Visa, Mastercard, Amex (Simulated)
                          </span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentMethod('stripe')}
                        aria-pressed={draft.paymentMethod === 'stripe'}
                        className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors cursor-pointer ${
                          draft.paymentMethod === 'stripe'
                            ? 'border-[#C99B24] bg-[#C99B24]/15'
                            : 'border-white/20 bg-white/[0.04] hover:border-white/40'
                        }`}
                      >
                        <Landmark className="h-5 w-5 text-[#D1AC3E] shrink-0" />
                        <div>
                          <span className="block text-sm font-bold text-white">Stripe</span>
                          <span className="block text-xs text-white/65">
                            Stripe Hosted Aggregator (Simulated)
                          </span>
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                {submitError && <FieldError message={submitError} />}

                <div className="pt-3 border-t border-white/15 flex items-center justify-end gap-3">
                  <Button variant="ghost" onClick={closeBookModal}>
                    Edit Details
                  </Button>
                  <Button
                    variant="primary"
                    size="lg"
                    loading={submitting}
                    disabled={!isQuoteReadyForDraft || quote.promo.status === 'rejected'}
                    onClick={() => void handleProceedToPayment()}
                  >
                    {quote.totalCents === 0
                      ? 'Confirm Free Booking ($0.00)'
                      : `Pay ${formatUSD(cents(quote.totalCents))} via ${
                          draft.paymentMethod === 'stripe' ? 'Stripe' : 'Credit Card'
                        }`}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      <SentEmailPreviewModal
        bookingId={confirmed?.bookingId ?? null}
        open={emailPreviewOpen}
        onClose={() => setEmailPreviewOpen(false)}
      />
    </>
  );
}
