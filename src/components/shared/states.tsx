'use client';

/**
 * Shared empty, loading, and error state components.
 * Eliminates the repeated glass-card + pulse-dot + message pattern
 * across every dashboard page.
 */

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="glass-card rounded-xl border border-dashed border-border/50 flex flex-col items-center justify-center py-16 text-center animate-fade-in">
      {icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800/60 border border-slate-700/50 mb-4">
          {icon}
        </div>
      )}
      <p className="font-display text-base font-semibold text-slate-300">{title}</p>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-slate-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Loading...' }: LoadingStateProps) {
  return (
    <div className="flex items-center gap-3 py-8">
      <svg className="h-4 w-4 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <p className="font-display text-sm uppercase tracking-widest text-slate-500">
        {message}
      </p>
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 flex items-center justify-between">
      <p className="text-sm text-destructive">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="font-display text-xs uppercase tracking-widest text-destructive hover:text-destructive/80 transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}

interface PageHeaderProps {
  label?: string;
  labelColor?: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({ label, labelColor = 'text-primary', title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between">
      <div>
        {label && (
          <p className={`font-display text-xs uppercase tracking-widest ${labelColor} mb-1`}>
            {label}
          </p>
        )}
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">
          {title}
        </h1>
        {subtitle && <div className="mt-1">{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function GradientDivider({ from = 'from-blue-500/50', via = 'via-cyan-500/30' }: { from?: string; via?: string }) {
  return <div className={`h-px bg-gradient-to-r ${from} ${via} to-transparent`} />;
}
