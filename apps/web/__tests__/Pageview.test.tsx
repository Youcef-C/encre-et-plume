import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import Pageview from '../components/Pageview';

vi.mock('next/navigation', () => ({ usePathname: vi.fn(() => '/') }));

const mockedPathname = vi.mocked(usePathname);

function lastCall() {
  const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
  const [url, init] = calls[calls.length - 1] as [string, RequestInit];
  return { url, init, body: JSON.parse(init.body as string) as Record<string, unknown> };
}

describe('Pageview (F-23 F1/F2)', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))) as never;
    mockedPathname.mockReturnValue('/');
    Object.defineProperty(document, 'referrer', { value: '', configurable: true });
  });

  afterEach(() => vi.restoreAllMocks());

  it('renders nothing at all', () => {
    const { container } = render(<Pageview />);

    expect(container).toBeEmptyDOMElement();
  });

  it('posts one visit for the current pathname', () => {
    mockedPathname.mockReturnValue('/oeuvre/lames-de-brume');
    render(<Pageview />);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const { url, init, body } = lastCall();
    expect(url).toMatch(/\/events$/);
    expect(init.method).toBe('POST');
    expect(body).toMatchObject({ kind: 'visit', path: '/oeuvre/lames-de-brume' });
  });

  it('uses keepalive so the beacon survives the navigation that fired it', () => {
    render(<Pageview />);

    expect(lastCall().init.keepalive).toBe(true);
  });

  it("sends the session cookie — sendBeacon cannot carry credentials cross-origin", () => {
    render(<Pageview />);

    expect(lastCall().init.credentials).toBe('include');
  });

  it('fires again on a pathname change, once per path', () => {
    const { rerender } = render(<Pageview />);
    mockedPathname.mockReturnValue('/catalogue');
    rerender(<Pageview />);

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(lastCall().body.path).toBe('/catalogue');
  });

  it('does not re-fire when the same path re-renders', () => {
    const { rerender } = render(<Pageview />);
    rerender(<Pageview />);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('sends an external referrer only on the first view of the document', () => {
    Object.defineProperty(document, 'referrer', {
      value: 'https://www.google.com/search?q=manga',
      configurable: true,
    });
    const { rerender } = render(<Pageview />);
    expect(lastCall().body.ref).toBe('https://www.google.com/search?q=manga');

    mockedPathname.mockReturnValue('/catalogue');
    rerender(<Pageview />);
    // A client-side navigation is not a new acquisition — document.referrer never changed.
    expect(lastCall().body.ref).toBeUndefined();
  });

  it('never sends our own host as a referrer', () => {
    Object.defineProperty(document, 'referrer', {
      value: `${window.location.origin}/accueil`,
      configurable: true,
    });
    render(<Pageview />);

    expect(lastCall().body.ref).toBeUndefined();
  });

  it('a rejected beacon never surfaces as an error', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('offline'))) as never;

    expect(() => render(<Pageview />)).not.toThrow();
    await Promise.resolve();
  });

  // ── F2 · the headline check: measurement writes NOTHING to the browser ──────

  it('writes no localStorage entry', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    mockedPathname.mockReturnValue('/catalogue');

    render(<Pageview />);

    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it('reads no localStorage entry either — nothing to consent to', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');

    render(<Pageview />);

    expect(getItem).not.toHaveBeenCalled();
  });

  it('writes no sessionStorage entry', () => {
    render(<Pageview />);

    expect(sessionStorage.length).toBe(0);
  });

  it('sets no cookie', () => {
    const before = document.cookie;

    render(<Pageview />);

    expect(document.cookie).toBe(before);
    expect(document.cookie).not.toContain('visitor');
  });
});
