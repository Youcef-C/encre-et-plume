// CS-10 — "/projet/[slug]/groupe" ("Gérer le groupe"): thin server shell around the auth-gated client.
import GroupePermissionsClient from '../../../../components/projet/GroupePermissionsClient';

export default function GroupePermissionsPage() {
  return <GroupePermissionsClient />;
}
