export interface RootPositionOptions {
  horizontalGap: number
  panOffset: { x: number; y: number }
  layoutRootX: number
  layoutRootY: number
  offsetX: number
  offsetY: number
  zoom: number
  previousRootScreenX: number | null
  previousRootScreenY: number | null
  hasUserInteracted: boolean
  isInteracting: boolean
  algorithmChanged: boolean
  minPanAdjust?: number
}

export interface RootPositionResult {
  panOffset: { x: number; y: number }
  rootScreenX: number
  rootScreenY: number
  didAdjust: boolean
}

export function preserveRootPosition(options: RootPositionOptions): RootPositionResult {
  const {
    horizontalGap,
    panOffset,
    layoutRootX,
    layoutRootY,
    offsetX,
    offsetY,
    zoom,
    previousRootScreenX,
    previousRootScreenY,
    hasUserInteracted,
    isInteracting,
    algorithmChanged,
    minPanAdjust = 0.5,
  } = options

  const newRootScreenX = horizontalGap + panOffset.x + (layoutRootX + offsetX) * zoom
  const newRootScreenY = horizontalGap + panOffset.y + (layoutRootY + offsetY) * zoom

  let adjustedPan = panOffset
  let didAdjust = false

  const shouldAdjust = hasUserInteracted &&
    !isInteracting &&
    algorithmChanged &&
    previousRootScreenX !== null &&
    previousRootScreenY !== null

  if (shouldAdjust) {
    const panAdjustX = previousRootScreenX - newRootScreenX
    const panAdjustY = previousRootScreenY - newRootScreenY

    if (Math.abs(panAdjustX) > minPanAdjust || Math.abs(panAdjustY) > minPanAdjust) {
      adjustedPan = {
        x: panOffset.x + panAdjustX,
        y: panOffset.y + panAdjustY,
      }
      didAdjust = true
    }
  }

  const rootScreenX = horizontalGap + adjustedPan.x + (layoutRootX + offsetX) * zoom
  const rootScreenY = horizontalGap + adjustedPan.y + (layoutRootY + offsetY) * zoom

  return {
    panOffset: adjustedPan,
    rootScreenX,
    rootScreenY,
    didAdjust,
  }
}
