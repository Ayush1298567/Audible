import { SignUp } from '@clerk/nextjs';
import { Suspense } from 'react';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background gradient-mesh noise-overlay">
      <Suspense>
        <SignUp
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
