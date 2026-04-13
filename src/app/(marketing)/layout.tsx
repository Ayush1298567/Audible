import Link from 'next/link';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="fixed top-0 z-50 w-full border-b border-white/[0.06] bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 glow-blue transition-all duration-300 group-hover:bg-primary/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-primary">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <span className="font-display text-sm font-bold tracking-widest text-foreground uppercase">Audible</span>
              <p className="font-display text-[9px] uppercase tracking-widest text-muted-foreground leading-none mt-0.5">Football Intelligence</p>
            </div>
          </Link>

          {/* Nav links — public only, no dashboard links */}
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="font-display text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#how-it-works" className="font-display text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
            <a href="#pricing" className="font-display text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
          </nav>

          {/* Auth CTAs */}
          <div className="flex items-center gap-3">
            <Link
              href="/setup"
              className="hidden md:inline-flex font-display text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/setup"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-display text-xs font-semibold uppercase tracking-widest text-white shadow-lg shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98]"
            >
              Get Started Free
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 6h8M6 2l4 4-4 4"/>
              </svg>
            </Link>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main>{children}</main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] bg-background">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-primary">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <p className="font-display text-xs font-bold uppercase tracking-widest text-foreground">Audible</p>
                <p className="font-display text-[9px] uppercase tracking-widest text-muted-foreground">Football Intelligence</p>
              </div>
            </div>

            {/* Links — public pages only */}
            <div className="flex items-center gap-8">
              <a href="#features" className="font-display text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="#how-it-works" className="font-display text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
              <Link href="/setup" className="font-display text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">Get Started</Link>
              <Link href="/join" className="font-display text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">Player Login</Link>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-success pulse-dot" />
              <p className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">All Systems Operational</p>
            </div>
          </div>

          <div className="mt-8 border-t border-white/[0.04] pt-8 text-center">
            <p className="font-display text-[10px] uppercase tracking-widest text-muted-foreground/60">
              &copy; 2026 Audible Football Intelligence — Built for coaches who demand more
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
