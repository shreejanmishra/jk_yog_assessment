import React from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export interface SegmentedControlProps<T extends string> {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>): React.ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-1 rounded-control border border-white/15 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`cursor-pointer rounded-[7px] px-3 py-2.5 text-left transition-colors sm:px-4 ${
              active
                ? 'bg-primary text-primary-dark'
                : 'text-white/75 hover:bg-white/[0.05] hover:text-white'
            }`}
          >
            <span className="block text-sm font-semibold">{opt.label}</span>
            {opt.description && (
              <span className={`mt-0.5 block text-xs ${active ? '' : 'text-white/50'}`}>
                {opt.description}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

