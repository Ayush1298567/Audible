'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlayerSessionProvider, usePlayerSession } from '@/lib/auth/player-session';

function JoinForm() {
  const router = useRouter();
  const { login } = usePlayerSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setIsLoading(true);
    setError(null);

    const result = await login(code.trim());
    if (result.success) {
      router.push('/player-film');
    } else {
      setError(result.error ?? 'Invalid code');
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Audible</CardTitle>
          <CardDescription>Enter your join code from your coach</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="joinCode">Join Code</Label>
              <Input
                id="joinCode"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={8}
                className="text-center text-2xl font-mono tracking-widest"
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            <Button type="submit" className="w-full" disabled={isLoading || code.length < 4}>
              {isLoading ? 'Joining...' : 'Join Program'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function JoinPage() {
  return (
    <PlayerSessionProvider>
      <JoinForm />
    </PlayerSessionProvider>
  );
}
