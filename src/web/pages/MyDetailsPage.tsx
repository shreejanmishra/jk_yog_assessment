import React, { useEffect, useState } from 'react';
import { CheckCircle2, User } from 'lucide-react';
import { Footer } from '../components/layout/Footer';
import { Header } from '../components/layout/Header';
import { ApiClientError } from '../api/http';
import { useAuthStore } from '../stores/auth-store';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
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
      setSavedMsg('Profile details updated.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#2C2C2C] text-white">
      <Header />
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 sm:px-6 pt-8 space-y-6">
        <div className="flex items-center gap-3">
          <User className="h-7 w-7 text-[#D1AC3E]" />
          <div>
            <h1 className="font-display text-3xl font-bold text-[#FDF3E4]">My Details</h1>
            <p className="text-sm text-white/70">Manage your contact information for temple bookings</p>
          </div>
        </div>

        {!user ? (
          <Card className="p-6 space-y-4">
            <p className="text-sm text-white/80">
              Sign in to view and manage your profile owner details.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" onClick={() => void loginDemo()}>
                1-Click Demo Sign In
              </Button>
              <Button variant="secondary" onClick={openSignInModal}>
                Sign In with Email
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-6 sm:p-8">
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
              <TextField
                label="Full Name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <TextField
                label="Email Address"
                value={user.email}
                disabled
                hint="Verified account email used to link your festival bookings"
              />
              <TextField
                label="Phone Number"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                error={error}
              />

              {savedMsg && (
                <p className="flex items-center gap-1.5 text-sm font-medium text-[#4CC75A]">
                  <CheckCircle2 className="h-4 w-4 text-[#28A736]" />
                  <span>{savedMsg}</span>
                </p>
              )}

              <div className="pt-2 flex items-center justify-between gap-4 border-t border-white/15">
                <span className="text-xs text-white/55">
                  Member since {new Date(user.createdAt).toLocaleDateString('en-US')}
                </span>
                <Button type="submit" variant="primary" loading={saving}>
                  Save Changes
                </Button>
              </div>
            </form>
          </Card>
        )}
      </main>
      <Footer />
    </div>
  );
}
