import { Suspense } from 'react';
import { SignUpClient } from './client';

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpClient />
    </Suspense>
  );
}
