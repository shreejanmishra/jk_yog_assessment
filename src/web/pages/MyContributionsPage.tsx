import React, { useEffect, useState } from 'react';
import type { ContributionCardDTO } from '@contract/index';
import { cents, formatUSD } from '@domain/index';
import { fetchMyContributions } from '../api/endpoints';
import { Footer } from '../components/layout/Footer';
import { Header } from '../components/layout/Header';
import { useAuthStore } from '../stores/auth-store';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

export function MyContributionsPage(): React.ReactElement {
  const { user, loginDemo, openSignInModal } = useAuthStore();
  const [items, setItems] = useState<ContributionCardDTO[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetchMyContributions()
      .then((res) => setItems(res.contributions))
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <div className="flex min-h-screen flex-col bg-primary-dark text-white">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-10 sm:px-6 sm:pt-14">
        <div className="border-b border-white/10 pb-6">
          <p className="text-xs uppercase tracking-wider text-bright-gold">Account</p>
          <h1 className="mt-1 font-serif text-4xl text-cream">My contributions</h1>
          <p className="mt-2 text-sm text-white/65">
            Events, charities and community seva initiatives you have supported.
          </p>
        </div>

        {!user ? (
          <div className="mt-8 space-y-4 rounded-card border border-gold bg-cream p-6 text-heading shadow-sm">
            <p className="text-sm text-primary-text">
              Sign in to view your charity, seva and event contribution history.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void loginDemo()}>Try demo account</Button>
              <Button variant="dark" onClick={openSignInModal}>
                Sign in with email
              </Button>
            </div>
          </div>
        ) : loading ? (
          <p className="py-10 text-sm text-white/60">Loading contributions…</p>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <Card
                key={item.id}
                surface="cream"
                className="flex flex-col justify-between space-y-5 border border-gold p-6 shadow-sm"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center rounded-full border border-gold/40 bg-heading/[0.06] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-heading">
                      {item.category}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-success/40 bg-success/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-success-on-light">
                      {item.impactBadge}
                    </span>
                  </div>

                  <div>
                    <h2 className="font-serif text-xl font-bold text-heading">{item.title}</h2>
                    <p className="mt-0.5 text-xs font-medium text-primary-text">
                      {item.organization}
                    </p>
                  </div>

                  <p className="text-sm leading-relaxed text-primary-text">{item.summary}</p>
                </div>

                <div className="flex items-baseline justify-between border-t border-heading/12 pt-3.5 text-xs text-primary-text">
                  <span>{item.contributedOn}</span>
                  <span className="tabular text-sm font-bold text-heading">
                    {item.amountCents !== null
                      ? formatUSD(cents(item.amountCents))
                      : 'Volunteer service'}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
