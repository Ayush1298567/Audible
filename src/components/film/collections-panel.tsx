'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Collections panel — named clip packages.
 *
 * Coaches create collections like "3rd Down Tendencies" or "Red Zone".
 * They add plays from the film room to collections for film sessions,
 * scouting review, or sharing with position coaches.
 */

interface Collection {
  id: string;
  name: string;
  description: string | null;
  playCount: number;
}

interface CollectionsPanelProps {
  programId: string;
  selectedPlayId: string | null;
  onFilterByCollection: (collectionId: string | null) => void;
  activeCollectionId: string | null;
}

export function CollectionsPanel({
  programId,
  selectedPlayId,
  onFilterByCollection,
  activeCollectionId,
}: CollectionsPanelProps) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  const loadCollections = useCallback(async () => {
    const res = await fetch(`/api/collections?programId=${programId}`);
    const data = await res.json();
    setCollections(data.collections ?? []);
    setIsLoading(false);
  }, [programId]);

  useEffect(() => {
    void loadCollections();
  }, [loadCollections]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsCreating(true);
    const form = new FormData(e.currentTarget);
    const name = form.get('name') as string;
    const description = (form.get('description') as string) || undefined;

    const res = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ programId, name, description }),
    });

    if (res.ok) {
      setShowCreate(false);
      void loadCollections();
    }
    setIsCreating(false);
  }

  async function handleAddPlay(collectionId: string) {
    if (!selectedPlayId) return;
    setAddingTo(collectionId);

    await fetch('/api/collections', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        programId,
        collectionId,
        playId: selectedPlayId,
        action: 'add',
      }),
    });

    setAddingTo(null);
    void loadCollections();
  }

  async function handleDelete(collectionId: string) {
    await fetch('/api/collections', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ programId, collectionId }),
    });

    if (activeCollectionId === collectionId) {
      onFilterByCollection(null);
    }
    void loadCollections();
  }

  if (isLoading) {
    return (
      <div className="py-3">
        <p className="font-display text-[10px] uppercase tracking-widest text-slate-500 animate-pulse">
          Loading collections...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-display text-[10px] uppercase tracking-widest text-slate-500">
          Collections
        </p>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="font-display text-[10px] uppercase tracking-widest text-primary hover:text-primary/80 transition-colors"
        >
          {showCreate ? 'Cancel' : '+ New'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="space-y-2 rounded-lg border border-slate-700/50 bg-white/[0.02] p-3">
          <Input
            name="name"
            placeholder="Collection name"
            required
            autoFocus
            className="h-8 text-xs bg-white/[0.03] border-border/50 focus:border-primary/50 placeholder:text-muted-foreground/40"
          />
          <Input
            name="description"
            placeholder="Description (optional)"
            className="h-8 text-xs bg-white/[0.03] border-border/50 focus:border-primary/50 placeholder:text-muted-foreground/40"
          />
          <Button
            type="submit"
            size="sm"
            className="w-full font-display text-[10px] uppercase tracking-widest"
            disabled={isCreating}
          >
            {isCreating ? 'Creating...' : 'Create Collection'}
          </Button>
        </form>
      )}

      {/* Collection list */}
      {collections.length === 0 && !showCreate ? (
        <p className="text-xs text-slate-500 py-2">
          No collections yet. Create one to group clips for film sessions.
        </p>
      ) : (
        <div className="space-y-1">
          {/* "All plays" option */}
          <button
            type="button"
            onClick={() => onFilterByCollection(null)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
              activeCollectionId === null
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-300'
            }`}
          >
            <span>All Plays</span>
          </button>

          {collections.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                activeCollectionId === c.id
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'text-slate-400 hover:bg-white/[0.03]'
              }`}
            >
              <button
                type="button"
                onClick={() => onFilterByCollection(c.id)}
                className="flex-1 text-left text-xs hover:text-slate-200 transition-colors"
              >
                <span className="font-medium">{c.name}</span>
                <span className="ml-2 text-slate-500">{c.playCount}</span>
              </button>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Add selected play to this collection */}
                {selectedPlayId && (
                  <button
                    type="button"
                    onClick={() => handleAddPlay(c.id)}
                    disabled={addingTo === c.id}
                    className="flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
                    title="Add selected play"
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M6 2v8M2 6h8" />
                    </svg>
                  </button>
                )}

                {/* Delete collection */}
                <button
                  type="button"
                  onClick={() => handleDelete(c.id)}
                  className="flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  title="Delete collection"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M2 6h8" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
