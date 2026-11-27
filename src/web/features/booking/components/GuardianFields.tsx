import React from 'react';
import { TextField } from '../../../ui/TextField';

export interface GuardianFieldsProps {
  attendeeAgeLabel: string;
  guardianName: string;
  guardianPhone: string;
  onChange: (next: { name: string; phone: string }) => void;
  bookerQuickFill?: { name: string; phone: string } | null;
  nameError?: string | null;
  phoneError?: string | null;
}

export function GuardianFields({
  attendeeAgeLabel,
  guardianName,
  guardianPhone,
  onChange,
  bookerQuickFill,
  nameError,
  phoneError,
}: GuardianFieldsProps): React.ReactElement {
  return (
    <div className="reveal space-y-4 rounded-card border border-gold/50 bg-white/[0.02] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h4 className="font-serif text-lg text-cream">
            Parent or guardian details{' '}
            <span className="font-sans text-xs font-normal text-bright-gold">
              · {attendeeAgeLabel}
            </span>
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-white/60">
            Required for everyone under 18. Both details are printed on this attendee’s festival
            pass for gate check-in.
          </p>
        </div>

        {bookerQuickFill && bookerQuickFill.name.trim() && bookerQuickFill.phone.trim() && (
          <button
            type="button"
            onClick={() =>
              onChange({
                name: bookerQuickFill.name,
                phone: bookerQuickFill.phone,
              })
            }
            className="cursor-pointer text-xs font-medium text-bright-gold underline-offset-4 hover:underline"
          >
            Use lead booker details
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Guardian full name"
          required
          placeholder="Ramesh Sharma"
          value={guardianName}
          onChange={(e) => onChange({ name: e.target.value, phone: guardianPhone })}
          error={nameError}
        />
        <TextField
          label="Guardian phone number"
          type="tel"
          required
          placeholder="+1 469-555-0192"
          value={guardianPhone}
          onChange={(e) => onChange({ name: guardianName, phone: e.target.value })}
          error={phoneError}
        />
      </div>
    </div>
  );
}
