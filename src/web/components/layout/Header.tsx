import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  HeartHandshake,
  LogOut,
  Sparkles,
  Ticket,
  User,
  UserCircle2,
} from 'lucide-react';
import { useAuthStore } from '../../stores/auth-store';
import { Button } from '../../ui/Button';

export type LandingSectionId = 'home' | 'about' | 'mission' | 'contribute';

const NAV_ITEMS: readonly { id: LandingSectionId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About Us' },
  { id: 'mission', label: 'Our Mission' },
  { id: 'contribute', label: 'Contribute to the Cause' },
];

export interface HeaderProps {
  activeSection?: LandingSectionId;
  onSelectSection?: (id: LandingSectionId) => void;
}

export function Header({
  activeSection = 'home',
  onSelectSection,
}: HeaderProps): React.ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, openSignInModal, loginDemo, logout } = useAuthStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isLanding = location.pathname === '/';

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [dropdownOpen]);

  const handleNavClick = (sectionId: LandingSectionId): void => {
    if (isLanding) {
      onSelectSection?.(sectionId);
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      navigate(`/#${sectionId}`);
    }
  };

  const handleProtectedProfileRoute = async (targetPath: string): Promise<void> => {
    setDropdownOpen(false);
    if (user) {
      navigate(targetPath);
      return;
    }
    // Sign in seamlessly with demo profile or let user sign in via modal
    openSignInModal();
    sessionStorage.setItem('su_post_login_redirect', targetPath);
  };

  const handleSignOut = async (): Promise<void> => {
    setDropdownOpen(false);
    await logout();
    if (location.pathname.startsWith('/me')) {
      navigate('/');
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/15 bg-[#2C2C2C]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        {/* Brand emblem */}
        <Link
          to="/"
          onClick={() => isLanding && handleNavClick('home')}
          className="flex items-center gap-2.5 group shrink-0"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#BC9226] bg-[#C99B24]/15 text-[#D1AC3E] font-display text-lg font-bold">
            ॐ
          </span>
          <div className="leading-tight">
            <span className="block font-display text-base sm:text-lg font-bold text-white group-hover:text-[#D1AC3E] transition-colors">
              Sharad Utsav 2026
            </span>
            <span className="hidden sm:block text-[11px] text-white/65">
              Radha Krishna Temple · Allen, TX
            </span>
          </div>
        </Link>

        {/* Scroll-spy Single-Page Section Nav */}
        <nav aria-label="Primary navigation" className="hidden lg:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = isLanding && activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                aria-current={isActive ? 'location' : undefined}
                className={`relative px-3.5 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                  isActive
                    ? 'text-[#D1AC3E] bg-[#C99B24]/15'
                    : 'text-white/80 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-3 bottom-0.5 h-0.5 rounded-full bg-[#C99B24]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right CTA + Profile Icon Dropdown */}
        <div className="flex items-center gap-2.5">
          {location.pathname !== '/book' && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/book')}
              className="hidden sm:inline-flex"
            >
              Book Now
            </Button>
          )}

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={dropdownOpen}
              aria-label="Profile menu"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/[0.06] px-3 py-2 text-sm font-medium text-white hover:border-[#D1AC3E] hover:bg-white/10 transition-colors cursor-pointer"
            >
              <UserCircle2 className="h-5 w-5 text-[#D1AC3E]" />
              <span className="hidden md:inline max-w-28 truncate">
                {user ? user.fullName.split(' ')[0] : 'Profile'}
              </span>
              <ChevronDown
                className={`h-4 w-4 text-white/70 transition-transform ${
                  dropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {dropdownOpen && (
              <div
                role="menu"
                aria-label="Profile options"
                className="absolute right-0 mt-2 w-64 rounded-2xl border border-[#BC9226]/70 bg-[#323232] p-2 text-white shadow-2xl z-50"
              >
                {user ? (
                  <div className="px-3 py-2.5 mb-1 border-b border-white/15">
                    <p className="text-sm font-semibold text-white truncate">{user.fullName}</p>
                    <p className="text-xs text-white/65 truncate">{user.email}</p>
                  </div>
                ) : (
                  <div className="px-3 py-2.5 mb-1 border-b border-white/15 space-y-2">
                    <p className="text-xs text-white/70">
                      Browsing as Guest (no login required to book)
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        void loginDemo();
                      }}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#C99B24]/20 border border-[#BC9226] px-2.5 py-1.5 text-xs font-semibold text-[#D1AC3E] hover:bg-[#C99B24]/30 cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      1-Click Demo Sign In
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleProtectedProfileRoute('/me/details')}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-white/90 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <User className="h-4 w-4 text-[#D1AC3E]" />
                  <span>My Details</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleProtectedProfileRoute('/me/contributions')}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-white/90 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <HeartHandshake className="h-4 w-4 text-[#D1AC3E]" />
                  <span>My Contributions</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleProtectedProfileRoute('/me/bookings')}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-white/90 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Ticket className="h-4 w-4 text-[#D1AC3E]" />
                  <span>My Bookings</span>
                </button>

                <div className="my-1 border-t border-white/15" />

                {user ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleSignOut()}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-[#FF7A7A] hover:bg-[#EF1F1F]/15 transition-colors cursor-pointer"
                  >
                    <LogOut className="h-4 w-4 text-[#EF1F1F]" />
                    <span>Sign Out</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setDropdownOpen(false);
                      openSignInModal();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-[#D1AC3E] hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <UserCircle2 className="h-4 w-4" />
                    <span>Sign In with Email</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile horizontal scroll-spy section bar */}
      {isLanding && (
        <div className="flex lg:hidden items-center gap-1 overflow-x-auto px-4 py-2 border-t border-white/10 bg-[#262626]">
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#C99B24] text-[#2C2C2C] font-semibold'
                    : 'text-white/75 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}
