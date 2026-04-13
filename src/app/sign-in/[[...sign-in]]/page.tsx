import { SignIn } from '@clerk/nextjs';
import { Suspense } from 'react';

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background gradient-mesh noise-overlay">
      <Suspense>
        <SignIn
          appearance={{
            elements: {
              rootBox: 'mx-auto',
              card: 'glass-card border-border/50 shadow-xl',
            },
          }}
        />
      </Suspense>
    </div>
  );
}
