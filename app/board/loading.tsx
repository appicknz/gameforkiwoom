export default function BoardLoading() {
  return (
    <main className="mx-auto min-h-[55vh] max-w-7xl px-4 py-6" aria-label="게시판 로딩 중">
      <div className="flex animate-pulse flex-col gap-4">
        <div className="h-10 w-44 rounded-xl bg-muted" />
        <div className="h-12 rounded-2xl bg-muted" />
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-36 rounded-2xl border border-border bg-card" />)}
        </div>
      </div>
    </main>
  )
}
