import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  surface?: 'dark' | 'cream';
  children: React.ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  maxWidthClass = 'max-w-2xl',
  surface = 'dark',
  children,
}: ModalProps): React.ReactElement | null {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const panelClass =
    surface === 'cream'
      ? 'bg-[#FDF3E4] text-[#291900] border border-[#BC9226]'
      : 'bg-[#2C2C2C] text-white border border-[#BC9226]/70';

  const subtitleClass = surface === 'cream' ? 'text-[#645743]' : 'text-white/70';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`relative w-full ${maxWidthClass} max-h-[92vh] flex flex-col rounded-2xl shadow-2xl ${panelClass}`}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6 border-b border-[#BC9226]/30 shrink-0">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold">{title}</h2>
            {subtitle && <p className={`mt-0.5 text-xs sm:text-sm ${subtitleClass}`}>{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg hover:bg-black/10 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-5 sm:px-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
