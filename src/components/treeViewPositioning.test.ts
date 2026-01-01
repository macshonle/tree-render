import { describe, it, expect } from 'vitest'
import { preserveRootPosition } from './treeViewPositioning'

describe('preserveRootPosition', () => {
  it('keeps root screen position stable when algorithm changes', () => {
    const result = preserveRootPosition({
      canvasMargin: 10,
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
      canvasMargin: 10,
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
      canvasMargin: 10,
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

  it('does not adjust when user has not interacted', () => {
    const result = preserveRootPosition({
      canvasMargin: 10,
      panOffset: { x: 0, y: 0 },
      layoutRootX: 100,
      layoutRootY: 50,
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
      previousRootScreenX: 200,
      previousRootScreenY: 100,
      hasUserInteracted: false,
      isInteracting: false,
      algorithmChanged: true,
    })

    expect(result.didAdjust).toBe(false)
  })

  it('does not adjust during active interaction (panning/zooming)', () => {
    const result = preserveRootPosition({
      canvasMargin: 10,
      panOffset: { x: 50, y: 50 },
      layoutRootX: 100,
      layoutRootY: 50,
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
      previousRootScreenX: 200,
      previousRootScreenY: 100,
      hasUserInteracted: true,
      isInteracting: true,
      algorithmChanged: true,
    })

    expect(result.didAdjust).toBe(false)
  })

  it('does not adjust when previous position is null', () => {
    const result = preserveRootPosition({
      canvasMargin: 10,
      panOffset: { x: 0, y: 0 },
      layoutRootX: 100,
      layoutRootY: 50,
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
      previousRootScreenX: null,
      previousRootScreenY: null,
      hasUserInteracted: true,
      isInteracting: false,
      algorithmChanged: true,
    })

    expect(result.didAdjust).toBe(false)
  })
})

describe('preserveRootPosition - zoom handling', () => {
  it('correctly calculates position with zoom > 1', () => {
    const result = preserveRootPosition({
      canvasMargin: 10,
      panOffset: { x: 0, y: 0 },
      layoutRootX: 50,
      layoutRootY: 25,
      offsetX: 0,
      offsetY: 0,
      zoom: 2,
      previousRootScreenX: 210,
      previousRootScreenY: 110,
      hasUserInteracted: true,
      isInteracting: false,
      algorithmChanged: true,
    })

    // With zoom=2: rootScreenX = 10 + 0 + (50 + 0) * 2 = 110
    // Previous was 210, so adjustment should be +100
    expect(result.didAdjust).toBe(true)
    expect(result.rootScreenX).toBeCloseTo(210, 5)
    expect(result.rootScreenY).toBeCloseTo(110, 5)
  })

  it('correctly calculates position with zoom < 1', () => {
    const result = preserveRootPosition({
      canvasMargin: 10,
      panOffset: { x: 0, y: 0 },
      layoutRootX: 100,
      layoutRootY: 100,
      offsetX: 0,
      offsetY: 0,
      zoom: 0.5,
      previousRootScreenX: 110,
      previousRootScreenY: 110,
      hasUserInteracted: true,
      isInteracting: false,
      algorithmChanged: true,
    })

    // With zoom=0.5: rootScreenX = 10 + 0 + (100 + 0) * 0.5 = 60
    // Previous was 110, so adjustment should be +50
    expect(result.didAdjust).toBe(true)
    expect(result.rootScreenX).toBeCloseTo(110, 5)
    expect(result.rootScreenY).toBeCloseTo(110, 5)
  })
})

describe('preserveRootPosition - offset handling', () => {
  it('correctly handles non-zero offsetX and offsetY', () => {
    const result = preserveRootPosition({
      canvasMargin: 10,
      panOffset: { x: 0, y: 0 },
      layoutRootX: 50,
      layoutRootY: 50,
      offsetX: 20,
      offsetY: 30,
      zoom: 1,
      previousRootScreenX: 150,
      previousRootScreenY: 160,
      hasUserInteracted: true,
      isInteracting: false,
      algorithmChanged: true,
    })

    // rootScreenX = 10 + 0 + (50 + 20) * 1 = 80
    // Previous was 150, so adjustment = 70
    expect(result.didAdjust).toBe(true)
    expect(result.rootScreenX).toBeCloseTo(150, 5)
    expect(result.rootScreenY).toBeCloseTo(160, 5)
  })

  it('correctly handles negative offset values', () => {
    const result = preserveRootPosition({
      canvasMargin: 10,
      panOffset: { x: 0, y: 0 },
      layoutRootX: 100,
      layoutRootY: 100,
      offsetX: -30,
      offsetY: -40,
      zoom: 1,
      previousRootScreenX: 130,
      previousRootScreenY: 120,
      hasUserInteracted: true,
      isInteracting: false,
      algorithmChanged: true,
    })

    // rootScreenX = 10 + 0 + (100 + -30) * 1 = 80
    // Previous was 130, adjustment = 50
    expect(result.didAdjust).toBe(true)
    expect(result.rootScreenX).toBeCloseTo(130, 5)
    expect(result.rootScreenY).toBeCloseTo(120, 5)
  })
})

describe('preserveRootPosition - combined zoom and offset', () => {
  it('handles zoom and offset together correctly', () => {
    const result = preserveRootPosition({
      canvasMargin: 20,
      panOffset: { x: 10, y: 5 },
      layoutRootX: 100,
      layoutRootY: 50,
      offsetX: 25,
      offsetY: 15,
      zoom: 1.5,
      previousRootScreenX: 300,
      previousRootScreenY: 200,
      hasUserInteracted: true,
      isInteracting: false,
      algorithmChanged: true,
    })

    // rootScreenX = 20 + 10 + (100 + 25) * 1.5 = 30 + 187.5 = 217.5
    // Previous was 300, adjustment = 82.5
    expect(result.didAdjust).toBe(true)
    expect(result.rootScreenX).toBeCloseTo(300, 5)
    expect(result.rootScreenY).toBeCloseTo(200, 5)
  })
})

describe('preserveRootPosition - edge cases', () => {
  it('handles zero canvas margin', () => {
    const result = preserveRootPosition({
      canvasMargin: 0,
      panOffset: { x: 0, y: 0 },
      layoutRootX: 100,
      layoutRootY: 50,
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
      previousRootScreenX: 150,
      previousRootScreenY: 75,
      hasUserInteracted: true,
      isInteracting: false,
      algorithmChanged: true,
    })

    expect(result.didAdjust).toBe(true)
    expect(result.rootScreenX).toBeCloseTo(150, 5)
    expect(result.rootScreenY).toBeCloseTo(75, 5)
  })

  it('handles very large coordinate values', () => {
    const result = preserveRootPosition({
      canvasMargin: 10,
      panOffset: { x: 0, y: 0 },
      layoutRootX: 10000,
      layoutRootY: 10000,
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
      previousRootScreenX: 15000,
      previousRootScreenY: 15000,
      hasUserInteracted: true,
      isInteracting: false,
      algorithmChanged: true,
    })

    expect(result.didAdjust).toBe(true)
    expect(result.rootScreenX).toBeCloseTo(15000, 5)
    expect(result.rootScreenY).toBeCloseTo(15000, 5)
  })

  it('handles negative pan offset values', () => {
    const result = preserveRootPosition({
      canvasMargin: 10,
      panOffset: { x: -50, y: -30 },
      layoutRootX: 100,
      layoutRootY: 100,
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
      previousRootScreenX: 120,
      previousRootScreenY: 140,
      hasUserInteracted: true,
      isInteracting: false,
      algorithmChanged: true,
    })

    // rootScreenX = 10 + (-50) + (100 + 0) * 1 = 60
    // Previous was 120, adjustment = 60
    expect(result.didAdjust).toBe(true)
    expect(result.rootScreenX).toBeCloseTo(120, 5)
    expect(result.rootScreenY).toBeCloseTo(140, 5)
  })

  it('only adjusts in X when Y adjustment is below threshold', () => {
    const result = preserveRootPosition({
      canvasMargin: 10,
      panOffset: { x: 0, y: 0 },
      layoutRootX: 50,
      layoutRootY: 0,
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
      previousRootScreenX: 100,  // Needs 40px adjustment
      previousRootScreenY: 10.1, // Only needs 0.1px adjustment
      hasUserInteracted: true,
      isInteracting: false,
      algorithmChanged: true,
      minPanAdjust: 0.5,
    })

    // X adjustment is above threshold, so didAdjust should be true
    expect(result.didAdjust).toBe(true)
    expect(result.rootScreenX).toBeCloseTo(100, 5)
  })
})
