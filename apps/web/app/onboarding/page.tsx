import { Suspense } from 'react';
import OnboardingClient from './OnboardingClient';

// F-24 F5: private surface — never indexed.
export const metadata = { robots: { index: false, follow: false } };

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingClient />
    </Suspense>
  );
}
