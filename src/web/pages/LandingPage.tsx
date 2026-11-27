import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { HeroBanner } from '../components/landing/HeroBanner';
import { Footer } from '../components/layout/Footer';
import { Header, type LandingSectionId } from '../components/layout/Header';
import { useAuthStore } from '../stores/auth-store';
import { useCatalogStore } from '../stores/catalog-store';
import { Button } from '../ui/Button';
import { SectionHeading } from '../ui/SectionHeading';

const SECTION_IDS: readonly LandingSectionId[] = ['home', 'about', 'mission', 'contribute'];

const HIGHLIGHTS = [
  {
    title: 'Raas-garba every night',
    body: 'Live music on the temple lawn from 7 pm. Bring your own dandiya sticks or add a pair to your ticket.',
  },
  {
    title: 'Two garba workshops',
    body: 'Guided sessions for beginners on Friday 11 and Sunday 13 December. Places are very limited.',
  },
  {
    title: 'Festival dinner',
    body: 'A vegetarian plate served each evening. Booking ahead tells the kitchen how many to cook for.',
  },
] as const;

const COMMITMENTS = [
  { term: 'Education', detail: 'Weekly classes in music, language and values for children and teenagers.' },
  { term: 'Seva', detail: 'Community meals and volunteer programmes open to everyone in Dallas–Fort Worth.' },
  { term: 'Wellbeing', detail: 'Free yoga, meditation and support for older members of the community.' },
] as const;

const WAYS_TO_GIVE = [
  { title: 'Annadanam', body: 'Sponsor a community meal served at the temple.', meta: 'From $51' },
  {
    title: 'Youth and arts fund',
    body: 'Help pay for instruments, costumes and teachers for children’s programmes.',
    meta: 'Any amount',
  },
  {
    title: 'Volunteer at the festival',
    body: 'Welcome families at the gate, help in the kitchen or guide parking.',
    meta: 'Temple office',
  },
] as const;

export function LandingPage(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const loadCatalog = useCatalogStore((s) => s.loadCatalog);
  const { user, openSignInModal } = useAuthStore();
  const [activeSection, setActiveSection] = useState<LandingSectionId>('home');

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // Arriving from another page via /#about etc.
  useEffect(() => {
    const hash = location.hash.replace('#', '') as LandingSectionId;
    if (!SECTION_IDS.includes(hash)) return;
    setActiveSection(hash);
    const target = document.getElementById(hash);
    if (target) {
      setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }
  }, [location.hash]);

  // Scroll-spy: highlight the section in view in the header.
  useEffect(() => {
    const elements = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) {
          setActiveSection(visible[0].target.id as LandingSectionId);
        }
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: [0, 0.25, 0.5] },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-primary-dark text-white">
      <Header activeSection={activeSection} onSelectSection={setActiveSection} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
        <section id="home" className="pt-8 sm:pt-12">
          <HeroBanner />
        </section>

        <section id="about" className="mt-24 border-t border-white/10 pt-16 sm:pt-20">
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-5">
              <SectionHeading
                title="About the festival"
                lead="Sharad Utsav celebrates the autumn full moon with five evenings of music, dance and food."
              />
            </div>
            <div className="space-y-5 text-[17px] leading-relaxed text-white/75 md:col-span-7 md:pt-9">
              <p>
                Each evening starts with aarti at 5 pm and then moves outside for raas-garba to live
                dhol and singers. Families come for a single night or for all five, and there is always
                somewhere quiet for grandparents and a corner for the little ones.
              </p>
              <p>
                Tickets are sold per person, per evening, so you only pay for the nights you come.
                Children under five come free.
              </p>
            </div>
          </div>

          <div className="mt-14 grid border-t border-white/15 sm:grid-cols-3">
            {HIGHLIGHTS.map((item, idx) => (
              <div
                key={item.title}
                className={`py-6 sm:pr-8 ${idx > 0 ? 'border-t border-white/10 sm:border-t-0 sm:border-l sm:pl-8' : ''}`}
              >
                <h3 className="font-serif text-xl text-cream">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/65">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="mission" className="mt-24">
          <div className="rounded-card bg-cream px-6 py-12 sm:px-12 sm:py-16">
            <div className="grid gap-10 md:grid-cols-12">
              <div className="md:col-span-5">
                <SectionHeading tone="light" title="Our mission" />
              </div>
              <div className="md:col-span-7 md:pt-9">
                <blockquote className="font-serif text-2xl leading-snug text-heading sm:text-[1.75rem]">
                  “A temple should be a place every generation can call home.”
                </blockquote>
                <p className="mt-6 text-[17px] leading-relaxed text-primary-text">
                  Radha Krishna Temple runs classes, community meals and wellbeing programmes
                  throughout the year. Festivals like Sharad Utsav bring the whole community
                  together, and the proceeds help keep those programmes free to attend.
                </p>
                <dl className="mt-8 divide-y divide-heading/10 border-y border-heading/15">
                  {COMMITMENTS.map((c) => (
                    <div key={c.term} className="grid gap-1 py-4 sm:grid-cols-[8rem_1fr] sm:gap-6">
                      <dt className="font-semibold text-heading">{c.term}</dt>
                      <dd className="text-primary-text">{c.detail}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </section>

        <section id="contribute" className="mt-24 border-t border-white/10 pt-16 sm:pt-20">
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-5">
              <SectionHeading
                title="Contribute to the cause"
                lead="There are many ways to support the temple beyond buying a festival ticket."
              />
            </div>
            <ul className="divide-y divide-white/10 border-y border-white/15 md:col-span-7 md:mt-9">
              {WAYS_TO_GIVE.map((way) => (
                <li key={way.title} className="grid gap-2 py-6 sm:grid-cols-[1fr_auto] sm:gap-8">
                  <div>
                    <h3 className="font-serif text-xl text-cream">{way.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-white/65">{way.body}</p>
                  </div>
                  <span className="text-sm text-white/50 sm:pt-1.5 sm:text-right">{way.meta}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-16 flex flex-col gap-5 rounded-card border border-gold/40 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div>
              <p className="font-serif text-xl text-cream">Tickets for Sharad Utsav 2026 are on sale now.</p>
              <p className="mt-1 text-sm text-white/60">Book for yourself or your whole family in a few minutes.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  if (user) {
                    navigate('/me/contributions');
                  } else {
                    sessionStorage.setItem('su_post_login_redirect', '/me/contributions');
                    openSignInModal();
                  }
                }}
              >
                My contributions
              </Button>
              <Button onClick={() => navigate('/book')}>Book tickets</Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
