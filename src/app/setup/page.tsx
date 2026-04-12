'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProgramProvider, useProgram } from '@/lib/auth/program-context';

function SetupForm() {
  const router = useRouter();
  const { setProgramId } = useProgram();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const body = {
      name: form.get('name') as string,
      level: form.get('level') as string,
      city: (form.get('city') as string) || undefined,
      state: (form.get('state') as string) || undefined,
      seasonYear: new Date().getFullYear(),
    };

    try {
      const res = await fetch('/api/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to create program');
      }

      const data = await res.json();
      setProgramId(data.program.id, data.program.name);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold tracking-tight">Audible</CardTitle>
          <CardDescription className="text-base">
            Set up your football program to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Program Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="Lincoln High Football"
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="level">Level</Label>
              <Select name="level" defaultValue="hs" required>
                <SelectTrigger id="level">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hs">High School</SelectItem>
                  <SelectItem value="d2">Division II</SelectItem>
                  <SelectItem value="d3">Division III</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" name="city" placeholder="Springfield" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input id="state" name="state" placeholder="TX" maxLength={2} />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Program'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SetupPage() {
  return (
    <ProgramProvider>
      <SetupForm />
    </ProgramProvider>
  );
}
