import { describe, it, expect } from 'vitest'
import { preserveRootPosition } from './treeViewPositioning'

describe('preserveRootPosition', () => {
  it('keeps root screen position stable when algorithm changes', () => {
    const result = preserveRootPosition({
      horizontalGap: 10,
      panOffset: { x: 0, y: 0 },
      layoutRootX: 100,
      layoutRootY: 50,
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
      previousRootScreenX: 180,
      previousRootScreenY: 90,
      hasUserInteracted: true,
      isInteracting: false,
      algorithmChanged: true,
    })

    expect(result.didAdjust).toBe(true)
    expect(result.rootScreenX).toBeCloseTo(180, 5)
    expect(result.rootScreenY).toBeCloseTo(90, 5)
  })

  it('does not adjust when algorithm did not change', () => {
    const result = preserveRootPosition({
      horizontalGap: 10,
      panOffset: { x: 5, y: -10 },
      layoutRootX: 20,
      layoutRootY: 30,
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
      previousRootScreenX: 100,
      previousRootScreenY: 200,
      hasUserInteracted: true,
      isInteracting: false,
      algorithmChanged: false,
    })

    expect(result.didAdjust).toBe(false)
    expect(result.panOffset).toEqual({ x: 5, y: -10 })
  })

  it('skips tiny adjustments under the threshold', () => {
    const result = preserveRootPosition({
      horizontalGap: 10,
      panOffset: { x: 0, y: 0 },
      layoutRootX: 100,
      layoutRootY: 0,
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
      previousRootScreenX: 110.2,
      previousRootScreenY: 10,
      hasUserInteracted: true,
      isInteracting: false,
      algorithmChanged: true,
      minPanAdjust: 0.5,
    })

    expect(result.didAdjust).toBe(false)
    expect(result.rootScreenX).toBeCloseTo(110, 5)
  })
})
