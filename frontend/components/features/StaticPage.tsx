import React from 'react';

export default function StaticPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="container mx-auto py-12 px-4 max-w-3xl">
      <h1 className="text-3xl font-bold mb-6">{title}</h1>
      <div className="prose prose-sm max-w-none text-muted-foreground space-y-4">
        {children}
      </div>
    </div>
  );
}
