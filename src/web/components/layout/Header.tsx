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
import { Button } from '../../ui/Button';

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

function MenuItem({ icon: Icon, onClick, tone = 'default', children }: MenuItemProps): React.ReactElement {
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

export function Header({ activeSection = 'home', onSelectSection }: HeaderProps): React.ReactElement {
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
    <header className="sticky top-0 z-40 border-b border-white/10 bg-primary-dark/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link
          to="/"
          onClick={() => isLanding && goToSection('home')}
          className="shrink-0 font-serif text-xl text-white"
        >
          Sharad Utsav <span className="text-primary">2026</span>
        </Link>

        <nav aria-label="Page sections" className="hidden h-full items-stretch lg:flex">
          {NAV_ITEMS.map((item) => {
            const isActive = isLanding && activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => goToSection(item.id)}
                aria-current={isActive ? 'true' : undefined}
                className={`relative cursor-pointer px-3.5 text-sm transition-colors ${
                  isActive ? 'text-white' : 'text-white/60 hover:text-white'
                }`}
              >
                {item.label}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-3.5 bottom-0 h-0.5 bg-primary transition-opacity ${
                    isActive ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          {location.pathname !== '/book' && (
            <Button size="sm" onClick={() => navigate('/book')} className="hidden sm:inline-flex">
              Book tickets
            </Button>
          )}

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={user ? `Account menu for ${user.fullName}` : 'Account menu'}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/25 text-xs font-semibold text-white transition-colors hover:border-bright-gold"
            >
              {user ? initialsOf(user.fullName) : <UserRound className="h-4 w-4" aria-hidden="true" />}
            </button>

            {menuOpen && (
              <div
                role="menu"
                aria-label="Account"
                className="absolute right-0 mt-2 w-64 overflow-hidden rounded-control border border-white/15 bg-primary-dark shadow-xl shadow-black/40"
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
                      <p className="mt-0.5 text-xs text-white/55">You don’t need an account to book.</p>
                    </>
                  )}
                </div>

                <div className="py-1">
                  <MenuItem icon={User} onClick={() => goToProfilePage('/me/details')}>
                    My details
                  </MenuItem>
                  <MenuItem icon={HeartHandshake} onClick={() => goToProfilePage('/me/contributions')}>
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
