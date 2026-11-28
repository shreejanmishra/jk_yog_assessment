import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, Mail } from 'lucide-react';
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
import { SegmentedControl, type SegmentedOption } from '../../../ui/SegmentedControl';
import { FieldError } from '../../../ui/TextField';
import { useBookingStore } from '../store/booking-store';
import { draftToBookingIntent } from '../store/transitions';
import { BoardingPassTicket } from './BoardingPassTicket';
import { SentEmailPreviewModal } from './SentEmailPreviewModal';

const PAYMENT_OPTIONS: readonly SegmentedOption<'card' | 'stripe'>[] = [
  { value: 'card', label: 'Credit card', description: 'Visa, Mastercard or Amex' },
  { value: 'stripe', label: 'Stripe', description: 'Simulated Stripe checkout' },
];

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
      setSubmitError(`Clear or replace invalid coupon “${quote.promo.code}” before paying.`);
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

      if (created.status === 'confirmed' || !created.paymentUrl) {
        const detail = await fetchBookingDetail(created.bookingId);
        await loadCatalog(true);
        openConfirmedModal(detail);
        return;
      }

      closeBookModal();
      navigate(created.paymentUrl);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSubmitError(err.message);
        if (err.code === 'INSUFFICIENT_STOCK' || err.code === 'PRICE_CHANGED') {
          await loadCatalog(true);
        }
      } else {
        setSubmitError('Unable to reserve passes right now. Please check your connection.');
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
        title={bookModal.stage === 'confirmed' ? 'Booking confirmed' : 'Review your booking'}
        subtitle={`${EVENT_METADATA.venue}, ${EVENT_METADATA.address}`}
        maxWidthClass="max-w-3xl"
      >
        {bookModal.stage === 'confirmed' && confirmed ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-control border border-success/50 px-4 py-3.5">
              <div>
                <p className="text-sm font-semibold text-success-on-dark">
                  Booking successful · Reference {confirmed.reference}
                </p>
                <p className="mt-0.5 text-xs text-white/65">
                  Passes and receipt sent to <span className="text-white">{confirmed.booker.email}</span>.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setEmailPreviewOpen(true)}>
                <Mail className="h-4 w-4" aria-hidden="true" />
                View sent email
              </Button>
            </div>

            {confirmed.passes.length > 1 && (
              <div className="flex items-center justify-between border-y border-white/10 py-2.5 text-sm">
                <button
                  type="button"
                  disabled={passCarouselIdx === 0}
                  onClick={() => setPassCarouselIdx((i) => Math.max(0, i - 1))}
                  className="inline-flex cursor-pointer items-center gap-1 text-bright-gold disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous pass
                </button>
                <span className="tabular text-xs text-white/65">
                  Pass {passCarouselIdx + 1} of {confirmed.passes.length}
                </span>
                <button
                  type="button"
                  disabled={passCarouselIdx >= confirmed.passes.length - 1}
                  onClick={() =>
                    setPassCarouselIdx((i) => Math.min(confirmed.passes.length - 1, i + 1))
                  }
                  className="inline-flex cursor-pointer items-center gap-1 text-bright-gold disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Next pass <ChevronRight className="h-4 w-4" aria-hidden="true" />
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

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
              <div className="flex flex-wrap gap-2.5">
                <a href={getPassesPdfUrl(confirmed.bookingId)} download>
                  <Button>
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download {confirmed.passes.length > 1 ? 'all passes (PDF)' : 'pass (PDF)'}
                  </Button>
                </a>
                {confirmed.invoice && (
                  <a href={getInvoicePdfUrl(confirmed.bookingId)} download>
                    <Button variant="secondary">
                      <Download className="h-4 w-4" aria-hidden="true" />
                      Download invoice (PDF)
                    </Button>
                  </a>
                )}
              </div>

              <Button variant="ghost" onClick={resetDraftAfterCompletion}>
                Book another pass
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {quoteState.status === 'loading' && (
              <p className="py-8 text-center text-sm text-white/60">Calculating total…</p>
            )}

            {quoteState.status === 'invalid' && (
              <div className="rounded-control border border-error/60 p-4">
                <p className="text-sm font-semibold text-error-on-dark">
                  Please check the following details:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-error-on-dark">
                  {quoteState.issues.map((iss, idx) => (
                    <li key={`${iss.code}-${idx}`}>{iss.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {quote && (
              <>
                <section aria-labelledby="review-passes-heading">
                  <h3 id="review-passes-heading" className="font-serif text-lg text-cream">
                    Passes ({quote.attendeePasses.length})
                  </h3>
                  <div className="mt-3 divide-y divide-heading/15 overflow-hidden rounded-card bg-cream text-heading">
                    {quote.attendeePasses.map((p) => (
                      <div key={p.clientId} className="space-y-1 px-5 py-4 text-sm">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-serif text-lg font-semibold">{p.fullName}</span>
                          <span className="text-xs font-medium text-primary-text">
                            {p.passLabel} · Age {p.age}
                          </span>
                        </div>
                        <p className="text-primary-text">
                          <span className="font-medium text-heading">Valid:</span>{' '}
                          {p.validDatesDisplay}
                        </p>
                        <p className="text-primary-text">
                          <span className="font-medium text-heading">Add-ons:</span>{' '}
                          {p.extrasSummary.join(' · ')}
                        </p>
                        {p.guardian && (
                          <p className="pt-0.5 text-xs font-medium text-heading">
                            Guardian: {p.guardian.name} ({p.guardian.phone})
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                {quote.warnings.length > 0 && (
                  <div className="space-y-1 rounded-control border border-bright-gold/50 px-4 py-3 text-xs text-warning-on-dark">
                    {quote.warnings.map((w, i) => (
                      <p key={i}>{w.message}</p>
                    ))}
                  </div>
                )}

                <form onSubmit={handleApplyCoupon} className="space-y-2">
                  <label htmlFor="coupon-input" className="block text-sm font-medium text-white/90">
                    Coupon code
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="coupon-input"
                      type="text"
                      placeholder="Enter coupon code"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      className="h-11 flex-1 rounded-control border border-gold bg-cream px-3.5 text-sm font-medium uppercase text-heading caret-heading placeholder:normal-case placeholder:font-normal placeholder:text-primary-text/65 transition-colors hover:border-bright-gold"
                    />
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
                    <p className="text-xs text-success-on-dark">{quote.promo.message}</p>
                  )}
                  {quote.promo.status === 'rejected' && (
                    <FieldError message={quote.promo.message} />
                  )}
                </form>

                <dl className="divide-y divide-white/10 border-y border-white/15 text-sm">
                  {quote.lines.map((line, i) => (
                    <div key={i} className="flex justify-between gap-4 py-2.5 text-white/80">
                      <dt>{line.label}</dt>
                      <dd className="tabular shrink-0">{formatUSD(cents(line.lineTotalCents))}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between py-2.5 text-white/65">
                    <dt>Subtotal</dt>
                    <dd className="tabular">{formatUSD(cents(quote.subtotalCents))}</dd>
                  </div>
                  {quote.discountCents > 0 && (
                    <div className="flex justify-between py-2.5 text-success-on-dark">
                      <dt>Discount ({quote.promo.code})</dt>
                      <dd className="tabular">-{formatUSD(cents(quote.discountCents))}</dd>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between py-3">
                    <dt className="font-serif text-lg text-cream">Total payable</dt>
                    <dd className="tabular font-serif text-2xl text-bright-gold">
                      {formatUSD(cents(quote.totalCents))}
                    </dd>
                  </div>
                </dl>

                {quote.totalCents > 0 && (
                  <div className="space-y-2">
                    <span className="block text-sm font-medium text-white/90">Payment method</span>
                    <SegmentedControl
                      label="Payment method"
                      options={PAYMENT_OPTIONS}
                      value={draft.paymentMethod}
                      onChange={setPaymentMethod}
                    />
                  </div>
                )}

                {submitError && <FieldError message={submitError} />}

                <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-4">
                  <Button variant="ghost" onClick={closeBookModal}>
                    Back to form
                  </Button>
                  <Button
                    size="lg"
                    loading={submitting}
                    disabled={!isQuoteReadyForDraft || quote.promo.status === 'rejected'}
                    onClick={() => void handleProceedToPayment()}
                  >
                    {quote.totalCents === 0
                      ? 'Confirm free booking'
                      : `Pay ${formatUSD(cents(quote.totalCents))} with ${
                          draft.paymentMethod === 'stripe' ? 'Stripe' : 'card'
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
