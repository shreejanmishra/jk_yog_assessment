import React from 'react';

export interface BadgeProps {
  variant?: 'gold' | 'sold-out' | 'low-stock' | 'success' | 'free' | 'neutral';
  children: React.ReactNode;
  className?: string;
}

const BADGE_STYLES: Record<NonNullable<BadgeProps['variant']>, string> = {
  gold: 'border-gold/60 text-bright-gold',
  'sold-out': 'border-error/60 text-error-on-dark',
  'low-stock': 'border-bright-gold/60 text-warning-on-dark',
  success: 'border-success/60 text-success-on-dark',
  free: 'border-success/60 text-success-on-dark',
  neutral: 'border-white/25 text-white/75',
};

export function Badge({
  variant = 'gold',
  children,
  className = '',
}: BadgeProps): React.ReactElement {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-1 text-[11px] font-semibold uppercase leading-none tracking-wide ${BADGE_STYLES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
