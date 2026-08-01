// CS-6 — "/projet/[slug]/arrangement" (« Réorganiser les pages »): thin server shell around the
// auth-gated client, like the groupe route.
import ArrangementClient from '../../../../components/projet/ArrangementClient';

export default function ArrangementPage() {
  return <ArrangementClient />;
}
