import React from 'react';
import { ShieldAlert } from 'lucide-react';
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
    <div className="rounded-xl border border-[#C99B24]/70 bg-[#C99B24]/10 p-4 space-y-3.5 transition-all duration-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#FDF3E4]">
          <ShieldAlert className="h-4 w-4 text-[#D1AC3E] shrink-0" />
          <span>Mandatory Guardian Details ({attendeeAgeLabel})</span>
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
            className="rounded-lg border border-[#BC9226] bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-[#D1AC3E] hover:bg-[#C99B24]/20 cursor-pointer"
          >
            Same as Primary Booker
          </button>
        )}
      </div>

      <p className="text-xs text-white/75">
        Passes for anyone under 18 cannot be booked without a guardian’s name and phone number. Both
        details will be printed on this attendee’s boarding pass for gate check-in.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <TextField
          label="Guardian Full Name"
          required
          placeholder="e.g. Ramesh Sharma"
          value={guardianName}
          onChange={(e) => onChange({ name: e.target.value, phone: guardianPhone })}
          error={nameError}
        />
        <TextField
          label="Guardian Phone Number"
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
