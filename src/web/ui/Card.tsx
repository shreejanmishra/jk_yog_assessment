import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  surface?: 'glass' | 'cream';
}

export function Card({
  surface = 'glass',
  className = '',
  children,
  ...rest
}: CardProps): React.ReactElement {
  const surfaceClass =
    surface === 'cream'
      ? 'bg-[#FDF3E4] text-[#291900] border border-[#BC9226]/60 shadow-lg'
      : 'bg-white/[0.05] text-white border border-white/20 backdrop-blur-sm';

  return (
    <div className={`rounded-2xl ${surfaceClass} ${className}`} {...rest}>
      {children}
    </div>
  );
}
