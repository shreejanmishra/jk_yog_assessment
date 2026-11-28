import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  CalendarCheck,
  HeartHandshake,
  Music,
  Sparkles,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { HeroBanner } from "../components/landing/HeroBanner";
import { Footer } from "../components/layout/Footer";
import { Header, type LandingSectionId } from "../components/layout/Header";
import { useAuthStore } from "../stores/auth-store";
import { useCatalogStore } from "../stores/catalog-store";
import { Button } from "../ui/Button";
import { SectionHeading } from "../ui/SectionHeading";

const SECTION_IDS: readonly LandingSectionId[] = [
  "home",
  "about",
  "mission",
  "contribute",
];

interface HighlightCardItem {
  readonly title: string;
  readonly body: string;
  readonly imageUrl: string;
  readonly imageAlt: string;
  readonly footerNote: string;
  readonly footerRight: string;
  readonly footerIcon: LucideIcon;
}

const HIGHLIGHTS: readonly HighlightCardItem[] = [
  {
    title: "Raas-garba every night",
    body: "Live music on the temple lawn from 7 pm. Bring your own dandiya sticks or add a pair to your ticket.",
    imageUrl: "/images/raas-garba.jpg",
    imageAlt:
      "Families and devotees dancing traditional Raas-Garba with wooden dandiya sticks under golden lights in the temple courtyard",
    footerNote: "Dandiya sticks available",
    footerRight: "7:00 pm daily",
    footerIcon: Music,
  },
  {
    title: "Two garba workshops",
    body: "Guided sessions for beginners on Friday 11 and Sunday 13 December. Places are very limited.",
    imageUrl: "/images/garba-workshop.jpg",
    imageAlt:
      "Classical Garba instructor teaching traditional Gujarati footwork in the temple cultural hall",
    footerNote: "Fri 11 & Sun 13 Dec",
    footerRight: "Advance booking",
    footerIcon: CalendarCheck,
  },
  {
    title: "Festival dinner",
    body: "A vegetarian plate served each evening. Booking ahead tells the kitchen how many to cook for.",
    imageUrl: "/images/festival-dinner.jpg",
    imageAlt:
      "Freshly prepared vegetarian sattvic festival dinner thali served at Radha Krishna Temple",
    footerNote: "100% pure vegetarian",
    footerRight: "5:00 – 9:30 pm",
    footerIcon: Utensils,
  },
];

interface CommitmentItem {
  readonly term: string;
  readonly detail: string;
  readonly icon: LucideIcon;
}

const COMMITMENTS: readonly CommitmentItem[] = [
  {
    term: "Education",
    detail:
      "Weekly classes in music, language and values for children and teenagers.",
    icon: BookOpen,
  },
  {
    term: "Seva",
    detail:
      "Community meals and volunteer programmes open to everyone in Dallas–Fort Worth.",
    icon: HeartHandshake,
  },
  {
    term: "Wellbeing",
    detail:
      "Free yoga, meditation and support for older members of the community.",
    icon: Sparkles,
  },
];

const MISSION_STATS = [
  { value: "3500+", label: "Devotees Expected" },
  { value: "1,700+", label: "Festival Meals Prepared" },
  { value: "100%", label: "Proceeds Support Temple Seva" },
] as const;

const WAYS_TO_GIVE = [
  {
    title: "Annadanam",
    body: "Sponsor a community meal served at the temple.",
    meta: "From $51",
  },
  {
    title: "Youth and arts fund",
    body: "Help pay for instruments, costumes and teachers for children’s programmes.",
    meta: "Any amount",
  },
  {
    title: "Volunteer at the festival",
    body: "Welcome families at the gate, help in the kitchen or guide parking.",
    meta: "Temple office",
  },
] as const;

function HighlightPhotoCard({
  item,
}: {
  item: HighlightCardItem;
}): React.ReactElement {
  const FooterIcon = item.footerIcon;

  return (
    <div className="flex flex-col">
      <h3 className="mb-3.5 font-serif text-xl text-cream">{item.title}</h3>

      <article className="group flex flex-1 flex-col overflow-hidden rounded-card border border-gold bg-cream text-heading shadow-lg transition-colors hover:border-bright-gold">
        <div className="relative h-48 w-full overflow-hidden border-b border-gold/30 bg-primary-dark">
          <img
            src={item.imageUrl}
            alt={item.imageAlt}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>

        <div className="flex flex-1 flex-col justify-between p-6 pt-5">
          <p className="text-sm leading-relaxed text-primary-text">{item.body}</p>

          <div className="mt-5 flex items-center justify-between gap-2 rounded-control border border-gold/25 bg-heading/[0.06] px-3.5 py-2.5 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-heading">
              <FooterIcon
                className="h-3.5 w-3.5 text-gold"
                aria-hidden="true"
              />
              {item.footerNote}
            </span>
            <span className="font-semibold text-primary-text">
              {item.footerRight}
            </span>
          </div>
        </div>
      </article>
    </div>
  );
}

export function LandingPage(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const loadCatalog = useCatalogStore((s) => s.loadCatalog);
  const { user, openSignInModal } = useAuthStore();
  const [activeSection, setActiveSection] = useState<LandingSectionId>("home");

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // Arriving from another page via /#about etc.
  useEffect(() => {
    const hash = location.hash.replace("#", "") as LandingSectionId;
    if (!SECTION_IDS.includes(hash)) return;
    setActiveSection(hash);
    const target = document.getElementById(hash);
    if (target) {
      setTimeout(
        () => target.scrollIntoView({ behavior: "smooth", block: "start" }),
        60,
      );
    }
  }, [location.hash]);

  // Scroll-spy: highlight the section in view in the header.
  useEffect(() => {
    const elements = SECTION_IDS.map((id) =>
      document.getElementById(id),
    ).filter((el): el is HTMLElement => el !== null);
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
      { rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.25, 0.5] },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-primary-dark text-white">
      <Header
        activeSection={activeSection}
        onSelectSection={setActiveSection}
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
        <section id="home" className="pt-8 sm:pt-12">
          <HeroBanner />
        </section>

        <section
          id="about"
          className="mt-24 border-t border-white/10 pt-16 sm:pt-20"
        >
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-5">
              <SectionHeading
                title="About the festival"
                lead="Sharad Utsav celebrates the autumn full moon with five evenings of music, dance and food."
              />
            </div>
            <div className="space-y-5 text-[17px] leading-relaxed text-white/75 md:col-span-7 md:pt-9">
              <p>
                Each evening starts with aarti at 5 pm and then moves outside
                for raas-garba to live dhol and singers. Families come for a
                single night or for all five, and there is always somewhere
                quiet for grandparents and a corner for the little ones.
              </p>
              <p>
                Tickets are sold per person, per evening, so you only pay for
                the nights you come. Children under five come free.
              </p>
            </div>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {HIGHLIGHTS.map((item) => (
              <HighlightPhotoCard key={item.title} item={item} />
            ))}
          </div>
        </section>

        {/* Our Mission section styled after the design sheet, using strictly the assignment's cream/gold/heading palette */}
        <section id="mission" className="mt-24">
          <div className="relative overflow-hidden rounded-container bg-cream p-8 shadow-2xl sm:p-12 lg:p-14">
            {/* Delicate corner watermark mandala + Om SVG extracted from the design sheet */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-10 -top-10 flex h-72 w-72 items-center justify-center select-none text-heading opacity-[0.06]"
            >
              <svg viewBox="0 0 200 200" className="h-full w-full text-current">
                <circle
                  cx="140"
                  cy="60"
                  r="55"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  opacity="0.4"
                />
                <text
                  x="140"
                  y="82"
                  textAnchor="middle"
                  fontFamily="var(--font-serif)"
                  fontSize="68"
                  fontWeight="bold"
                  fill="currentColor"
                  opacity="0.9"
                >
                  🕉
                </text>
              </svg>
            </div>

            <div className="relative z-10 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-heading/[0.06] px-4 py-1.5 text-heading">
                <span aria-hidden="true" className="text-sm text-gold">
                  🕉
                </span>
                <span className="text-xs font-bold uppercase tracking-widest">
                  Our mission
                </span>
              </div>

              <blockquote className="mx-auto mt-6 max-w-5xl font-serif text-3xl italic leading-snug text-heading sm:text-4xl">
                “A temple should be a place every generation can call home.”
              </blockquote>

              <p className="mt-16 max-w-4xl text-left text-lg leading-relaxed text-primary-text">
                Radha Krishna Temple runs classes, community meals and wellbeing
                programmes throughout the year. Festivals like Sharad Utsav
                bring the whole community together, and the proceeds help keep
                those programmes free to attend.
              </p>

              {/* 3 Pillars squircle grid */}
              <div className="mt-10 grid grid-cols-1 gap-5 text-left md:grid-cols-3">
                {COMMITMENTS.map((c) => {
                  const Icon = c.icon;
                  return (
                    <div
                      key={c.term}
                      className="rounded-card border border-gold/25 bg-heading/[0.05] p-6"
                    >
                      <div className="squircle mb-3.5 flex h-10 w-10 items-center justify-center rounded-control bg-gold text-heading">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <h3 className="font-serif text-lg font-bold text-heading">
                        {c.term}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-primary-text">
                        {c.detail}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Statistics row */}
              <div className="mt-10 grid grid-cols-1 gap-6 border-t border-heading/12 pt-8 sm:grid-cols-3">
                {MISSION_STATS.map((stat) => (
                  <div key={stat.label}>
                    <p className="font-serif text-4xl font-bold leading-none text-heading sm:text-5xl">
                      {stat.value}
                    </p>
                    <p className="mt-2 text-sm font-medium text-primary-text">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          id="contribute"
          className="mt-24 border-t border-white/10 pt-16 sm:pt-20"
        >
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-5">
              <SectionHeading
                title="Contribute to the cause"
                lead="There are many ways to support the temple beyond buying a festival ticket."
              />
            </div>
            <ul className="space-y-4 md:col-span-7 md:mt-2">
              {WAYS_TO_GIVE.map((way) => (
                <li
                  key={way.title}
                  className="grid gap-2 rounded-card border border-gold bg-cream px-6 py-5 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8"
                >
                  <div>
                    <h3 className="font-serif text-xl font-bold text-heading">
                      {way.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-primary-text">
                      {way.body}
                    </p>
                  </div>
                  <span className="rounded-full border border-gold/40 bg-heading/[0.06] px-3.5 py-1 text-xs font-semibold text-heading sm:text-right">
                    {way.meta}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-16 flex flex-col gap-5 rounded-container border border-gold bg-cream px-6 py-7 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:px-10">
            <div>
              <p className="font-serif text-2xl font-bold text-heading">
                Tickets for Sharad Utsav 2026 are on sale now.
              </p>
              <p className="mt-1 text-sm text-primary-text">
                Book for yourself or your whole family in a few minutes.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="dark"
                onClick={() => {
                  if (user) {
                    navigate("/me/contributions");
                  } else {
                    sessionStorage.setItem(
                      "su_post_login_redirect",
                      "/me/contributions",
                    );
                    openSignInModal();
                  }
                }}
              >
                My contributions
              </Button>
              <Button onClick={() => navigate("/book")}>Book tickets</Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
