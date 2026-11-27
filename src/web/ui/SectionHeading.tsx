import React from "react";

export interface SectionHeadingProps {
  title: string;
  lead?: string;
  tone?: "dark" | "light";
}

export function SectionHeading({
  title,
  lead,
  tone = "dark",
}: SectionHeadingProps): React.ReactElement {
  const isLight = tone === "light";
  return (
    <div>
      <span aria-hidden="true" className="block h-px w-10 bg-primary" />
      <h2
        className={`mt-5 font-serif text-3xl leading-tight sm:text-4xl ${
          isLight ? "text-heading" : "text-cream"
        }`}
      >
        {title}
      </h2>
      {lead && (
        <p
          className={`mt-4 max-w-md text-[17px] leading-relaxed ${
            isLight ? "text-primary-text" : "text-white/70"
          }`}
        >
          {lead}
        </p>
      )}
    </div>
  );
}
