'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BRAIN_NAV } from '@/lib/mbrain/nav'
import type { ReactNode } from 'react'

export function BrainShell({
  children,
  metaLabel,
}: {
  children: ReactNode
  metaLabel?: string
}) {
  const pathname = usePathname()

  return (
    <div className="mbrain-root min-h-screen text-[var(--mbrain-ink)]" dir="rtl">
      <div className="mbrain-bg" aria-hidden />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1400px] gap-0 md:gap-6 px-3 py-4 md:px-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <div className="sticky top-4 rounded-2xl border border-white/10 bg-[var(--mbrain-panel)]/80 p-4 backdrop-blur-md">
            <div className="mb-6">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--mbrain-muted)]">Levy</p>
              <h1 className="mt-1 text-xl font-semibold leading-tight text-white">Marketing Brain</h1>
              <p className="mt-1 text-xs text-[var(--mbrain-muted)]">מפעיל שיווק AI</p>
            </div>
            <nav className="flex flex-col gap-1">
              {BRAIN_NAV.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`rounded-lg px-3 py-2 text-sm transition ${
                      active
                        ? 'bg-[var(--mbrain-accent)] text-white'
                        : 'text-[var(--mbrain-muted)] hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
            {metaLabel ? (
              <div
                className={`mt-6 rounded-lg px-3 py-2 text-center text-[11px] font-medium tracking-wide ${
                  metaLabel === 'LIVE META DATA'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-amber-500/15 text-amber-200'
                }`}
              >
                {metaLabel}
              </div>
            ) : null}
            <Link href="/" className="mt-4 block text-center text-xs text-[var(--mbrain-muted)] hover:text-white">
              ← חזרה לבמקור
            </Link>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="mb-4 flex items-center justify-between gap-3 md:hidden">
            <div>
              <p className="text-xs text-[var(--mbrain-muted)]">Levy Marketing Brain</p>
              <p className="font-semibold text-white">תא הפיקוד</p>
            </div>
            {metaLabel ? (
              <span className="rounded-md bg-amber-500/15 px-2 py-1 text-[10px] text-amber-200">{metaLabel}</span>
            ) : null}
          </header>
          <nav className="mb-4 flex gap-2 overflow-x-auto pb-2 md:hidden">
            {BRAIN_NAV.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={`shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs ${
                  pathname.startsWith(item.href) ? 'bg-white/10 text-white' : 'text-[var(--mbrain-muted)]'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </div>
  )
}
