import MotDePasseOublieClient from './MotDePasseOublieClient';

// F-24 F5: private surface — never indexed.
export const metadata = { title: 'Mot de passe oublié — Encre & Plume', robots: { index: false, follow: false } };

export default function MotDePasseOubliePage() {
  return <MotDePasseOublieClient />;
}
