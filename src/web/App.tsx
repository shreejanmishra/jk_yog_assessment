import React, { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { SignInModal } from './components/layout/SignInModal';
import { BookingPage } from './pages/BookingPage';
import { LandingPage } from './pages/LandingPage';
import { MyBookingsPage } from './pages/MyBookingsPage';
import { MyContributionsPage } from './pages/MyContributionsPage';
import { MyDetailsPage } from './pages/MyDetailsPage';
import { SimulatedGatewayPage } from './pages/SimulatedGatewayPage';
import { useAuthStore } from './stores/auth-store';

function AppShell(): React.ReactElement {
  const navigate = useNavigate();
  const hydrateSession = useAuthStore((s) => s.hydrateSession);
  const [offline, setOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );

  useEffect(() => {
    void hydrateSession();
  }, [hydrateSession]);

  useEffect(() => {
    const onOffline = (): void => setOffline(true);
    const onOnline = (): void => setOffline(false);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  return (
    <>
      {offline && (
        <div
          role="status"
          className="bg-[#EF1F1F]/25 border-b border-[#EF1F1F] px-4 py-2 text-center text-xs font-semibold text-[#FF7A7A] flex items-center justify-center gap-2"
        >
          <WifiOff className="h-4 w-4 text-[#EF1F1F]" />
          <span>You appear to be offline. Your booking draft is safely preserved in this tab.</span>
        </div>
      )}

      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/book" element={<BookingPage />} />
        <Route path="/pay/:bookingId" element={<SimulatedGatewayPage />} />
        <Route path="/me/details" element={<MyDetailsPage />} />
        <Route path="/me/contributions" element={<MyContributionsPage />} />
        <Route path="/me/bookings" element={<MyBookingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <SignInModal
        onSignedIn={() => {
          const redirect = sessionStorage.getItem('su_post_login_redirect');
          if (redirect) {
            sessionStorage.removeItem('su_post_login_redirect');
            navigate(redirect);
          }
        }}
      />
    </>
  );
}

export function App(): React.ReactElement {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
