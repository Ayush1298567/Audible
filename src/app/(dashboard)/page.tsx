'use client';

import { useProgram } from '@/lib/auth/program-context';
import { Badge } from '@/components/ui/badge';

export default function HubPage() {
  const { programName } = useProgram();

  return (
    <div className="relative space-y-8">
      {/* Gradient mesh background */}
      <div className="gradient-mesh noise-overlay absolute inset-0 -z-10" />

      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight">{programName}</h1>
          <Badge className="bg-success/10 text-success border-success/20 font-display text-[10px] uppercase tracking-widest">
            Active
          </Badge>
        </div>
        <p className="font-display text-sm uppercase tracking-widest text-muted-foreground">
          Weekly Intelligence Dashboard
        </p>
      </div>

      {/* Status cards — 4 across */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Film"
          value="0"
          unit="games"
          description="Upload your first game film"
          accentColor="primary"
          index={0}
        />
        <StatCard
          label="Game Plan"
          value="—"
          unit=""
          description="Build after uploading film"
          accentColor="accent"
          index={1}
        />
        <StatCard
          label="Player Prep"
          value="0"
          unit="%"
          description="No sessions assigned yet"
          accentColor="warning"
          index={2}
        />
        <StatCard
          label="Roster"
          value="0"
          unit="players"
          description="Add players to get started"
          accentColor="info"
          index={3}
        />
      </div>

      {/* Intelligence Flags */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg font-semibold tracking-wide">Intelligence Flags</h2>
          <div className="h-px flex-1 bg-gradient-to-r from-border/50 to-transparent" />
        </div>

        <div className="glass-card rounded-2xl p-8 text-center">
          <div className="mx-auto max-w-md space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p className="font-display text-base font-semibold text-foreground">
                Upload game film to unlock intelligence
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Audible will find what you can&apos;t find manually — coverage
                tendencies, pressure patterns, pre-snap tells, and matchup
                vulnerabilities. All backed by clip evidence.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <FlagPreviewChip label="Pre-snap tell" color="warning" />
              <FlagPreviewChip label="Tendency found" color="info" />
              <FlagPreviewChip label="Self-scout alert" color="destructive" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg font-semibold tracking-wide">Quick Actions</h2>
          <div className="h-px flex-1 bg-gradient-to-r from-border/50 to-transparent" />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <ActionCard
            href="/film"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            }
            title="Upload Film"
            description="Import Hudl breakdown export"
          />
          <ActionCard
            href="/roster"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="5" />
                <path d="M3 21c0-4 3.5-7 9-7s9 3 9 7" />
              </svg>
            }
            title="Build Roster"
            description="Add players with join codes"
          />
          <ActionCard
            href="/games"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <line x1="9" y1="4" x2="9" y2="10" />
              </svg>
            }
            title="Schedule Games"
            description="Add opponents to your schedule"
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  description,
  accentColor,
  index,
}: {
  label: string;
  value: string;
  unit: string;
  description: string;
  accentColor: string;
  index: number;
}) {
  const colorMap: Record<string, string> = {
    primary: 'from-primary/20 to-primary/5 border-primary/10',
    accent: 'from-accent/20 to-accent/5 border-accent/10',
    warning: 'from-warning/20 to-warning/5 border-warning/10',
    info: 'from-info/20 to-info/5 border-info/10',
  };

  const textMap: Record<string, string> = {
    primary: 'text-primary',
    accent: 'text-accent',
    warning: 'text-warning',
    info: 'text-info',
  };

  return (
    <div className={`animate-fade-in stagger-${index + 1} group rounded-xl border bg-gradient-to-br p-5 transition-all duration-300 hover:scale-[1.02] ${colorMap[accentColor] ?? colorMap.primary}`}>
      <p className="font-display text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`stat-number text-3xl ${textMap[accentColor] ?? textMap.primary}`}>
          {value}
        </span>
        {unit && (
          <span className="text-xs text-muted-foreground">{unit}</span>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground/70">{description}</p>
    </div>
  );
}

function FlagPreviewChip({ label, color }: { label: string; color: string }) {
  const colorMap: Record<string, string> = {
    warning: 'tag-warning',
    info: 'tag-info',
    destructive: 'tag-negative',
  };

  return (
    <span className={`tag-chip ${colorMap[color] ?? 'tag-neutral'}`}>
      {label}
    </span>
  );
}

function ActionCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <a
      href={href}
      className="group flex items-start gap-4 rounded-xl border border-border/30 bg-surface-raised p-4 transition-all duration-200 hover:border-primary/20 hover:bg-white/[0.03]"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
        {icon}
      </div>
      <div>
        <p className="font-display text-sm font-semibold tracking-wide text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </a>
  );
}
