import type { ReactNode } from 'react'

interface NotFoundPageProps {
  action?: ReactNode
}

export function NotFoundPage({ action }: NotFoundPageProps) {
  return (
    <section
      aria-labelledby="not-found-title"
      className="mx-auto flex max-w-xl flex-col items-center px-6 py-16 text-center"
    >
      <svg
        aria-hidden="true"
        className="h-40 w-40 text-blue-600"
        fill="none"
        viewBox="0 0 160 160"
      >
        <circle cx="80" cy="80" r="56" className="fill-blue-50 stroke-current" strokeWidth="6" />
        <path
          className="stroke-current"
          d="m98 98 22 22M68 68h24M68 86h14"
          strokeLinecap="round"
          strokeWidth="8"
        />
        <text
          x="80"
          y="125"
          className="fill-current text-[24px] font-bold"
          textAnchor="middle"
        >
          404
        </text>
      </svg>
      <h1 id="not-found-title" className="mt-6 text-2xl font-semibold text-slate-900">
        Page not found
      </h1>
      <p className="mt-2 text-slate-600">
        The page you are looking for is not available.
      </p>
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  )
}
