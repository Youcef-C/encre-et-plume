// F-16: Template rendering tests — renderEmail() with layout.
import { renderEmail } from './render';

const VERIFY_PARAMS = {
  displayName: 'Yuki Moreau',
  verifyUrl: 'http://localhost:3000/verifier-email?token=abc123',
};

const RESET_PARAMS = {
  displayName: 'Yuki Moreau',
  resetUrl: 'http://localhost:3000/reinitialiser-mot-de-passe?token=secret-token-xyz',
};

const CHANGED_PARAMS = { displayName: 'Yuki Moreau' };
const WELCOME_PARAMS = { displayName: 'Yuki Moreau' };

describe('renderEmail — email_verification', () => {
  it('returns French subject containing "Encre & Plume"', () => {
    const { subject } = renderEmail('email_verification', VERIFY_PARAMS);
    expect(subject).toContain('Encre & Plume');
  });

  it('text contains verifyUrl and displayName', () => {
    const { text } = renderEmail('email_verification', VERIFY_PARAMS);
    expect(text).toContain('Yuki Moreau');
    expect(text).toContain('http://localhost:3000/verifier-email?token=abc123');
  });

  it('html is well-formed (contains <html and </html>)', () => {
    const { html } = renderEmail('email_verification', VERIFY_PARAMS);
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('html contains the platform header wordmark', () => {
    const { html } = renderEmail('email_verification', VERIFY_PARAMS);
    expect(html).toContain('Encre');
    expect(html).toContain('Plume');
  });

  it('html contains mentions-légales footer placeholder', () => {
    const { html } = renderEmail('email_verification', VERIFY_PARAMS);
    expect(html).toContain('Mentions légales');
  });

  it('mandatory template html does NOT contain an unsubscribe link', () => {
    const { html } = renderEmail('email_verification', VERIFY_PARAMS);
    expect(html).not.toContain('désabonner');
  });
});

describe('renderEmail — password_reset', () => {
  it('French subject contains "Encre & Plume"', () => {
    const { subject } = renderEmail('password_reset', RESET_PARAMS);
    expect(subject).toContain('Encre & Plume');
  });

  it('text contains resetUrl, displayName, "1 heure", "ignorez"', () => {
    const { text } = renderEmail('password_reset', RESET_PARAMS);
    expect(text).toContain('Yuki Moreau');
    expect(text).toContain(RESET_PARAMS.resetUrl);
    expect(text).toContain('1 heure');
    expect(text.toLowerCase()).toContain('ignorez');
  });

  it('html is well-formed and has platform header + footer', () => {
    const { html } = renderEmail('password_reset', RESET_PARAMS);
    expect(html).toContain('<html');
    expect(html).toContain('Encre');
    expect(html).toContain('Mentions légales');
  });
});

describe('renderEmail — password_changed', () => {
  it('French subject contains "Encre & Plume"', () => {
    const { subject } = renderEmail('password_changed', CHANGED_PARAMS);
    expect(subject).toContain('Encre & Plume');
  });

  it('text contains displayName', () => {
    const { text } = renderEmail('password_changed', CHANGED_PARAMS);
    expect(text).toContain('Yuki Moreau');
  });

  it('html has header and footer', () => {
    const { html } = renderEmail('password_changed', CHANGED_PARAMS);
    expect(html).toContain('<html');
    expect(html).toContain('Mentions légales');
  });
});

describe('renderEmail — support_ticket_received (F-21)', () => {
  const SUPPORT_PARAMS = {
    ticketId: 'tkt-123',
    category: 'bug',
    name: 'Yuki Moreau',
    email: 'yuki@test.com',
    message: 'La page ne charge pas.',
    contextSummary: 'url: /oeuvre/x / UA: Firefox / requestId: req-9',
  };

  it('subject tags the ticket with category and id', () => {
    const { subject } = renderEmail('support_ticket_received', SUPPORT_PARAMS);
    expect(subject).toContain('[Support]');
    expect(subject).toContain('bug');
    expect(subject).toContain('tkt-123');
  });

  it('text carries name, reply-to email, message and contextSummary', () => {
    const { text } = renderEmail('support_ticket_received', SUPPORT_PARAMS);
    expect(text).toContain('Yuki Moreau');
    expect(text).toContain('yuki@test.com');
    expect(text).toContain('La page ne charge pas.');
    expect(text).toContain('url: /oeuvre/x / UA: Firefox / requestId: req-9');
  });

  it('html is well-formed', () => {
    const { html } = renderEmail('support_ticket_received', SUPPORT_PARAMS);
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });
});

describe('renderEmail — welcome', () => {
  it('French subject (Bienvenue) contains "Encre & Plume"', () => {
    const { subject } = renderEmail('welcome', WELCOME_PARAMS);
    expect(subject).toContain('Encre & Plume');
    expect(subject.toLowerCase()).toContain('bienvenue');
  });

  it('text contains displayName and no token/URL', () => {
    const { text } = renderEmail('welcome', WELCOME_PARAMS);
    expect(text).toContain('Yuki Moreau');
    expect(text).not.toContain('http://');
  });

  it('html is well-formed and mandatory (no unsubscribe)', () => {
    const { html } = renderEmail('welcome', WELCOME_PARAMS);
    expect(html).toContain('<html');
    expect(html).toContain('Mentions légales');
    expect(html).not.toContain('désabonner');
  });
});
