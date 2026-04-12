/**
 * Temporary landing page for Phase 0. Replaced in Phase 1 with the
 * real Hub screen once auth is wired up.
 */

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-5xl font-bold tracking-tight">Audible</h1>
        <p className="text-xl text-muted-foreground">
          Football intelligence for high school and small college football programs.
        </p>
        <p className="text-sm text-muted-foreground">
          Phase 0 scaffolding. Coming online now.
        </p>
      </div>
    </main>
  );
}
