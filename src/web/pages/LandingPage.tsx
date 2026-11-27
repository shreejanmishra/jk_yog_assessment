import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, Flame, HeartHandshake, Music, Sparkles, Users } from 'lucide-react';
import { HeroBanner } from '../components/landing/HeroBanner';
import { Footer } from '../components/layout/Footer';
import { Header, type LandingSectionId } from '../components/layout/Header';
import { useAuthStore } from '../stores/auth-store';
import { useCatalogStore } from '../stores/catalog-store';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

const SECTION_IDS: readonly LandingSectionId[] = ['home', 'about', 'mission', 'contribute'];

export function LandingPage(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const loadCatalog = useCatalogStore((s) => s.loadCatalog);
  const { user, openSignInModal } = useAuthStore();
  const [activeSection, setActiveSection] = useState<LandingSectionId>('home');

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // Smooth scroll if arriving via /#about, /#mission, or /#contribute
  useEffect(() => {
    const hash = location.hash.replace('#', '') as LandingSectionId;
    if (SECTION_IDS.includes(hash)) {
      setActiveSection(hash);
      const target = document.getElementById(hash);
      if (target) {
        setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      }
    }
  }, [location.hash]);

  // Scroll-spy: highlights the corresponding section in the sticky Header as user scrolls down
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
      {
        rootMargin: '-25% 0px -55% 0px',
        threshold: [0.1, 0.3, 0.6],
      },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#2C2C2C] text-white">
      <Header activeSection={activeSection} onSelectSection={setActiveSection} />

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 space-y-24 pt-6 sm:pt-10">
        {/* SECTION 1: HOME (BANNER) */}
        <section id="home" className="scroll-mt-28">
          <HeroBanner />
        </section>

        {/* SECTION 2: ABOUT US */}
        <section id="about" className="scroll-mt-28 space-y-8">
          <div className="max-w-3xl">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#D1AC3E]">
              About Us
            </span>
            <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-[#FDF3E4]">
              Celebrating Devotion, Heritage & Community in North Texas
            </h2>
            <p className="mt-3 text-base text-white/80 leading-relaxed">
              Radha Krishna Temple of Dallas in Allen, Texas brings together thousands of families
              each autumn for <strong>Sharad Utsav</strong>—celebrating traditional Raas-Garba,
              classical arts, and community fellowship in a warm, welcoming spiritual sanctuary.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Card className="p-6 space-y-3">
              <Music className="h-7 w-7 text-[#D1AC3E]" />
              <h3 className="font-display text-xl font-semibold text-[#FDF3E4]">
                Authentic Raas & Garba
              </h3>
              <p className="text-sm text-white/75 leading-relaxed">
                Dance to live folk vocalists and traditional percussionists across five vibrant nights,
                joined by guided Garba choreography sessions on Dec 11 and Dec 13.
              </p>
            </Card>

            <Card className="p-6 space-y-3">
              <Users className="h-7 w-7 text-[#D1AC3E]" />
              <h3 className="font-display text-xl font-semibold text-[#FDF3E4]">
                Built for Real Families
              </h3>
              <p className="text-sm text-white/75 leading-relaxed">
                Flexible single-day, all-day, and single-day Family Passes, free entry for toddlers
                under 5, and dedicated guardian check-in verification for every minor.
              </p>
            </Card>

            <Card className="p-6 space-y-3">
              <Flame className="h-7 w-7 text-[#D1AC3E]" />
              <h3 className="font-display text-xl font-semibold text-[#FDF3E4]">
                Sattvic Festival Dining
              </h3>
              <p className="text-sm text-white/75 leading-relaxed">
                Pre-book freshly prepared vegetarian temple dinner plates alongside souvenir wooden
                dandiya sticks so your evening is effortless from check-in to aarti.
              </p>
            </Card>
          </div>
        </section>

        {/* SECTION 3: OUR MISSION */}
        <section id="mission" className="scroll-mt-28">
          <Card surface="cream" className="p-6 sm:p-10 space-y-6">
            <div className="max-w-3xl">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#645743]">
                Our Mission
              </span>
              <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-[#291900]">
                Service, Spiritual Upliftment & Cultural Continuity
              </h2>
              <p className="mt-3 text-base text-[#645743] leading-relaxed">
                Every festival hosted at Radha Krishna Temple supports year-round educational,
                charitable, and wellness programs open to everyone across Dallas–Fort Worth.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
              <div className="rounded-xl border border-[#BC9226]/40 bg-white/60 p-5">
                <div className="flex items-center gap-2 font-display text-lg font-bold text-[#291900]">
                  <BookOpen className="h-5 w-5 text-[#BC9226]" />
                  <span>Youth & Cultural Education</span>
                </div>
                <p className="mt-2 text-sm text-[#645743] leading-relaxed">
                  Nurturing character, heritage languages, music, and mindfulness in children and
                  teens through weekly classes and cultural camps.
                </p>
              </div>

              <div className="rounded-xl border border-[#BC9226]/40 bg-white/60 p-5">
                <div className="flex items-center gap-2 font-display text-lg font-bold text-[#291900]">
                  <Sparkles className="h-5 w-5 text-[#BC9226]" />
                  <span>Holistic Community Wellness</span>
                </div>
                <p className="mt-2 text-sm text-[#645743] leading-relaxed">
                  Offering free yoga camps, meditation workshops, senior fellowship, and hot
                  community meals rooted in selfless seva.
                </p>
              </div>
            </div>
          </Card>
        </section>

        {/* SECTION 4: CONTRIBUTE TO THE CAUSE (Informational Filler Section) */}
        <section id="contribute" className="scroll-mt-28 space-y-8 pb-8">
          <div className="max-w-3xl">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#D1AC3E]">
              Contribute to the Cause
            </span>
            <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-[#FDF3E4]">
              Every Ticket & Volunteer Hour Sustains Community Seva
            </h2>
            <p className="mt-3 text-base text-white/80 leading-relaxed">
              Proceeds from Sharad Utsav 2026 directly support temple community kitchens, youth
              scholarships, and charitable outreach. Explore our ongoing seva pillars below.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                title: 'Annadanam Meal Seva',
                tag: 'Community Kitchen',
                copy: 'Provides warm, nutritious vegetarian meals to festival visitors, students, and families in need throughout the year.',
              },
              {
                title: 'Cultural & Youth Arts Fund',
                tag: 'Next Generation',
                copy: 'Supports folk arts workshops, instruments, and youth cultural showcases during Sharad Utsav and Janmashtami.',
              },
              {
                title: 'Festival Volunteer Corps',
                tag: 'Hands-On Seva',
                copy: 'Hundreds of volunteers welcome families at the gate, assist elders, and coordinate prasad distribution each evening.',
              },
            ].map((item) => (
              <Card key={item.title} className="p-6 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <span className="inline-block text-xs font-semibold uppercase tracking-wider text-[#D1AC3E]">
                    {item.tag}
                  </span>
                  <h3 className="font-display text-xl font-bold text-[#FDF3E4]">{item.title}</h3>
                  <p className="text-sm text-white/75 leading-relaxed">{item.copy}</p>
                </div>
                <div className="pt-2 border-t border-white/10 text-xs text-white/60 flex items-center gap-1.5">
                  <HeartHandshake className="h-4 w-4 text-[#D1AC3E]" />
                  <span>501(c)(3) Community Initiative</span>
                </div>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#BC9226]/60 bg-[#C99B24]/10 p-6">
            <div>
              <h3 className="font-display text-xl font-bold text-[#FDF3E4]">
                Ready to join us at Sharad Utsav 2026?
              </h3>
              <p className="text-sm text-white/80">
                Reserve your individual or family group passes now—or view your past contributions
                in your profile.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  if (user) {
                    navigate('/me/contributions');
                  } else {
                    openSignInModal();
                  }
                }}
              >
                View My Contributions
              </Button>
              <Button variant="primary" onClick={() => navigate('/book')}>
                Book Festival Passes
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
