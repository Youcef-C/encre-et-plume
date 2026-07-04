// Route-level loading UI. App Router renders this the instant a navigation
// starts (during the RSC fetch, or an on-demand dev compile) so clicking a
// link never leaves the previous page looking frozen. Prefetched routes are
// already resolved on click, so this doesn't flash on fast navigations.
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: 'calc(100dvh - 69px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        color: 'var(--ink2)',
        fontWeight: 500,
      }}
    >
      <span
        aria-hidden="true"
        className="ep-spinner"
        style={{
          width: 22,
          height: 22,
          border: '3px solid var(--border)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'ep-spin 0.7s linear infinite',
        }}
      />
      Chargement…
    </div>
  );
}
