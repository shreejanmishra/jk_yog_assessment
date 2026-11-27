import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, FileText, Mail, Ticket } from 'lucide-react';
import type { BookingDetailResponseDTO } from '@contract/index';
import { cents, formatUSD } from '@domain/index';
import { fetchMyBookings, getPassesPdfUrl } from '../api/endpoints';
import { Footer } from '../components/layout/Footer';
import { Header } from '../components/layout/Header';
import { BoardingPassTicket } from '../features/booking/components/BoardingPassTicket';
import { InvoiceView } from '../features/booking/components/InvoiceView';
import { SentEmailPreviewModal } from '../features/booking/components/SentEmailPreviewModal';
import { useAuthStore } from '../stores/auth-store';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';

export function MyBookingsPage(): React.ReactElement {
  const navigate = useNavigate();
  const { user, loginDemo, openSignInModal } = useAuthStore();
  const [bookings, setBookings] = useState<BookingDetailResponseDTO[]>([]);
  const [loading, setLoading] = useState(false);

  const [invoiceModalBooking, setInvoiceModalBooking] = useState<BookingDetailResponseDTO | null>(
    null,
  );
  const [passModalBooking, setPassModalBooking] = useState<BookingDetailResponseDTO | null>(null);
  const [passIndex, setPassIndex] = useState(0);
  const [emailBookingId, setEmailBookingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetchMyBookings()
      .then((res) => setBookings(res.bookings))
      .finally(() => setLoading(false));
  }, [user]);

  const activePass = passModalBooking?.passes[passIndex];

  return (
    <div className="flex min-h-screen flex-col bg-primary-dark text-white">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-10 sm:px-6 sm:pt-14">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <p className="text-xs uppercase tracking-wider text-bright-gold">Account</p>
            <h1 className="mt-1 font-serif text-4xl text-cream">My bookings</h1>
            <p className="mt-2 text-sm text-white/65">
              Open your festival passes or itemized invoice and download either as a PDF.
            </p>
          </div>
          <Button size="sm" onClick={() => navigate('/book')}>
            Book tickets
          </Button>
        </div>

        {!user ? (
          <div className="mt-8 space-y-4 rounded-card border border-white/15 p-6">
            <p className="text-sm text-white/75">
              Sign in with the email address you used during booking (or try the demo account) to
              view your passes and invoices.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void loginDemo()}>Try demo account</Button>
              <Button variant="secondary" onClick={openSignInModal}>
                Sign in with email
              </Button>
            </div>
          </div>
        ) : loading ? (
          <p className="py-10 text-sm text-white/60">Loading bookings…</p>
        ) : bookings.length === 0 ? (
          <div className="mt-8 space-y-4 rounded-card border border-white/15 p-8">
            <h2 className="font-serif text-2xl text-cream">No bookings yet for {user.email}</h2>
            <p className="max-w-md text-sm text-white/65">
              Book an individual or group pass using {user.email} and your passes and invoice will
              appear here.
            </p>
            <Button onClick={() => navigate('/book')}>Book Sharad Utsav passes</Button>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
            {bookings.map((bk) => (
              <Card
                key={bk.bookingId}
                surface="outline"
                className="flex flex-col justify-between space-y-5 p-6"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="tabular font-mono text-xs text-bright-gold">
                      {bk.reference}
                    </span>
                    <Badge variant={bk.status === 'confirmed' ? 'success' : 'low-stock'}>
                      {bk.status === 'confirmed' ? 'Confirmed' : 'Pending payment'}
                    </Badge>
                  </div>

                  <div>
                    <h2 className="font-serif text-2xl text-cream">{bk.event.name}</h2>
                    <p className="mt-1 text-xs text-white/60">
                      {bk.event.venue} · {bk.event.datesLabel}
                    </p>
                  </div>

                  <dl className="flex items-baseline justify-between border-t border-white/10 pt-3 text-sm">
                    <dt className="text-white/70">
                      {bk.passes.length} {bk.passes.length === 1 ? 'pass' : 'passes'} ({bk.mode})
                    </dt>
                    <dd className="tabular font-serif text-xl text-cream">
                      {formatUSD(cents(bk.totalCents))}
                    </dd>
                  </dl>
                </div>

                {/* Required UX: Invoice icon and Pass icon at the bottom of the card opening modals with Download as PDF */}
                {bk.status === 'confirmed' ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label={`Open invoice for ${bk.reference}`}
                        onClick={() => setInvoiceModalBooking(bk)}
                      >
                        <FileText className="h-4 w-4 text-bright-gold" aria-hidden="true" />
                        <span>Invoice</span>
                      </Button>

                      <Button
                        size="sm"
                        aria-label={`Open passes for ${bk.reference}`}
                        onClick={() => {
                          setPassIndex(0);
                          setPassModalBooking(bk);
                        }}
                      >
                        <Ticket className="h-4 w-4" aria-hidden="true" />
                        <span>Pass ({bk.passes.length})</span>
                      </Button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setEmailBookingId(bk.bookingId)}
                      aria-label={`Preview confirmation email for ${bk.reference}`}
                      className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-control px-2.5 text-xs text-white/65 hover:bg-white/[0.05] hover:text-white"
                    >
                      <Mail className="h-3.5 w-3.5 text-bright-gold" aria-hidden="true" />
                      <span>Sent email</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex justify-end border-t border-white/10 pt-4">
                    <Button
                      size="sm"
                      onClick={() => navigate(`/pay/${bk.bookingId}?method=${bk.paymentMethod}`)}
                    >
                      Complete payment
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>

      <Modal
        open={Boolean(invoiceModalBooking)}
        onClose={() => setInvoiceModalBooking(null)}
        title="Booking invoice"
        subtitle={
          invoiceModalBooking
            ? `${invoiceModalBooking.event.name} · Ref ${invoiceModalBooking.reference}`
            : undefined
        }
        maxWidthClass="max-w-2xl"
      >
        {invoiceModalBooking && <InvoiceView booking={invoiceModalBooking} />}
      </Modal>

      <Modal
        open={Boolean(passModalBooking)}
        onClose={() => setPassModalBooking(null)}
        title="Boarding passes"
        subtitle={
          passModalBooking
            ? `${passModalBooking.event.name} · ${passModalBooking.passes.length} ${
                passModalBooking.passes.length === 1 ? 'passholder' : 'passholders'
              }`
            : undefined
        }
        maxWidthClass="max-w-3xl"
      >
        {passModalBooking && activePass && (
          <div className="space-y-5">
            {passModalBooking.passes.length > 1 && (
              <div className="flex items-center justify-between border-y border-white/10 py-2.5 text-sm">
                <button
                  type="button"
                  disabled={passIndex === 0}
                  onClick={() => setPassIndex((i) => Math.max(0, i - 1))}
                  className="inline-flex cursor-pointer items-center gap-1 text-bright-gold disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
                </button>
                <span className="tabular text-xs text-white/70">
                  Pass {passIndex + 1} of {passModalBooking.passes.length} — {activePass.fullName}
                </span>
                <button
                  type="button"
                  disabled={passIndex >= passModalBooking.passes.length - 1}
                  onClick={() =>
                    setPassIndex((i) => Math.min(passModalBooking.passes.length - 1, i + 1))
                  }
                  className="inline-flex cursor-pointer items-center gap-1 text-bright-gold disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            <BoardingPassTicket
              bookingId={passModalBooking.bookingId}
              reference={passModalBooking.reference}
              pass={activePass}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
              <span className="text-xs text-white/55">
                One boarding-pass page per attendee
              </span>
              <a href={getPassesPdfUrl(passModalBooking.bookingId)} download>
                <Button>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download as PDF
                </Button>
              </a>
            </div>
          </div>
        )}
      </Modal>

      <SentEmailPreviewModal
        bookingId={emailBookingId}
        open={Boolean(emailBookingId)}
        onClose={() => setEmailBookingId(null)}
      />

      <Footer />
    </div>
  );
}
