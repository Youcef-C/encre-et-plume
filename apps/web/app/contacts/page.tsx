// MC-8 — "Contacts & connexions": the current user's network, connection requests and suggestions.
import ContactsClient from '../../components/contacts/ContactsClient';

// F-24 F5: private surface — never indexed.
export const metadata = { title: 'Contacts & connexions — Encre & Plume', robots: { index: false, follow: false } };

export default function ContactsPage() {
  return <ContactsClient />;
}
