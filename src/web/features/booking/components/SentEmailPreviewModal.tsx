import React, { useEffect, useState } from 'react';
import { Mail, Paperclip } from 'lucide-react';
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
        if (active) setError('Unable to load simulated confirmation email.');
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
      title="Simulated Confirmation Email"
      subtitle="Stored in the server email outbox (zero external DNS setup required)"
      maxWidthClass="max-w-3xl"
    >
      {loading && <p className="text-sm text-white/70 py-8 text-center">Loading email outbox record…</p>}
      {error && <p className="text-sm text-[#FF7A7A] py-4">{error}</p>}
      {email && !loading && (
        <div className="space-y-4">
          <div className="rounded-xl bg-white/[0.06] border border-white/15 p-4 text-xs sm:text-sm space-y-1.5">
            <div className="flex items-center gap-2 text-[#D1AC3E] font-semibold">
              <Mail className="h-4 w-4" />
              <span>Message ID: {email.simulatedMessageId}</span>
            </div>
            <div>
              <span className="text-white/60">From:</span> {email.fromEmail}
            </div>
            <div>
              <span className="text-white/60">To:</span> <strong>{email.toEmail}</strong>
            </div>
            <div>
              <span className="text-white/60">Subject:</span> <strong>{email.subject}</strong>
            </div>
            <div className="pt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs text-white/70">
                <Paperclip className="h-3.5 w-3.5 text-[#D1AC3E]" /> Attachments:
              </span>
              {email.attachments.map((att) => (
                <a
                  key={att.filename}
                  href={att.url}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#BC9226] bg-[#C99B24]/15 px-2.5 py-1 text-xs font-semibold text-[#D1AC3E] hover:bg-[#C99B24]/25"
                >
                  {att.filename}
                </a>
              ))}
            </div>
          </div>

          <div
            className="rounded-xl overflow-hidden border border-white/20 bg-[#1f1f1f] p-3"
            dangerouslySetInnerHTML={{ __html: email.htmlBody }}
          />
        </div>
      )}
    </Modal>
  );
}
