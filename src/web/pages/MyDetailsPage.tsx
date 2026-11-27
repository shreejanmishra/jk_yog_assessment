import React, { useEffect, useState } from 'react';
import { ApiClientError } from '../api/http';
import { Footer } from '../components/layout/Footer';
import { Header } from '../components/layout/Header';
import { useAuthStore } from '../stores/auth-store';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';

export function MyDetailsPage(): React.ReactElement {
  const { user, openSignInModal, loginDemo, saveProfile } = useAuthStore();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setPhone(user.phone);
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      await saveProfile(fullName, phone);
      setSavedMsg('Saved.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-primary-dark text-white">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-10 sm:px-6 sm:pt-14">
        <div className="border-b border-white/10 pb-6">
          <p className="text-xs uppercase tracking-wider text-bright-gold">Account</p>
          <h1 className="mt-1 font-serif text-4xl text-cream">My details</h1>
          <p className="mt-2 text-sm text-white/65">
            Contact details pre-filled when you book festival passes.
          </p>
        </div>

        {!user ? (
          <div className="mt-8 space-y-4 rounded-card border border-white/15 p-6">
            <p className="text-sm text-white/75">
              Sign in to view and edit your profile details.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void loginDemo()}>Try demo account</Button>
              <Button variant="secondary" onClick={openSignInModal}>
                Sign in with email
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="mt-8 space-y-5">
            <TextField
              label="Full name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <TextField
              label="Email address"
              value={user.email}
              disabled
              hint="Verified email linked to your bookings"
            />
            <TextField
              label="Phone number"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              error={error}
            />

            {savedMsg && <p className="text-sm text-success-on-dark">{savedMsg}</p>}

            <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-5">
              <span className="text-xs text-white/50">
                Member since {new Date(user.createdAt).toLocaleDateString('en-US')}
              </span>
              <Button type="submit" loading={saving}>
                Save changes
              </Button>
            </div>
          </form>
        )}
      </main>
      <Footer />
    </div>
  );
}
