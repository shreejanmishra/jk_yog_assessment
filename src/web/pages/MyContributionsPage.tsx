import React, { useEffect, useState } from 'react';
import { Calendar, HeartHandshake } from 'lucide-react';
import type { ContributionCardDTO } from '@contract/index';
import { cents, formatUSD } from '@domain/index';
import { fetchMyContributions } from '../api/endpoints';
import { Footer } from '../components/layout/Footer';
import { Header } from '../components/layout/Header';
import { useAuthStore } from '../stores/auth-store';
import { Badge } from '../ui/Badge';
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
    <div className="min-h-screen flex flex-col bg-[#2C2C2C] text-white">
      <Header />
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 pt-8 space-y-6">
        <div className="flex items-center gap-3">
          <HeartHandshake className="h-7 w-7 text-[#D1AC3E]" />
          <div>
            <h1 className="font-display text-3xl font-bold text-[#FDF3E4]">My Contributions</h1>
            <p className="text-sm text-white/70">
              Events, charities, and community seva initiatives you have supported
            </p>
          </div>
        </div>

        {!user ? (
          <Card className="p-6 space-y-4">
            <p className="text-sm text-white/80">
              Sign in to view your charity, seva, and event contribution history.
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
        ) : loading ? (
          <p className="text-sm text-white/70 py-8">Loading contribution records…</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {items.map((item) => (
              <Card key={item.id} className="p-6 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="gold" className="uppercase">
                      {item.category}
                    </Badge>
                    <Badge variant="success">{item.impactBadge}</Badge>
                  </div>

                  <div>
                    <h2 className="font-display text-xl font-bold text-[#FDF3E4]">{item.title}</h2>
                    <p className="text-xs text-[#D1AC3E] mt-0.5">{item.organization}</p>
                  </div>

                  <p className="text-sm text-white/80 leading-relaxed">{item.summary}</p>
                </div>

                <div className="pt-3 border-t border-white/15 flex items-center justify-between text-xs text-white/70">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-[#D1AC3E]" />
                    {item.contributedOn}
                  </span>
                  <span className="font-semibold text-white text-sm">
                    {item.amountCents !== null
                      ? formatUSD(cents(item.amountCents))
                      : 'Volunteer Service'}
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
