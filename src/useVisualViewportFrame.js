import { useLayoutEffect } from 'react'

// Fixed app surfaces follow the area actually visible after browser chrome or
// the keyboard changes. Native document-scrolling forms opt out entirely.
export function useVisualViewportFrame(ref, enabled = true) {
  useLayoutEffect(() => {
    if (!enabled) return
    const element = ref.current
    const viewport = window.visualViewport
    let frame = 0
    const update = () => {
      frame = 0
      // Preserve the user's pinch zoom and pan instead of resizing against it.
      if (viewport && Math.abs(viewport.scale - 1) > .01) return
      const inset = window.matchMedia('(min-width: 700px)').matches ? 22 : 0
      element?.style.setProperty('--visual-viewport-top', `${(viewport?.offsetTop || 0) + inset}px`)
      element?.style.setProperty('--visual-viewport-height', `${Math.max(0, (viewport?.height || window.innerHeight) - inset * 2)}px`)
    }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update) }
    update()
    viewport?.addEventListener('resize', schedule)
    viewport?.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    window.addEventListener('pageshow', schedule)
    return () => {
      window.cancelAnimationFrame(frame)
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('pageshow', schedule)
      element?.style.removeProperty('--visual-viewport-top')
      element?.style.removeProperty('--visual-viewport-height')
    }
  }, [ref, enabled])
}
