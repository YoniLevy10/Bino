/**
 * Instant manager-segment fallback. Text only, so the first paint is not the
 * 271KB app icon. The route shell replaces this as soon as the page module is ready.
 */
export default function ManagerLoading() {
  return (
    <div
      dir="rtl"
      aria-busy="true"
      aria-label="טוען"
      style={{
        padding: '32px 40px',
        maxWidth: 1400,
        margin: '0 auto',
      }}
    >
      <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#718197' }}>טוען…</p>
    </div>
  )
}
