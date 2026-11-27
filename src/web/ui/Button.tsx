import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'link' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  // Dark text on gold keeps 5.4:1 contrast; white on gold would fail AA.
  primary: 'bg-primary font-semibold text-primary-dark hover:bg-bright-gold',
  secondary:
    'border border-gold/70 font-medium text-white hover:border-bright-gold hover:bg-white/[0.04]',
  ghost: 'font-medium text-white/75 hover:bg-white/[0.06] hover:text-white',
  danger: 'border border-error/60 font-medium text-error-on-dark hover:bg-error/10',
  link: 'font-medium text-bright-gold underline-offset-4 hover:underline',
  // For use on cream surfaces.
  dark: 'bg-heading font-semibold text-cream hover:bg-black',
};

const SIZE_CLASSES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-6 text-[15px]',
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
  const sizeClass = variant === 'link' ? 'text-sm' : SIZE_CLASSES[size];

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-control transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${VARIANT_CLASSES[variant]} ${sizeClass} ${className}`}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
