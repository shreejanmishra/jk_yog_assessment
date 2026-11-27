import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'cream' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  // Primary uses dark #2C2C2C text on #C99B24 gold for 5.4:1 WCAG AA contrast
  primary:
    'bg-[#C99B24] text-[#2C2C2C] font-semibold hover:bg-[#D1AC3E] active:bg-[#BC9226] shadow-sm border border-[#D1AC3E]/40',
  secondary:
    'bg-white/5 text-white font-medium border border-[#BC9226] hover:bg-[#C99B24]/15 hover:border-[#D1AC3E]',
  cream:
    'bg-[#291900] text-[#FDF3E4] font-semibold hover:bg-[#3f2804] border border-[#BC9226]',
  ghost:
    'bg-transparent text-white/85 hover:text-white hover:bg-white/10',
  danger:
    'bg-[#EF1F1F]/15 text-[#FF7A7A] border border-[#EF1F1F]/60 hover:bg-[#EF1F1F]/25',
};

const SIZE_CLASSES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'min-h-9 px-3.5 py-1.5 text-sm rounded-lg',
  md: 'min-h-11 px-5 py-2.5 text-sm sm:text-base rounded-[10px]',
  lg: 'min-h-12 px-7 py-3 text-base rounded-xl',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps): React.ReactElement {
  const isDisabled = Boolean(disabled || loading);

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={`inline-flex items-center justify-center gap-2 transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />}
      {children}
    </button>
  );
}
