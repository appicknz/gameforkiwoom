"use client"

import { useDraggablePanel } from "@/hooks/use-draggable-panel"
import { GripHorizontal, ZoomIn, ZoomOut, RotateCcw } from "lucide-react"

interface DraggablePanelProps {
  id: string
  title: string
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  defaultExpanded?: boolean
}

export function DraggablePanel({ id, title, children, className = "", style = {} }: DraggablePanelProps) {
  const { state, panelStyle, dragging, onMouseDown, onTouchStart, reset, zoomIn, zoomOut } = useDraggablePanel(id)

  return (
    <div
      className={className}
      style={{
        ...panelStyle,
        ...style,
      }}
    >
      {/* 드래그 핸들바 */}
      <div
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onDoubleClick={reset}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "5px 8px 5px 10px",
          background: "rgba(212,175,55,0.06)",
          borderBottom: "1px solid rgba(212,175,55,0.12)",
          borderRadius: "12px 12px 0 0",
          cursor: dragging ? "grabbing" : "grab",
          userSelect: "none",
          WebkitUserSelect: "none",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <GripHorizontal size={13} style={{ color: "rgba(212,175,55,0.4)", flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: "rgba(212,175,55,0.55)", letterSpacing: "0.08em", fontWeight: 600 }}>
            {title}
          </span>
        </div>

        {/* 확대/축소 컨트롤 */}
        <div
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
          style={{ display: "flex", alignItems: "center", gap: 2 }}
        >
          <button
            onClick={zoomOut}
            title="축소"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(212,175,55,0.45)", padding: "2px 4px",
              borderRadius: 4, lineHeight: 1, display: "flex", alignItems: "center",
            }}
          >
            <ZoomOut size={12} />
          </button>
          <span style={{ fontSize: 9, color: "rgba(212,175,55,0.4)", minWidth: 28, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
            {Math.round(state.scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            title="확대"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(212,175,55,0.45)", padding: "2px 4px",
              borderRadius: 4, lineHeight: 1, display: "flex", alignItems: "center",
            }}
          >
            <ZoomIn size={12} />
          </button>
          <button
            onClick={reset}
            title="초기화"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(212,175,55,0.3)", padding: "2px 4px",
              borderRadius: 4, lineHeight: 1, display: "flex", alignItems: "center",
              marginLeft: 2,
            }}
          >
            <RotateCcw size={10} />
          </button>
        </div>
      </div>

      {/* 패널 콘텐츠 */}
      <div
        style={{
          transformOrigin: "top left",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  )
}
