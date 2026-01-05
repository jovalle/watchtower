/**
 * Header component with Netflix-style navigation.
 *
 * Fixed position header with scroll-based background transition,
 * navigation links, and user menu integration.
 */

import { useState, useEffect, useCallback } from 'react';
import { NavLink, Link } from '@remix-run/react';
import { Menu, Search } from 'lucide-react';
import { UserMenu } from '~/components/UserMenu';
import { StreamingDashboard } from '~/components/StreamingDashboard';
import { Container } from './Container';
import { MobileMenu } from './MobileMenu';
import type { PlexUser } from '~/lib/auth/plex.server';

interface HeaderProps {
  user: PlexUser;
}

interface NavItem {
  label: string;
  to: string;
}

const navItems: NavItem[] = [
  { label: 'Home', to: '/app' },
  { label: 'Movies', to: '/app/movies' },
  { label: 'Series', to: '/app/tv' },
  { label: 'New & Popular', to: '/app/new' },
  { label: 'Watchlist', to: '/app/watchlist' },
  { label: 'Lists', to: '/app/lists' },
];

/**
 * Navigation link with active state styling.
 */
function NavLinkItem({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/app'}
      className={({ isActive }) =>
        `text-sm font-medium transition-colors duration-200 ${
          isActive
            ? 'text-foreground-primary'
            : 'text-foreground-secondary hover:text-foreground-primary'
        }`
      }
    >
      {item.label}
    </NavLink>
  );
}

export function Header({ user }: HeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Throttled scroll handler
  const handleScroll = useCallback(() => {
    const scrolled = window.scrollY > 10;
    setIsScrolled(scrolled);
  }, []);

  useEffect(() => {
    // Check initial scroll position
    handleScroll();

    // Throttle scroll events for performance
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [handleScroll]);

  const toggleMobileMenu = () => setIsMobileMenuOpen((prev) => !prev);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <>
      <header
        className={`fixed left-0 right-0 top-0 z-50 h-16 transition-colors duration-300 ${
          isScrolled
            ? 'bg-background-primary/95 backdrop-blur-sm'
            : 'bg-gradient-to-b from-black/80 to-transparent'
        }`}
      >
        <Container size="wide">
          <div className="flex h-16 items-center justify-between">
            {/* Left section: Logo + Navigation */}
            <div className="flex items-center gap-8">
              {/* Logo */}
              <Link to="/app" className="flex items-center">
                <img src="/logo.png" alt="Watchtower" className="h-7 w-auto" />
              </Link>

              {/* Desktop Navigation */}
              <nav className="hidden items-center gap-6 md:flex">
                {navItems.map((item) => (
                  <NavLinkItem key={item.to} item={item} />
                ))}
              </nav>
            </div>

            {/* Right section: Actions + User Menu */}
            <div className="flex items-center gap-4">
              {/* Search icon (future Phase 4) */}
              <button
                className="hidden rounded-md p-2 text-foreground-secondary transition-colors hover:bg-background-elevated hover:text-foreground-primary sm:block"
                aria-label="Search"
              >
                <Search className="h-5 w-5" />
              </button>

              {/* Streaming Dashboard */}
              <StreamingDashboard />

              {/* User Menu - visible on all sizes */}
              <div className="hidden sm:block">
                <UserMenu user={user} />
              </div>

              {/* Mobile: Compact user avatar */}
              <div className="flex items-center gap-2 sm:hidden">
                {user.thumb && (
                  <img src={user.thumb} alt={user.username} className="h-8 w-8 rounded-full" />
                )}
              </div>

              {/* Mobile hamburger menu */}
              <button
                onClick={toggleMobileMenu}
                className="rounded-md p-2 text-foreground-secondary transition-colors hover:bg-background-elevated hover:text-foreground-primary md:hidden"
                aria-label="Open menu"
                aria-expanded={isMobileMenuOpen}
              >
                <Menu className="h-6 w-6" />
              </button>
            </div>
          </div>
        </Container>
      </header>

      {/* Mobile Menu */}
      <MobileMenu
        isOpen={isMobileMenuOpen}
        onClose={closeMobileMenu}
        navItems={navItems}
        user={user}
      />
    </>
  );
}
