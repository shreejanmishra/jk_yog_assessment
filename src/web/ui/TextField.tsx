import React from 'react';
import { AlertCircle } from 'lucide-react';

export interface FieldErrorProps {
  id?: string;
  message?: string | null;
  surface?: 'dark' | 'light';
}

/** Inline validation message with a red exclamation icon, shown directly below a field. */
export function FieldError({
  id,
  message,
  surface = 'dark',
}: FieldErrorProps): React.ReactElement | null {
  if (!message) return null;
  const textColor = surface === 'light' ? 'text-error-on-light' : 'text-error-on-dark';

  return (
    <p id={id} role="alert" className={`mt-2 flex items-start gap-1.5 text-sm ${textColor}`}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-error" aria-hidden="true" />
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

  const isLight = surface === 'light';
  const labelColor = isLight ? 'text-heading' : 'text-white/90';
  const mutedColor = isLight ? 'text-primary-text' : 'text-white/50';
  const inputColors =
    'border-gold bg-cream text-heading caret-heading placeholder:text-primary-text/65 hover:border-bright-gold';
  const errorBorder = error ? '!border-error hover:!border-error' : '';

  return (
    <div className="w-full">
      <label htmlFor={inputId} className={`mb-1.5 block text-sm font-medium ${labelColor}`}>
        {label}
        {optionalLabel && (
          <span className={`ml-2 text-xs font-normal ${mutedColor}`}>{optionalLabel}</span>
        )}
      </label>
      <input
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`block h-11 w-full rounded-control border px-3.5 text-[15px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${inputColors} ${errorBorder} ${className}`}
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className={`mt-1.5 text-xs ${mutedColor}`}>
          {hint}
        </p>
      )}
      <FieldError id={errorId} message={error} surface={surface} />
    </div>
  );
}
