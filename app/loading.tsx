export default function RootLoading() {
  return (
    <div
      dir="rtl"
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        background: '#F9F9FB',
      }}
      aria-busy="true"
      aria-label="טוען"
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: 'linear-gradient(135deg, #0066FF 0%, #0055DD 100%)',
          opacity: 0.9,
        }}
      />
      <div
        style={{
          width: 160,
          height: 8,
          borderRadius: 999,
          background: '#E8E8ED',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: '40%',
            height: '100%',
            borderRadius: 999,
            background: '#0066FF',
            animation: 'bamakor-loading-bar 1.2s ease-in-out infinite',
          }}
        />
      </div>
      <style>{`
        @keyframes bamakor-loading-bar {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(120%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  )
}
