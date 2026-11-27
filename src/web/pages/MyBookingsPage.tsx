import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Mail,
  MapPin,
  Ticket,
  Users,
} from 'lucide-react';
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
    <div className="min-h-screen flex flex-col bg-[#2C2C2C] text-white">
      <Header />
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 pt-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Ticket className="h-7 w-7 text-[#D1AC3E]" />
            <div>
              <h1 className="font-display text-3xl font-bold text-[#FDF3E4]">My Bookings</h1>
              <p className="text-sm text-white/70">
                View your festival bookings, itemized invoices, and downloadable boarding passes
              </p>
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={() => navigate('/book')}>
            Book More Passes
          </Button>
        </div>

        {!user ? (
          <Card className="p-6 space-y-4">
            <p className="text-sm text-white/80">
              Sign in with the email used during booking (or try the Demo Profile) to inspect your
              passes and invoices.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" onClick={() => void loginDemo()}>
                1-Click Demo Sign In
              </Button>
              <Button variant="secondary" onClick={openSignInModal}>
                Sign In with Email
              </Button>
            </div>
          </Card>
        ) : loading ? (
          <p className="text-sm text-white/70 py-8">Loading your bookings…</p>
        ) : bookings.length === 0 ? (
          <Card className="p-8 text-center space-y-4">
            <p className="font-display text-xl text-[#FDF3E4]">
              No bookings found yet for {user.email}
            </p>
            <p className="text-sm text-white/70 max-w-md mx-auto">
              Book an Individual or Group pass using <strong>{user.email}</strong> and your
              boarding passes and invoice will automatically appear here.
            </p>
            <Button variant="primary" onClick={() => navigate('/book')}>
              Book Sharad Utsav 2026 Passes
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {bookings.map((bk) => (
              <Card key={bk.bookingId} className="p-6 flex flex-col justify-between space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-[#D1AC3E]">
                      {bk.reference}
                    </span>
                    <Badge variant={bk.status === 'confirmed' ? 'success' : 'low-stock'}>
                      {bk.status === 'confirmed' ? 'Confirmed' : 'Pending Payment'}
                    </Badge>
                  </div>

                  <div>
                    <h2 className="font-display text-2xl font-bold text-[#FDF3E4]">
                      {bk.event.name}
                    </h2>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-white/75">
                      <MapPin className="h-3.5 w-3.5 text-[#D1AC3E]" />
                      {bk.event.venue}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-white/75">
                      <CalendarDays className="h-3.5 w-3.5 text-[#D1AC3E]" />
                      {bk.event.datesLabel}
                    </p>
                  </div>

                  <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-1.5 text-white/80">
                      <Users className="h-4 w-4 text-[#D1AC3E]" />
                      {bk.passes.length} Pass{bk.passes.length === 1 ? '' : 'es'} ({bk.mode})
                    </span>
                    <span className="font-bold text-[#FDF3E4]">
                      {formatUSD(cents(bk.totalCents))}
                    </span>
                  </div>
                </div>

                {/* Bottom card icon actions: Invoice Modal & Pass Modal */}
                {bk.status === 'confirmed' ? (
                  <div className="pt-3 border-t border-white/15 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setInvoiceModalBooking(bk)}
                        aria-label={`Open invoice for ${bk.reference}`}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#BC9226]/70 bg-white/[0.06] px-3.5 py-2 text-xs font-semibold text-[#FDF3E4] hover:bg-[#C99B24]/20 transition-colors cursor-pointer"
                      >
                        <FileText className="h-4 w-4 text-[#D1AC3E]" />
                        <span>Invoice</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPassIndex(0);
                          setPassModalBooking(bk);
                        }}
                        aria-label={`Open passes for ${bk.reference}`}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#C99B24] bg-[#C99B24] px-3.5 py-2 text-xs font-bold text-[#2C2C2C] hover:bg-[#D1AC3E] transition-colors cursor-pointer"
                      >
                        <Ticket className="h-4 w-4" />
                        <span>Pass ({bk.passes.length})</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setEmailBookingId(bk.bookingId)}
                      aria-label={`Preview confirmation email for ${bk.reference}`}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs text-white/75 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <Mail className="h-4 w-4 text-[#D1AC3E]" />
                      <span>Sent Email</span>
                    </button>
                  </div>
                ) : (
                  <div className="pt-3 border-t border-white/15 flex justify-end">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => navigate(`/pay/${bk.bookingId}?method=${bk.paymentMethod}`)}
                    >
                      Complete Payment
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Invoice Details + Download PDF Modal */}
      <Modal
        open={Boolean(invoiceModalBooking)}
        onClose={() => setInvoiceModalBooking(null)}
        title="Festival Booking Invoice"
        subtitle={
          invoiceModalBooking
            ? `${invoiceModalBooking.event.name} · Ref ${invoiceModalBooking.reference}`
            : undefined
        }
        maxWidthClass="max-w-2xl"
      >
        {invoiceModalBooking && <InvoiceView booking={invoiceModalBooking} />}
      </Modal>

      {/* Boarding Pass Details + Download PDF Modal */}
      <Modal
        open={Boolean(passModalBooking)}
        onClose={() => setPassModalBooking(null)}
        title="Festival Boarding Passes"
        subtitle={
          passModalBooking
            ? `${passModalBooking.event.name} · ${passModalBooking.passes.length} Passholder(s)`
            : undefined
        }
        maxWidthClass="max-w-3xl"
      >
        {passModalBooking && activePass && (
          <div className="space-y-4">
            {passModalBooking.passes.length > 1 && (
              <div className="flex items-center justify-between rounded-xl bg-white/[0.06] px-4 py-2.5 text-sm">
                <button
                  type="button"
                  disabled={passIndex === 0}
                  onClick={() => setPassIndex((i) => Math.max(0, i - 1))}
                  className="inline-flex items-center gap-1 text-[#D1AC3E] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </button>
                <span className="text-xs font-semibold text-white/85">
                  Pass {passIndex + 1} of {passModalBooking.passes.length} — {activePass.fullName}
                </span>
                <button
                  type="button"
                  disabled={passIndex >= passModalBooking.passes.length - 1}
                  onClick={() =>
                    setPassIndex((i) => Math.min(passModalBooking.passes.length - 1, i + 1))
                  }
                  className="inline-flex items-center gap-1 text-[#D1AC3E] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}

            <BoardingPassTicket
              bookingId={passModalBooking.bookingId}
              reference={passModalBooking.reference}
              pass={activePass}
            />

            <div className="pt-3 border-t border-white/15 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-white/65">
                PDF formatted like an airline boarding pass (1 page per attendee)
              </span>
              <a href={getPassesPdfUrl(passModalBooking.bookingId)} download>
                <Button variant="primary">
                  <Download className="h-4 w-4" />
                  Download All Passes as PDF
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
