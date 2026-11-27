import React from 'react';

export interface BadgeProps {
  variant?: 'gold' | 'sold-out' | 'low-stock' | 'success' | 'free' | 'neutral';
  children: React.ReactNode;
  className?: string;
}

const BADGE_STYLES: Record<NonNullable<BadgeProps['variant']>, string> = {
  gold: 'bg-[#C99B24]/20 text-[#D1AC3E] border-[#BC9226]/60',
  'sold-out': 'bg-[#EF1F1F]/20 text-[#FF7A7A] border-[#EF1F1F]/60',
  'low-stock': 'bg-[#C99B24]/25 text-[#F5C76B] border-[#D1AC3E]/70',
  success: 'bg-[#28A736]/20 text-[#4CC75A] border-[#28A736]/60',
  free: 'bg-[#28A736]/20 text-[#4CC75A] border-[#28A736]/60',
  neutral: 'bg-white/10 text-white/80 border-white/20',
};

export function Badge({
  variant = 'gold',
  children,
  className = '',
}: BadgeProps): React.ReactElement {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${BADGE_STYLES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
