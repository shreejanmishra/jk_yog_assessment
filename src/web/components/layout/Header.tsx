import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  HeartHandshake,
  LogIn,
  LogOut,
  Ticket,
  User,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '../../stores/auth-store';

export type LandingSectionId = 'home' | 'about' | 'mission' | 'contribute';

const NAV_ITEMS: readonly { id: LandingSectionId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About us' },
  { id: 'mission', label: 'Our mission' },
  { id: 'contribute', label: 'Contribute to the cause' },
];

export interface HeaderProps {
  activeSection?: LandingSectionId;
  onSelectSection?: (id: LandingSectionId) => void;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

interface MenuItemProps {
  icon: LucideIcon;
  onClick: () => void;
  tone?: 'default' | 'danger';
  children: React.ReactNode;
}

function MenuItem({
  icon: Icon,
  onClick,
  tone = 'default',
  children,
}: MenuItemProps): React.ReactElement {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/[0.05] ${
        tone === 'danger' ? 'text-error-on-dark' : 'text-white/85 hover:text-white'
      }`}
    >
      <Icon className="h-4 w-4 opacity-70" aria-hidden="true" />
      {children}
    </button>
  );
}

export function Header({
  activeSection = 'home',
  onSelectSection,
}: HeaderProps): React.ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, openSignInModal, loginDemo, logout } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isLanding = location.pathname === '/';

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [menuOpen]);

  const goToSection = (sectionId: LandingSectionId): void => {
    if (isLanding) {
      onSelectSection?.(sectionId);
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      navigate(`/#${sectionId}`);
    }
  };

  const goToProfilePage = (path: string): void => {
    setMenuOpen(false);
    if (user) {
      navigate(path);
      return;
    }
    sessionStorage.setItem('su_post_login_redirect', path);
    openSignInModal();
  };

  const handleSignOut = async (): Promise<void> => {
    setMenuOpen(false);
    await logout();
    if (location.pathname.startsWith('/me')) navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-primary-dark/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Left cluster: Brand logo + divider + inline navigation links (matching reference header format) */}
        <div className="flex min-w-0 items-center gap-5">
          <Link
            to="/"
            onClick={() => isLanding && goToSection('home')}
            className="group flex shrink-0 items-center gap-2.5"
          >
            <span
              aria-hidden="true"
              className="squircle flex h-8 w-8 items-center justify-center rounded-[10px] border border-gold/50 bg-primary/15 text-base leading-none text-bright-gold transition-colors group-hover:border-bright-gold group-hover:bg-primary/25"
            >
              🕉
            </span>
            <span className="font-serif text-lg font-semibold tracking-tight text-white">
              Sharad Utsav <span className="text-primary">2026</span>
            </span>
          </Link>

          <span aria-hidden="true" className="hidden h-4 w-px bg-white/15 lg:block" />

          <nav aria-label="Page sections" className="hidden items-center gap-1 lg:flex">
            {NAV_ITEMS.map((item) => {
              const isActive = isLanding && activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goToSection(item.id)}
                  aria-current={isActive ? 'true' : undefined}
                  className={`relative cursor-pointer rounded-control px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-white'
                      : 'text-white/65 hover:bg-white/[0.04] hover:text-white'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {item.label}
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full bg-primary"
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right cluster: Quick link + circular icon buttons + pill CTA + circular user avatar */}
        <div className="flex shrink-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => goToProfilePage('/me/bookings')}
            className="hidden cursor-pointer rounded-control px-2.5 py-1.5 text-sm font-medium text-white/75 transition-colors hover:text-white md:inline-flex"
          >
            My bookings
          </button>

          <button
            type="button"
            onClick={() => goToProfilePage('/me/contributions')}
            aria-label="My contributions"
            title="My contributions"
            className="hidden h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white/80 transition-colors hover:border-gold/60 hover:text-bright-gold sm:flex"
          >
            <HeartHandshake className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => goToProfilePage('/me/bookings')}
            aria-label="View festival passes"
            title="View festival passes"
            className="hidden h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white/80 transition-colors hover:border-gold/60 hover:text-bright-gold sm:flex"
          >
            <Ticket className="h-4 w-4" aria-hidden="true" />
          </button>

          {location.pathname !== '/book' && (
            <button
              type="button"
              onClick={() => navigate('/book')}
              className="inline-flex h-9 cursor-pointer items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-dark transition-colors hover:bg-bright-gold"
            >
              Book tickets
            </button>
          )}

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={user ? `Account menu for ${user.fullName}` : 'Account menu'}
              className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-xs font-bold transition-colors ${
                user
                  ? 'bg-gold text-heading hover:bg-bright-gold'
                  : 'border border-white/25 bg-white/[0.05] text-white hover:border-bright-gold hover:text-bright-gold'
              }`}
            >
              {user ? (
                initialsOf(user.fullName)
              ) : (
                <UserRound className="h-4 w-4" aria-hidden="true" />
              )}
            </button>

            {menuOpen && (
              <div
                role="menu"
                aria-label="Account"
                className="absolute right-0 mt-2 w-64 overflow-hidden rounded-card border border-glass-border bg-primary-dark shadow-xl shadow-black/50"
              >
                <div className="border-b border-white/10 px-4 py-3">
                  {user ? (
                    <>
                      <p className="truncate text-sm font-medium text-white">{user.fullName}</p>
                      <p className="truncate text-xs text-white/55">{user.email}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-white">Browsing as a guest</p>
                      <p className="mt-0.5 text-xs text-white/55">
                        You don’t need an account to book.
                      </p>
                    </>
                  )}
                </div>

                <div className="py-1">
                  <MenuItem icon={User} onClick={() => goToProfilePage('/me/details')}>
                    My details
                  </MenuItem>
                  <MenuItem
                    icon={HeartHandshake}
                    onClick={() => goToProfilePage('/me/contributions')}
                  >
                    My contributions
                  </MenuItem>
                  <MenuItem icon={Ticket} onClick={() => goToProfilePage('/me/bookings')}>
                    My bookings
                  </MenuItem>
                </div>

                <div className="border-t border-white/10 py-1">
                  {user ? (
                    <MenuItem icon={LogOut} tone="danger" onClick={() => void handleSignOut()}>
                      Sign out
                    </MenuItem>
                  ) : (
                    <>
                      <MenuItem
                        icon={LogIn}
                        onClick={() => {
                          setMenuOpen(false);
                          openSignInModal();
                        }}
                      >
                        Sign in with email
                      </MenuItem>
                      <MenuItem
                        icon={UserRound}
                        onClick={() => {
                          setMenuOpen(false);
                          void loginDemo();
                        }}
                      >
                        Use demo account
                      </MenuItem>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isLanding && (
        <nav
          aria-label="Page sections"
          className="flex gap-5 overflow-x-auto border-t border-white/10 px-4 lg:hidden"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => goToSection(item.id)}
                aria-current={isActive ? 'true' : undefined}
                className={`shrink-0 cursor-pointer border-b-2 py-2.5 text-sm transition-colors ${
                  isActive ? 'border-primary text-white' : 'border-transparent text-white/60'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      )}
    </header>
  );
}
