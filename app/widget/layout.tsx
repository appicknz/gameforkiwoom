export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="widget-root">
      {children}
    </div>
  )
}
