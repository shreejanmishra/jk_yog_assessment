import React from 'react';
import { AlertCircle } from 'lucide-react';

export interface FieldErrorProps {
  id?: string;
  message?: string | null;
  surface?: 'dark' | 'light';
}

export function FieldError({
  id,
  message,
  surface = 'dark',
}: FieldErrorProps): React.ReactElement | null {
  if (!message) return null;
  const textColor = surface === 'light' ? 'text-[#C41818]' : 'text-[#FF7A7A]';

  return (
    <p id={id} role="alert" className={`mt-1.5 flex items-start gap-1.5 text-xs sm:text-sm font-medium ${textColor}`}>
      <AlertCircle
        className="h-4 w-4 shrink-0 text-[#EF1F1F] mt-0.5"
        aria-label="Validation error"
      />
      <span>{message}</span>
    </p>
  );
}

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
  surface?: 'dark' | 'light';
  optionalLabel?: string;
}

export function TextField({
  id,
  label,
  hint,
  error,
  surface = 'dark',
  optionalLabel,
  className = '',
  ...rest
}: TextFieldProps): React.ReactElement {
  const reactId = React.useId();
  const inputId = id ?? reactId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  const labelColor = surface === 'light' ? 'text-[#291900]' : 'text-white';
  const hintColor = surface === 'light' ? 'text-[#645743]' : 'text-white/65';
  const baseInput =
    surface === 'light'
      ? 'bg-white text-[#291900] placeholder:text-[#645743]/60 border-[#BC9226]/50 focus:border-[#291900]'
      : 'bg-white/[0.06] text-white placeholder:text-white/40 border-white/25 focus:border-[#D1AC3E]';
  const errorBorder = error ? 'border-[#EF1F1F] focus:border-[#EF1F1F]' : '';

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <label htmlFor={inputId} className={`text-sm font-medium ${labelColor}`}>
          {label}
        </label>
        {optionalLabel && (
          <span className={`text-xs ${hintColor}`}>{optionalLabel}</span>
        )}
      </div>
      <input
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`w-full min-h-11 rounded-[10px] border px-3.5 py-2.5 text-base transition-colors ${baseInput} ${errorBorder} ${className}`}
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className={`mt-1 text-xs ${hintColor}`}>
          {hint}
        </p>
      )}
      <FieldError id={errorId} message={error} surface={surface} />
    </div>
  );
}
