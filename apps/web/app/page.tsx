// DR-1 — Home "Accueil" showroom landing. Real implementation lives in AccueilClient
// (fetches the six public /home/* feeds; loading/empty/error handled per section).
import AccueilClient from '../components/AccueilClient';

export default function HomePage() {
  return <AccueilClient />;
}
