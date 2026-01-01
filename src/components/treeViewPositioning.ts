export interface RootPositionOptions {
  /** Margin between canvas edge and tree content */
  canvasMargin: number
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

/**
 * Calculate pan offset adjustments to preserve root screen position when switching
 * layout algorithms.
 *
 * When a user has panned/zoomed the view and then switches algorithms, the tree's
 * root node may move to a different position. This function calculates the pan
 * adjustment needed to keep the root at its previous screen position, providing
 * a stable visual experience.
 */
export function preserveRootPosition(options: RootPositionOptions): RootPositionResult {
  const {
    canvasMargin,
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

  const newRootScreenX = canvasMargin + panOffset.x + (layoutRootX + offsetX) * zoom
  const newRootScreenY = canvasMargin + panOffset.y + (layoutRootY + offsetY) * zoom

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

  const rootScreenX = canvasMargin + adjustedPan.x + (layoutRootX + offsetX) * zoom
  const rootScreenY = canvasMargin + adjustedPan.y + (layoutRootY + offsetY) * zoom

  return {
    panOffset: adjustedPan,
    rootScreenX,
    rootScreenY,
    didAdjust,
  }
}
