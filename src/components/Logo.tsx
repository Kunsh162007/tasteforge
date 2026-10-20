/** The TasteForge mark: three palette bands inked onto a sheet. Decorative; the wordmark carries the name. */
export function Logo() {
  return (
    <svg className="masthead__logo" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="6" y="9" width="6" height="17" fill="var(--accent)" />
      <rect x="13" y="6" width="6" height="20" fill="currentColor" />
      <rect x="20" y="12" width="6" height="14" fill="var(--accent)" opacity="0.55" />
    </svg>
  );
}
