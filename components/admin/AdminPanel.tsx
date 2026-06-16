// Design Ref: §5.3 Component List — 라이트 카드 공용 컨테이너.

interface Props {
  title?: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function AdminPanel({ title, description, actions, children, className = '' }: Props) {
  return (
    <section className={`bg-white rounded-lg border border-[#ebebeb] ${className}`}>
      {(title || actions) && (
        <header className="flex items-center gap-3 px-6 py-4 border-b border-zinc-100">
          {title && (
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
              {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
            </div>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-6">{children}</div>
    </section>
  )
}
