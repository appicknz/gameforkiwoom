export default function MarketLoading() {
  return (
    <main className="mx-auto min-h-[55vh] max-w-7xl px-4 py-6" aria-label="마켓 로딩 중">
      <div className="flex animate-pulse flex-col gap-4">
        <div className="h-10 w-36 rounded-xl bg-muted" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-9 w-24 shrink-0 rounded-full bg-muted" />)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-56 rounded-2xl border border-border bg-card" />)}
        </div>
      </div>
    </main>
  )
}
