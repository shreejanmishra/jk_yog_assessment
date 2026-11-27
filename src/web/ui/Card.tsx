import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  surface?: 'glass' | 'cream' | 'outline';
}

const SURFACE_CLASSES: Record<NonNullable<CardProps['surface']>, string> = {
  glass: 'border border-glass-border bg-glass text-white',
  cream: 'bg-cream text-heading',
  outline: 'border border-white/15 text-white',
};

export function Card({
  surface = 'glass',
  className = '',
  children,
  ...rest
}: CardProps): React.ReactElement {
  return (
    <div className={`rounded-card ${SURFACE_CLASSES[surface]} ${className}`} {...rest}>
      {children}
    </div>
  );
}
