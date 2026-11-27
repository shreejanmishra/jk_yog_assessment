import React, { useState } from 'react';
import { KeyRound, Sparkles } from 'lucide-react';
import { ApiClientError } from '../../api/http';
import { useAuthStore } from '../../stores/auth-store';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { TextField } from '../../ui/TextField';

export interface SignInModalProps {
  onSignedIn?: () => void;
}

export function SignInModal({ onSignedIn }: SignInModalProps): React.ReactElement {
  const {
    signInModalOpen,
    closeSignInModal,
    loginDemo,
    sendOtp,
    confirmOtp,
    loading,
  } = useAuthStore();

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [simulatedOtp, setSimulatedOtp] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);

  const resetAndClose = (): void => {
    setError(null);
    setOtpSent(false);
    setSimulatedOtp(null);
    setCodeInput('');
    closeSignInModal();
  };

  const handleDemoSignIn = async (): Promise<void> => {
    setError(null);
    try {
      await loginDemo();
      onSignedIn?.();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to sign in to demo profile.');
    }
  };

  const handleRequestOtp = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setSendingOtp(true);
    try {
      const code = await sendOtp(
        email.trim(),
        fullName.trim() || undefined,
        phone.trim() || undefined,
      );
      setSimulatedOtp(code);
      setCodeInput(code);
      setOtpSent(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Please enter a valid email address.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    try {
      await confirmOtp(
        email.trim(),
        codeInput.trim(),
        fullName.trim() || undefined,
        phone.trim() || undefined,
      );
      resetAndClose();
      onSignedIn?.();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Invalid verification code.');
    }
  };

  return (
    <Modal
      open={signInModalOpen}
      onClose={resetAndClose}
      title="Profile Sign In"
      subtitle="Optional — view My Details, My Contributions, and past Bookings linked to your email"
      maxWidthClass="max-w-md"
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-[#BC9226]/60 bg-[#C99B24]/10 p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#D1AC3E]">
            <Sparkles className="h-4 w-4 shrink-0" />
            <span>Instant Evaluator Demo Profile</span>
          </div>
          <p className="text-xs text-white/80">
            Sign in immediately as <strong>Shreejan Mishra</strong> with pre-seeded temple seva
            contributions and profile details.
          </p>
          <Button
            variant="primary"
            size="sm"
            loading={loading}
            onClick={() => void handleDemoSignIn()}
            className="w-full"
          >
            1-Click Demo Sign In
          </Button>
        </div>

        <div className="relative flex items-center py-1">
          <div className="grow border-t border-white/15" />
          <span className="mx-3 text-xs uppercase tracking-wider text-white/50">
            or sign in with your email
          </span>
          <div className="grow border-t border-white/15" />
        </div>

        {!otpSent ? (
          <form onSubmit={(e) => void handleRequestOtp(e)} className="space-y-3.5">
            <TextField
              label="Email Address"
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={error}
            />
            <TextField
              label="Full Name"
              optionalLabel="Optional"
              placeholder="Asha Patel"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <TextField
              label="Phone Number"
              optionalLabel="Optional"
              placeholder="+1 469-555-0140"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Button type="submit" variant="secondary" loading={sendingOtp} className="w-full">
              <KeyRound className="h-4 w-4" />
              Send Simulated Login Code
            </Button>
          </form>
        ) : (
          <form onSubmit={(e) => void handleVerifyOtp(e)} className="space-y-3.5">
            {simulatedOtp && (
              <div className="rounded-lg border border-[#28A736]/60 bg-[#28A736]/15 px-3.5 py-2.5 text-xs text-[#4CC75A]">
                Simulated Email Inbox — Your 6-digit code is:{' '}
                <strong className="font-mono text-sm">{simulatedOtp}</strong> (auto-filled below)
              </div>
            )}
            <TextField
              label="6-Digit Verification Code"
              inputMode="numeric"
              maxLength={6}
              required
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              error={error}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOtpSent(false)}
                className="flex-1"
              >
                Back
              </Button>
              <Button type="submit" variant="primary" loading={loading} className="flex-1">
                Verify & Sign In
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
