import React, { useState } from 'react';
import { ApiClientError } from '../../api/http';
import { useAuthStore } from '../../stores/auth-store';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { TextField } from '../../ui/TextField';

export interface SignInModalProps {
  onSignedIn?: () => void;
}

export function SignInModal({ onSignedIn }: SignInModalProps): React.ReactElement {
  const { signInModalOpen, closeSignInModal, loginDemo, sendOtp, confirmOtp, loading } =
    useAuthStore();

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
      setError(err instanceof ApiClientError ? err.message : 'Couldn’t sign in to the demo account.');
    }
  };

  const handleRequestOtp = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setSendingOtp(true);
    try {
      const code = await sendOtp(email.trim(), fullName.trim() || undefined, phone.trim() || undefined);
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
      await confirmOtp(email.trim(), codeInput.trim(), fullName.trim() || undefined, phone.trim() || undefined);
      resetAndClose();
      onSignedIn?.();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'That code didn’t work.');
    }
  };

  return (
    <Modal
      open={signInModalOpen}
      onClose={resetAndClose}
      title="Sign in"
      subtitle="Optional. See your details, contributions and past bookings."
      maxWidthClass="max-w-md"
    >
      <div className="space-y-6">
        {!otpSent ? (
          <form onSubmit={(e) => void handleRequestOtp(e)} className="space-y-4">
            <TextField
              label="Email address"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={error}
            />
            <TextField
              label="Full name"
              optionalLabel="Optional"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <TextField
              label="Phone number"
              optionalLabel="Optional"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Button type="submit" loading={sendingOtp} className="w-full">
              Email me a sign-in code
            </Button>
            <p className="text-xs leading-relaxed text-white/50">
              Bookings made with this email address will appear in your account.
            </p>
          </form>
        ) : (
          <form onSubmit={(e) => void handleVerifyOtp(e)} className="space-y-4">
            {simulatedOtp && (
              <div className="rounded-control border border-white/15 px-4 py-3 text-sm text-white/75">
                Email delivery is simulated in this demo. Your code is{' '}
                <span className="tabular font-mono font-semibold text-white">{simulatedOtp}</span>,
                and we’ve filled it in for you.
              </div>
            )}
            <TextField
              label="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              error={error}
            />
            <div className="flex gap-3">
              <Button type="button" variant="ghost" onClick={() => setOtpSent(false)} className="flex-1">
                Back
              </Button>
              <Button type="submit" loading={loading} className="flex-1">
                Sign in
              </Button>
            </div>
          </form>
        )}

        <div className="border-t border-white/10 pt-5">
          <p className="text-sm text-white/70">Reviewing the project?</p>
          <Button
            variant="secondary"
            loading={loading && !otpSent}
            onClick={() => void handleDemoSignIn()}
            className="mt-3 w-full"
          >
            Use the demo account
          </Button>
        </div>
      </div>
    </Modal>
  );
}
