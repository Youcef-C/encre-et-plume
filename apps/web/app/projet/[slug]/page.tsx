// CS-2 — "/projet/[slug]" route: the tabbed project workspace. Thin server shell around the
// auth-gated client (useSearchParams for ?tab= needs a Suspense boundary in the App Router).
import { Suspense } from 'react';
import ProjectWorkspaceClient from '../../../components/projet/ProjectWorkspaceClient';

export default function ProjetWorkspacePage() {
  return (
    <Suspense fallback={<div aria-busy="true" style={{ minHeight: 300 }} />}>
      <ProjectWorkspaceClient />
    </Suspense>
  );
}
