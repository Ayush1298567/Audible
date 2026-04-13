import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6 pt-24 pb-20 text-center">
        {/* Background gradients */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-background" />
          <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[900px] rounded-full bg-primary/5 blur-[120px]" />
          <div className="absolute right-1/4 top-1/2 h-[400px] w-[600px] rounded-full bg-accent/4 blur-[100px]" />
          <div className="absolute left-1/4 bottom-1/4 h-[300px] w-[500px] rounded-full bg-primary/3 blur-[80px]" />
          {/* Grid overlay */}
          <div className="absolute inset-0 opacity-[0.015]" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }} />
        </div>

        {/* Eyebrow badge */}
        <div className="animate-fade-in stagger-1 mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-primary pulse-dot" />
          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">AI-Powered Film Intelligence</span>
        </div>

        {/* Main headline */}
        <h1 className="animate-fade-in stagger-2 mx-auto max-w-4xl font-display text-5xl font-bold leading-[1.05] tracking-tight text-foreground md:text-7xl lg:text-8xl">
          The Intelligence Layer
          <span className="block bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
            for Football
          </span>
        </h1>

        {/* Subheadline */}
        <p className="animate-fade-in stagger-3 mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
          Upload your Hudl exports and let AI find every coverage shell, pressure
          package, and blitz tendency your opponent runs — in seconds, not hours.
          Built for coaches who want to win, not manage spreadsheets.
        </p>

        {/* CTA buttons */}
        <div className="animate-fade-in stagger-4 mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <Link
            href="/sign-up"
            className="group inline-flex items-center gap-3 rounded-xl bg-primary px-8 py-4 font-display text-sm font-bold uppercase tracking-widest text-white shadow-xl shadow-primary/25 transition-all duration-300 hover:bg-primary/90 hover:shadow-primary/40 hover:scale-[1.03] active:scale-[0.98]"
          >
            Get Started Free
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-0.5">
              <path d="M2 7h10M7 2l5 5-5 5"/>
            </svg>
          </Link>
          <Link
            href="/join"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-8 py-4 font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground transition-all duration-200 hover:border-white/20 hover:bg-white/[0.06] hover:text-foreground"
          >
            Player Login
          </Link>
        </div>

        {/* Social proof micro-text */}
        <p className="animate-fade-in stagger-5 mt-8 font-display text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50">
          No credit card required &nbsp;·&nbsp; Works with any Hudl account &nbsp;·&nbsp; Set up in 5 minutes
        </p>

        {/* Hero visual: mock command bar */}
        <div className="animate-fade-in stagger-6 mx-auto mt-16 w-full max-w-2xl">
          <div className="glass-card glow-blue rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-primary">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <span className="flex-1 font-display text-sm text-muted-foreground">
                <span className="text-foreground">Show me every play they ran Cover 3 on 3rd down</span>
                <span className="ml-1 inline-block h-4 w-0.5 bg-primary align-middle animate-pulse" />
              </span>
              <span className="tag-chip tag-info">12 results</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { label: 'Q2 3rd & 8', detail: 'Cover 3 Buzz · 8yd gain', color: 'tag-warning' },
                { label: 'Q3 3rd & 5', detail: 'Cover 3 Sky · Incomplete', color: 'tag-positive' },
                { label: 'Q4 3rd & 12', detail: 'Cover 3 Match · TD', color: 'tag-negative' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                  <p className="font-display text-[11px] font-semibold text-foreground">{item.label}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{item.detail}</p>
                  <span className={`tag-chip ${item.color} mt-2`}>Film clip</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ──────────────────────────────────────────── */}
      <section className="border-y border-white/[0.06] bg-surface-raised/50">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {[
              { value: '6', label: 'CV Tasks', description: 'Auto-detected per play' },
              { value: '60+', label: 'Plays / Game', description: 'Tagged & indexed instantly' },
              { value: '$3', label: 'AI Cost / Month', description: 'Full intelligence tier' },
              { value: '<1s', label: 'Search Latency', description: 'Natural language queries' },
            ].map((stat, i) => (
              <div key={stat.label} className={`animate-fade-in stagger-${i + 1} text-center`}>
                <p className="stat-number text-4xl text-primary">{stat.value}</p>
                <p className="mt-1 font-display text-xs font-bold uppercase tracking-widest text-foreground">{stat.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{stat.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features grid ──────────────────────────────────────── */}
      <section id="features" className="relative px-6 py-28">
        <div className="pointer-events-none absolute inset-0 -z-10 gradient-mesh" />

        <div className="mx-auto max-w-7xl">
          {/* Section header */}
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-4 py-1.5">
              <span className="font-display text-[10px] font-semibold uppercase tracking-[0.15em] text-accent">Platform Features</span>
            </div>
            <h2 className="font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl">
              Everything a coach needs.<br/>
              <span className="text-muted-foreground font-normal">Nothing they don&apos;t.</span>
            </h2>
          </div>

          {/* 6-card grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, i) => (
              <div
                key={feature.title}
                className={`animate-fade-in stagger-${(i % 6) + 1} glass-card group rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/5`}
              >
                <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-colors duration-300 ${feature.iconBg}`}>
                  {feature.icon}
                </div>
                <h3 className="font-display text-base font-bold tracking-wide text-foreground">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {feature.tags.map((tag) => (
                    <span key={tag} className="tag-chip tag-info">{tag}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────── */}
      <section id="how-it-works" className="relative px-6 py-28">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[800px] rounded-full bg-accent/4 blur-[120px]" />
        </div>

        <div className="mx-auto max-w-7xl">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5">
              <span className="font-display text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">How It Works</span>
            </div>
            <h2 className="font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl">
              From film to intelligence
              <span className="block text-primary">in three steps.</span>
            </h2>
          </div>

          <div className="relative grid gap-8 md:grid-cols-3">
            {/* Connector line (desktop) */}
            <div className="pointer-events-none absolute left-[16.67%] right-[16.67%] top-10 hidden h-px bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 md:block" />

            {STEPS.map((step, i) => (
              <div key={step.title} className={`animate-fade-in stagger-${i + 1} relative flex flex-col items-center text-center`}>
                {/* Step number bubble */}
                <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 glow-blue">
                  <span className="font-display text-3xl font-bold text-primary">{i + 1}</span>
                  <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                    {step.stepIcon}
                  </div>
                </div>
                <h3 className="font-display text-xl font-bold tracking-wide text-foreground">{step.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground max-w-xs">{step.description}</p>
                <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2">
                  <p className="font-display text-[10px] uppercase tracking-widest text-accent">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Social proof ───────────────────────────────────────── */}
      <section className="border-y border-white/[0.06] bg-surface-raised/30 px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto mb-12 max-w-xl text-center">
            <p className="font-display text-xs uppercase tracking-[0.15em] text-muted-foreground">
              What coaches are saying
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <div key={t.name} className={`animate-fade-in stagger-${i + 1} glass-card rounded-2xl p-6`}>
                {/* Stars */}
                <div className="mb-4 flex gap-1">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <svg key={j} width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-warning">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                  ))}
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">&ldquo;{t.quote}&rdquo;</p>
                <div className="mt-5 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 font-display text-xs font-bold text-primary">
                    {t.initials}
                  </div>
                  <div>
                    <p className="font-display text-xs font-semibold text-foreground">{t.name}</p>
                    <p className="text-[10px] text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 py-32 text-center">
        {/* Background */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-background" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[1000px] rounded-full bg-primary/6 blur-[150px]" />
          <div className="absolute inset-0 opacity-[0.012]" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }} />
        </div>

        <div className="mx-auto max-w-3xl">
          {/* Badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-5 py-2">
            <div className="h-1.5 w-1.5 rounded-full bg-primary pulse-dot" />
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">Ready to get an edge?</span>
          </div>

          <h2 className="font-display text-5xl font-bold leading-tight tracking-tight text-foreground md:text-6xl">
            Stop watching film.
            <span className="block bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Start reading it.
            </span>
          </h2>

          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Join coaches who are using AI to find tendencies, build game plans, and
            give their players a competitive advantage — every single week.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/sign-up"
              className="group inline-flex items-center gap-3 rounded-xl bg-primary px-10 py-5 font-display text-sm font-bold uppercase tracking-widest text-white shadow-2xl shadow-primary/30 transition-all duration-300 hover:bg-primary/90 hover:shadow-primary/50 hover:scale-[1.03] active:scale-[0.98]"
            >
              Get Started Free
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-0.5">
                <path d="M2 7h10M7 2l5 5-5 5"/>
              </svg>
            </Link>
            <Link
              href="/join"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-8 py-4 font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground transition-all duration-200 hover:border-white/20 hover:text-foreground"
            >
              Player Login
            </Link>
          </div>

          <div className="mt-10 flex items-center justify-center gap-8 border-t border-white/[0.06] pt-10">
            {[
              { label: 'Hudl Compatible', icon: '✓' },
              { label: 'No CV required for v1', icon: '✓' },
              { label: '$3/mo AI cost', icon: '✓' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="font-display text-xs font-bold text-success">{item.icon}</span>
                <span className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Feature card data ───────────────────────────────────────────

const FEATURES = [
  {
    title: 'AI Film Intelligence',
    description: 'Upload Hudl CSV, XML, and MP4 exports. Audible auto-detects coverage shells, pressure packages, blocking schemes, routes, and per-player positions from every play.',
    iconBg: 'bg-primary/10 group-hover:bg-primary/20',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5,3 19,12 5,21" />
      </svg>
    ),
    tags: ['Coverage', 'Pressure', 'Routes'],
  },
  {
    title: 'Tendency Engine',
    description: 'Find patterns no human can catch manually. Blitz rates by down and distance, coverage frequencies by hash, motion tendency alerts, and self-scout warnings.',
    iconBg: 'bg-accent/10 group-hover:bg-accent/20',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    tags: ['Blitz %', 'Down & Distance', 'Alerts'],
  },
  {
    title: 'Natural Language Search',
    description: 'Type in plain English — "show me every play they ran Cover 3 on 3rd down" — and get instant, clip-linked results. No filters, no spreadsheets.',
    iconBg: 'bg-primary/10 group-hover:bg-primary/20',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
    ),
    tags: ['Sub-second', 'Clip-linked', 'NLP'],
  },
  {
    title: 'AI Play Suggester',
    description: "Get play recommendations based on your opponent's tendencies, with AI reasoning. Know not just what to run, but exactly why it should work.",
    iconBg: 'bg-success/10 group-hover:bg-success/20',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 8v4l3 3"/>
      </svg>
    ),
    tags: ['AI Reasoning', 'Game Plan', 'Matchups'],
  },
  {
    title: 'Per-Player Tracking',
    description: 'CV-powered player metrics: safety depth, cornerback cushion, receiver splits. Know exactly how each defender aligns before the snap.',
    iconBg: 'bg-warning/10 group-hover:bg-warning/20',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="5"/>
        <path d="M3 21c0-4 3.5-7 9-7s9 3 9 7"/>
      </svg>
    ),
    tags: ['Safety Depth', 'CB Cushion', 'Splits'],
  },
  {
    title: 'Player App',
    description: 'Players join with a code and get their own mobile view — film feed, game plan, practice sessions, and progress tracking. No accounts, no friction.',
    iconBg: 'bg-accent/10 group-hover:bg-accent/20',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2"/>
        <line x1="12" y1="18" x2="12.01" y2="18"/>
      </svg>
    ),
    tags: ['Join Code', 'Film Feed', 'Game Plan'],
  },
];

// ─── How it works steps ──────────────────────────────────────────

const STEPS = [
  {
    title: 'Upload',
    description: 'Export your Hudl breakdown — CSV play data, XML formations, and MP4 film. Drop it in Audible and the AI gets to work.',
    detail: 'Hudl CSV + XML + MP4',
    stepIcon: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
        <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
      </svg>
    ),
  },
  {
    title: 'Analyze',
    description: 'Audible tags every play with coverage, pressure, blocking, and route data. The tendency engine surfaces patterns and alerts automatically.',
    detail: 'AI tagging in seconds',
    stepIcon: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    title: 'Win',
    description: 'Build your game plan with AI play suggestions. Brief players through the app. Walk into Friday night with a genuine edge.',
    detail: 'Game plan in minutes',
    stepIcon: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
    ),
  },
];

// ─── Testimonials ────────────────────────────────────────────────

const TESTIMONIALS = [
  {
    quote: 'I used to spend 8 hours breaking down film. Audible gets me a full scouting report in 20 minutes. The blitz tendency alerts alone won us a game last week.',
    name: 'Coach Martinez',
    role: 'Offensive Coordinator, West Valley HS',
    initials: 'CM',
  },
  {
    quote: 'The natural language search is unreal. I just type what I\'m looking for and every clip comes up instantly. My assistants couldn\'t believe it wasn\'t magic.',
    name: 'Coach Thompson',
    role: 'Head Coach, Eastside College',
    initials: 'CT',
  },
  {
    quote: 'Players actually watch their film now because they see it on their phones in the game plan view. Engagement went through the roof.',
    name: 'Coach Williams',
    role: 'Defensive Coordinator, North Shore HS',
    initials: 'CW',
  },
];
