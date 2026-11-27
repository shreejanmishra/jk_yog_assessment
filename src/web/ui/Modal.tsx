import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  surface?: 'dark' | 'cream';
  footer?: React.ReactNode;
  bodyRef?: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  maxWidthClass = 'max-w-2xl',
  surface = 'dark',
  footer,
  bodyRef,
  children,
}: ModalProps): React.ReactElement | null {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = React.useId();

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const isCream = surface === 'cream';
  const panelClass = isCream
    ? 'bg-cream text-heading'
    : 'border border-white/15 bg-primary-dark text-white';
  const titleClass = isCream ? 'text-heading' : 'text-cream';
  const subtitleClass = isCream ? 'text-primary-text' : 'text-white/55';
  const dividerClass = isCream ? 'border-heading/15' : 'border-white/10';

  const modalNode = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-6"
      onSubmit={(e) => {
        // Prevent any <form> inside a modal from bubbling synthetic submit events to parent forms.
        e.stopPropagation();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex max-h-[94vh] w-full flex-col rounded-t-card shadow-2xl shadow-black/50 outline-none sm:rounded-card ${maxWidthClass} ${panelClass}`}
      >
        <div
          className={`flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4 sm:px-7 sm:py-5 ${dividerClass}`}
        >
          <div className="min-w-0">
            <h2 id={titleId} className={`font-serif text-xl sm:text-2xl ${titleClass}`}>
              {title}
            </h2>
            {subtitle && <p className={`mt-1 text-sm ${subtitleClass}`}>{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-control opacity-70 transition hover:bg-white/[0.06] hover:opacity-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
          {children}
        </div>
        {footer && (
          <div className={`shrink-0 border-t px-5 py-4 sm:px-7 ${dividerClass}`}>{footer}</div>
        )}
      </div>
    </div>
  );

  return createPortal(modalNode, document.body);
}
