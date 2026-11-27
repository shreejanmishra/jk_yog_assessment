import React from "react";

export interface FormSectionProps {
  title: string;
  description?: string;
  step?: string | null;
  level?: 2 | 3;
  action?: React.ReactNode;
  children: React.ReactNode;
}

/** A titled group of form fields, separated from the previous group by a hairline. */
export function FormSection({
  title,
  description,
  step,
  level = 2,
  action,
  children,
}: FormSectionProps): React.ReactElement {
  const Heading = level === 2 ? "h2" : "h3";

  return (
    <section className="border-t border-white/10 pt-8 first:border-t-0 first:pt-0">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {step && (
            <span
              aria-hidden="true"
              className="tabular mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold/70 text-xs font-semibold text-bright-gold"
            >
              {step}
            </span>
          )}
          <div>
            <Heading className="font-serif text-xl text-cream">{title}</Heading>
            {description && (
              <p className="mt-1 text-sm text-white/60">{description}</p>
            )}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
