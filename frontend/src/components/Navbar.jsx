import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

const ShieldIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <path
      d="M14 2L4 6v8c0 5.5 4.3 10.7 10 12 5.7-1.3 10-6.5 10-12V6L14 2z"
      fill="#0F2D5C"
      stroke="#0D9488"
      strokeWidth="1.5"
    />
    <path
      d="M10 14l3 3 5-6"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/predict', label: 'Analyse' },
  // { to: '/about', label: 'Methodology' },  // Hidden for now
  { to: '/history', label: 'History' },
]

export default function Navbar() {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  // Close the drawer on navigation so it never persists across routes.
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link
          to="/"
          className="flex items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy rounded"
        >
          <ShieldIcon />
          <span className="text-navy font-bold text-lg tracking-tight">
            AMR <span className="text-teal">Shield</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              aria-current={location.pathname === to ? 'page' : undefined}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-navy ${
                location.pathname === to
                  ? 'bg-navy text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-navy'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <Link
            to="/predict"
            className="hidden sm:inline-block px-4 py-2 bg-navy text-white text-sm font-semibold rounded-lg hover:bg-navy-light transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
          >
            Launch app →
          </Link>

          {/* Hamburger — without this, no route was reachable below 768px */}
          <button
            onClick={() => setMenuOpen((open) => !open)}
            className="md:hidden p-2 rounded-lg text-navy hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-navy"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {menuOpen ? (
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div id="mobile-nav" className="md:hidden border-t border-slate-200 bg-white px-4 py-3">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                aria-current={location.pathname === to ? 'page' : undefined}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === to
                    ? 'bg-navy text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-navy'
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  )
}
