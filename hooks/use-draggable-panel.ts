"use client"

import { useState, useRef, useCallback, useEffect } from "react"

export interface PanelState {
  x: number
  y: number
  scale: number
}

const DEFAULTS: PanelState = { x: 0, y: 0, scale: 1 }
const SCALE_MIN = 0.5
const SCALE_MAX = 1.5
const SCALE_STEP = 0.1

function load(key: string): PanelState {
  if (typeof window === "undefined") return DEFAULTS
  try {
    const raw = localStorage.getItem(`panel:${key}`)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<PanelState>
    return {
      x: parsed.x ?? 0,
      y: parsed.y ?? 0,
      scale: Math.min(SCALE_MAX, Math.max(SCALE_MIN, parsed.scale ?? 1)),
    }
  } catch {
    return DEFAULTS
  }
}

function save(key: string, state: PanelState) {
  if (typeof window === "undefined") return
  localStorage.setItem(`panel:${key}`, JSON.stringify(state))
}

export function useDraggablePanel(key: string) {
  const [state, setState] = useState<PanelState>(() => load(key))
  const [dragging, setDragging] = useState(false)
  const startRef = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  // persist on change
  useEffect(() => { save(key, state) }, [key, state])

  // reset double-click
  const reset = useCallback(() => {
    const def = DEFAULTS
    setState(def)
    save(key, def)
  }, [key])

  // scale buttons
  const zoomIn = useCallback(() =>
    setState(prev => {
      const next = { ...prev, scale: Math.min(SCALE_MAX, +(prev.scale + SCALE_STEP).toFixed(2)) }
      save(key, next); return next
    }), [key])

  const zoomOut = useCallback(() =>
    setState(prev => {
      const next = { ...prev, scale: Math.max(SCALE_MIN, +(prev.scale - SCALE_STEP).toFixed(2)) }
      save(key, next); return next
    }), [key])

  // drag handlers — attach to the handle element
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    startRef.current = { mx: e.clientX, my: e.clientY, px: state.x, py: state.y }
    setDragging(true)

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startRef.current.mx
      const dy = ev.clientY - startRef.current.my
      setState(prev => ({ ...prev, x: startRef.current.px + dx, y: startRef.current.py + dy }))
    }
    const onUp = () => {
      setDragging(false)
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
  }, [state.x, state.y])

  // touch drag
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    startRef.current = { mx: t.clientX, my: t.clientY, px: state.x, py: state.y }
    setDragging(true)

    const onMove = (ev: TouchEvent) => {
      const tt = ev.touches[0]
      const dx = tt.clientX - startRef.current.mx
      const dy = tt.clientY - startRef.current.my
      setState(prev => ({ ...prev, x: startRef.current.px + dx, y: startRef.current.py + dy }))
    }
    const onEnd = () => {
      setDragging(false)
      document.removeEventListener("touchmove", onMove)
      document.removeEventListener("touchend", onEnd)
    }
    document.addEventListener("touchmove", onMove, { passive: true })
    document.addEventListener("touchend", onEnd)
  }, [state.x, state.y])

  const panelStyle: React.CSSProperties = {
    transform: `translate(${state.x}px, ${state.y}px) scale(${state.scale})`,
    transformOrigin: "top left",
    transition: dragging ? "none" : "transform 0.18s cubic-bezier(0.23,1,0.32,1)",
    willChange: "transform",
    zIndex: dragging ? 50 : undefined,
    position: "relative",
  }

  return { state, panelStyle, dragging, onMouseDown, onTouchStart, reset, zoomIn, zoomOut }
}
