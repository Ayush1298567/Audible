'use client';

import { SignIn, useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function SignInClient() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace('/hub');
    }
  }, [isLoaded, isSignedIn, router]);

  if (isLoaded && isSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="font-display text-sm uppercase tracking-widest text-muted-foreground animate-pulse">
          Redirecting to dashboard...
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background gradient-mesh noise-overlay">
      <SignIn
        forceRedirectUrl="/hub"
        appearance={{
          elements: {
            rootBox: 'mx-auto',
            card: 'glass-card border-border/50 shadow-xl',
          },
        }}
      />
    </div>
  );
}
