import React, { useEffect, useState } from 'react';
import { Paperclip } from 'lucide-react';
import type { SimulatedEmailResponseDTO } from '@contract/index';
import { fetchSimulatedEmail } from '../../../api/endpoints';
import { Modal } from '../../../ui/Modal';

export interface SentEmailPreviewModalProps {
  bookingId: string | null;
  open: boolean;
  onClose: () => void;
}

export function SentEmailPreviewModal({
  bookingId,
  open,
  onClose,
}: SentEmailPreviewModalProps): React.ReactElement | null {
  const [email, setEmail] = useState<SimulatedEmailResponseDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !bookingId) return;
    let active = true;
    setLoading(true);
    setError(null);
    fetchSimulatedEmail(bookingId)
      .then((res) => {
        if (active) setEmail(res);
      })
      .catch(() => {
        if (active) setError('Unable to load the confirmation email.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, bookingId]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sent confirmation email"
      subtitle="Recorded in the simulated email outbox"
      maxWidthClass="max-w-3xl"
    >
      {loading && <p className="py-8 text-center text-sm text-white/60">Loading email…</p>}
      {error && <p className="py-4 text-sm text-error-on-dark">{error}</p>}
      {email && !loading && (
        <div className="space-y-5">
          <dl className="space-y-1.5 border-b border-white/10 pb-4 text-sm">
            <div className="grid grid-cols-[4.5rem_1fr] gap-2">
              <dt className="text-white/50">From</dt>
              <dd className="text-white/85">{email.fromEmail}</dd>
            </div>
            <div className="grid grid-cols-[4.5rem_1fr] gap-2">
              <dt className="text-white/50">To</dt>
              <dd className="font-medium text-white">{email.toEmail}</dd>
            </div>
            <div className="grid grid-cols-[4.5rem_1fr] gap-2">
              <dt className="text-white/50">Subject</dt>
              <dd className="font-medium text-white">{email.subject}</dd>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="inline-flex items-center gap-1 text-xs text-white/55">
                <Paperclip className="h-3.5 w-3.5 text-bright-gold" aria-hidden="true" />
                Attachments:
              </span>
              {email.attachments.map((att) => (
                <a
                  key={att.filename}
                  href={att.url}
                  download
                  className="rounded-sm border border-gold/60 px-2.5 py-1 text-xs font-medium text-bright-gold hover:border-bright-gold hover:text-cream"
                >
                  {att.filename}
                </a>
              ))}
            </div>
          </dl>

          <div
            className="overflow-hidden rounded-control border border-white/15 bg-white p-3"
            dangerouslySetInnerHTML={{ __html: email.htmlBody }}
          />
        </div>
      )}
    </Modal>
  );
}
