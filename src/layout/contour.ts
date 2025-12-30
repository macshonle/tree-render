/**
 * Y-Monotone Polygon Contour Utilities
 *
 * This module provides utilities for building and manipulating edge-aware
 * contours represented as Y-monotone polygons.
 *
 * Y-monotone polygons have the property that every horizontal line intersects
 * the boundary at most twice, which is guaranteed for tree layouts.
 */

import type { ContourPoint, YMonotonePolygon, EdgeContourStyle } from './types'

// ============================================================================
// Constants
// ============================================================================

/**
 * Small epsilon for y-coordinate comparisons.
 * Used when filtering union boundary points to exclude points at exactly
 * the child's top edge (which are handled by edge geometry instead).
 *
 * This value should be smaller than any meaningful coordinate difference
 * but larger than floating point precision errors.
 */
const Y_EPSILON = 0.001

// ============================================================================
// Contour Creation
// ============================================================================

/**
 * Create a contour for a single rectangular node.
 *
 * The node is centered at origin (0, 0), with:
 * - left edge at -width/2
 * - right edge at +width/2
 * - top edge at -height/2
 * - bottom edge at +height/2
 *
 * @param width Node width in pixels
 * @param height Node height in pixels
 * @returns Y-monotone polygon with 4 corners (rectangle)
 */
export function createNodeContour(width: number, height: number): YMonotonePolygon {
  const halfW = width / 2
  const halfH = height / 2

  return {
    // Left boundary: top-left to bottom-left
    left: [
      { x: -halfW, y: -halfH },
      { x: -halfW, y: halfH },
    ],
    // Right boundary: top-right to bottom-right
    right: [
      { x: halfW, y: -halfH },
      { x: halfW, y: halfH },
    ],
  }
}

// ============================================================================
// Contour Transformation
// ============================================================================

/**
 * Translate a contour by (dx, dy).
 *
 * @param contour The contour to translate
 * @param dx Horizontal offset
 * @param dy Vertical offset
 * @returns New translated contour
 */
export function translateContour(
  contour: YMonotonePolygon,
  dx: number,
  dy: number
): YMonotonePolygon {
  return {
    left: contour.left.map((p) => ({ x: p.x + dx, y: p.y + dy })),
    right: contour.right.map((p) => ({ x: p.x + dx, y: p.y + dy })),
  }
}

/**
 * Clone a contour (deep copy).
 */
export function cloneContour(contour: YMonotonePolygon): YMonotonePolygon {
  return {
    left: contour.left.map((p) => ({ ...p })),
    right: contour.right.map((p) => ({ ...p })),
  }
}

/**
 * Get the bounding box of a contour.
 */
export function getContourBounds(contour: YMonotonePolygon): {
  top: number
  bottom: number
  left: number
  right: number
} {
  const allPoints = [...contour.left, ...contour.right]
  return {
    top: Math.min(...allPoints.map((p) => p.y)),
    bottom: Math.max(...allPoints.map((p) => p.y)),
    left: Math.min(...allPoints.map((p) => p.x)),
    right: Math.max(...allPoints.map((p) => p.x)),
  }
}

// ============================================================================
// Edge Connection Utilities
// ============================================================================

/**
 * Information about a child subtree for edge connection.
 */
export interface ChildContourInfo {
  /** The child's contour (in child's local coordinates) */
  contour: YMonotonePolygon
  /** Child's position relative to parent (parent at origin) */
  offsetX: number
  offsetY: number
  /** Child's node dimensions */
  width: number
  height: number
}

/**
 * Connect a parent node's contour to its children's contours based on edge style.
 *
 * This builds the complete subtree contour by:
 * 1. Starting with the parent node's rectangle
 * 2. Adding edge connection geometry based on edge style
 * 3. Incorporating the UNION of all children's subtree contours
 *
 * The union is important because a non-rightmost child might extend deeper
 * than the rightmost child, so we need to consider all children's boundaries.
 *
 * @param parentWidth Parent node width
 * @param parentHeight Parent node height
 * @param children Information about each child subtree
 * @param edgeStyle How edges connect parent to children
 * @returns Combined Y-monotone polygon for the subtree
 */
export function buildSubtreeContour(
  parentWidth: number,
  parentHeight: number,
  children: ChildContourInfo[],
  _edgeStyle: EdgeContourStyle
): YMonotonePolygon {
  // Start with parent node contour
  if (children.length === 0) {
    return createNodeContour(parentWidth, parentHeight)
  }

  const parentHalfW = parentWidth / 2
  const parentHalfH = parentHeight / 2
  const parentBottom = parentHalfH

  // Sort children by x position (left to right)
  const sortedChildren = [...children].sort((a, b) => a.offsetX - b.offsetX)

  // Get leftmost and rightmost children (for edge connection points)
  const leftChild = sortedChildren[0]
  const rightChild = sortedChildren[sortedChildren.length - 1]

  // Translate ALL children's contours to parent's coordinate system
  const translatedContours = sortedChildren.map((child) =>
    translateContour(child.contour, child.offsetX, child.offsetY)
  )

  // Compute the union of all children's contours
  // This is crucial: a non-rightmost child might have deep descendants
  // that extend below the rightmost child, and we need to include them
  const childrenUnion = unionContours(translatedContours)

  // Build the contour based on edge style.
  // - curve/straight-arrow: corner-to-corner diagonal (simple envelope)
  // - org-chart: includes horizontal bar geometry for accurate spacing
  if (_edgeStyle === 'org-chart') {
    return buildOrgChartEnvelopeContour(
      parentHalfW,
      parentHalfH,
      parentBottom,
      leftChild,
      rightChild,
      childrenUnion
    )
  }

  // For curve and straight-arrow, use corner-to-corner envelope
  return buildEnvelopeContour(
    parentHalfW,
    parentHalfH,
    parentBottom,
    leftChild,
    rightChild,
    childrenUnion
  )
}

/**
 * Build contour for org-chart edge style, which tightly hugs the edge geometry.
 *
 * Org-chart edges draw:
 * 1. A vertical line from parent bottom center down to a "bar Y" level
 * 2. A horizontal bar from leftmost child's CENTER x to rightmost child's CENTER x
 * 3. Vertical drops from the bar to each child's top center
 *
 * The contour traces this shape efficiently:
 * - Diagonal from parent corner to bar endpoint (child's center x at barY)
 * - Vertical drop to child's top center
 * - Horizontal step to child's outer edge
 * - Then follows the child's contour
 *
 * This gives 6 inflection points that tightly hug the actual edge geometry,
 * rather than over-claiming space with perpendicular steps.
 */
function buildOrgChartEnvelopeContour(
  parentHalfW: number,
  parentHalfH: number,
  parentBottom: number,
  leftChild: ChildContourInfo,
  rightChild: ChildContourInfo,
  childrenUnion: YMonotonePolygon
): YMonotonePolygon {
  const leftChildTop = leftChild.offsetY - leftChild.height / 2
  const leftChildLeft = leftChild.offsetX - leftChild.width / 2
  const leftChildCenterX = leftChild.offsetX // Where bar actually connects
  const rightChildTop = rightChild.offsetY - rightChild.height / 2
  const rightChildRight = rightChild.offsetX + rightChild.width / 2
  const rightChildCenterX = rightChild.offsetX // Where bar actually connects

  // Bar Y is at the midpoint between parent bottom and children top
  // (this matches where the rendering draws the horizontal bar)
  const childrenTopY = Math.min(leftChildTop, rightChildTop)
  const barY = parentBottom + (childrenTopY - parentBottom) / 2

  // Left boundary: 6 key points that hug the edge geometry
  const left: ContourPoint[] = [
    { x: -parentHalfW, y: -parentHalfH }, // 1. Parent top-left
    { x: -parentHalfW, y: parentBottom }, // 2. Parent bottom-left
  ]

  // The bar ends at the leftmost child's CENTER, not its edge
  // Use diagonal from parent corner to bar endpoint, then drop and step out
  if (leftChildCenterX < -parentHalfW) {
    // Bar extends beyond parent - diagonal to bar end, drop, step to edge
    left.push({ x: leftChildCenterX, y: barY }) // 3. Diagonal to bar endpoint
    left.push({ x: leftChildCenterX, y: leftChildTop }) // 4. Drop to child top center
    left.push({ x: leftChildLeft, y: leftChildTop }) // 5. Step to child left edge
  } else {
    // Child center is within parent width - diagonal to child's corner
    left.push({ x: leftChildLeft, y: leftChildTop })
  }

  // Add rest of the UNION's left boundary (skip points above the connection)
  for (const p of childrenUnion.left) {
    if (p.y > leftChildTop + Y_EPSILON) {
      left.push(p) // 6+ from children
    }
  }

  // Right boundary: mirror of left
  const right: ContourPoint[] = [
    { x: parentHalfW, y: -parentHalfH }, // 1. Parent top-right
    { x: parentHalfW, y: parentBottom }, // 2. Parent bottom-right
  ]

  // The bar ends at the rightmost child's CENTER, not its edge
  if (rightChildCenterX > parentHalfW) {
    // Bar extends beyond parent - diagonal to bar end, drop, step to edge
    right.push({ x: rightChildCenterX, y: barY }) // 3. Diagonal to bar endpoint
    right.push({ x: rightChildCenterX, y: rightChildTop }) // 4. Drop to child top center
    right.push({ x: rightChildRight, y: rightChildTop }) // 5. Step to child right edge
  } else {
    // Child center is within parent width - diagonal to child's corner
    right.push({ x: rightChildRight, y: rightChildTop })
  }

  // Add rest of the UNION's right boundary (skip points above the connection)
  for (const p of childrenUnion.right) {
    if (p.y > rightChildTop + Y_EPSILON) {
      right.push(p) // 6+ from children
    }
  }

  return { left, right }
}

/**
 * Build a uniform envelope contour for curve and straight-arrow edge styles.
 *
 * Uses corner-to-corner connections (parent bottom corners to child top corners)
 * which correctly envelopes all subtree geometry. This simple diagonal approach
 * works well for curve and straight-arrow edges where the visual rendering
 * stays within the diagonal envelope.
 */
function buildEnvelopeContour(
  parentHalfW: number,
  parentHalfH: number,
  parentBottom: number,
  leftChild: ChildContourInfo,
  rightChild: ChildContourInfo,
  childrenUnion: YMonotonePolygon
): YMonotonePolygon {
  const leftChildTop = leftChild.offsetY - leftChild.height / 2
  const leftChildLeft = leftChild.offsetX - leftChild.width / 2
  const rightChildTop = rightChild.offsetY - rightChild.height / 2
  const rightChildRight = rightChild.offsetX + rightChild.width / 2

  // Left boundary: parent top-left → parent bottom-left → child top-left (diagonal) → union's left boundary
  const left: ContourPoint[] = [
    { x: -parentHalfW, y: -parentHalfH }, // Parent top-left
    { x: -parentHalfW, y: parentBottom }, // Parent bottom-left
  ]

  // Diagonal connection to leftmost child's top-left
  // Only add if child is below parent (which it always should be)
  if (leftChildTop > parentBottom) {
    left.push({ x: leftChildLeft, y: leftChildTop })
  }

  // Add rest of the UNION's left boundary (skip points above the connection)
  // Include all points to retain full detail for layout calculations
  for (const p of childrenUnion.left) {
    if (p.y > leftChildTop + Y_EPSILON) {
      left.push(p)
    }
  }

  // Right boundary: parent top-right → parent bottom-right → child top-right (diagonal) → union's right boundary
  const right: ContourPoint[] = [
    { x: parentHalfW, y: -parentHalfH }, // Parent top-right
    { x: parentHalfW, y: parentBottom }, // Parent bottom-right
  ]

  // Diagonal connection to rightmost child's top-right
  if (rightChildTop > parentBottom) {
    right.push({ x: rightChildRight, y: rightChildTop })
  }

  // Add rest of the UNION's right boundary (skip points above the connection)
  // Include all points to retain full detail for layout calculations
  for (const p of childrenUnion.right) {
    if (p.y > rightChildTop + Y_EPSILON) {
      right.push(p)
    }
  }

  return { left, right }
}

// ============================================================================
// Contour Union (for merging sibling subtrees)
// ============================================================================

/**
 * Compute the union of multiple Y-monotone polygon contours.
 *
 * This is used when combining sibling subtrees - the result is the outer
 * envelope that encompasses all input contours, while PRESERVING detail
 * from the dominant contour at each y-segment.
 *
 * For Y-monotone polygons, union is computed by:
 * - Left boundary: track which contour is leftmost at each y-segment,
 *   preserve all detail from the dominant contour
 * - Right boundary: track which contour is rightmost at each y-segment,
 *   preserve all detail from the dominant contour
 *
 * This differs from a simple envelope computation because it preserves
 * inflection points (like edge geometry dips) from the dominant contour,
 * which are needed for accurate debug visualization.
 *
 * @param contours Array of contours (already positioned in parent's coordinate system)
 * @returns Union contour encompassing all inputs
 */
export function unionContours(contours: YMonotonePolygon[]): YMonotonePolygon {
  if (contours.length === 0) {
    return { left: [], right: [] }
  }

  if (contours.length === 1) {
    return cloneContour(contours[0])
  }

  // Compute detail-preserving boundaries
  const leftPoints = computeDetailPreservingBoundary(contours, 'left')
  const rightPoints = computeDetailPreservingBoundary(contours, 'right')

  return { left: leftPoints, right: rightPoints }
}

/**
 * Compute a detail-preserving boundary for the union of multiple contours.
 *
 * Instead of just computing the envelope (min/max x at each y), this function:
 * 1. Identifies which contour is "dominant" (leftmost for left boundary,
 *    rightmost for right boundary) at each y-segment
 * 2. Preserves ALL points from the dominant contour in that segment,
 *    maintaining their original order to preserve the boundary path
 * 3. Adds interpolated transition points when dominance changes
 *
 * @param contours The contours to union
 * @param side Which boundary to compute ('left' or 'right')
 * @returns Array of points forming the detail-preserving boundary
 */
function computeDetailPreservingBoundary(
  contours: YMonotonePolygon[],
  side: 'left' | 'right'
): ContourPoint[] {
  if (contours.length === 0) return []

  const interpolateFn =
    side === 'left' ? interpolateLeftBoundaryX : interpolateRightBoundaryX
  const isMoreDominant =
    side === 'left'
      ? (a: number, b: number) => a < b
      : (a: number, b: number) => a > b

  // Find the overall y-range
  let minY = Infinity
  let maxY = -Infinity
  for (const contour of contours) {
    const boundary = side === 'left' ? contour.left : contour.right
    for (const p of boundary) {
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
  }
  if (!isFinite(minY)) return []

  // Build a list of y-segments where each contour's dominance may change
  // Collect all unique y values where contour boundaries have vertices
  const yBreakpoints = new Set<number>()
  for (const contour of contours) {
    const boundary = side === 'left' ? contour.left : contour.right
    for (const p of boundary) {
      yBreakpoints.add(p.y)
    }
  }
  const sortedYs = Array.from(yBreakpoints).sort((a, b) => a - b)

  // For each y-segment, determine which contour is dominant
  // A segment is [sortedYs[i], sortedYs[i+1]]
  const segmentDominant: number[] = [] // Index of dominant contour for each segment

  for (let i = 0; i < sortedYs.length - 1; i++) {
    const midY = (sortedYs[i] + sortedYs[i + 1]) / 2
    let dominantIdx = -1
    let dominantX = side === 'left' ? Infinity : -Infinity

    for (let j = 0; j < contours.length; j++) {
      const boundary = side === 'left' ? contours[j].left : contours[j].right
      const x = interpolateFn(boundary, midY)
      if (x !== null && isMoreDominant(x, dominantX)) {
        dominantX = x
        dominantIdx = j
      }
    }
    segmentDominant.push(dominantIdx)
  }

  // Now build the result by traversing the dominant contour for each segment
  const result: ContourPoint[] = []
  let currentDominantIdx = -1

  for (let segIdx = 0; segIdx < segmentDominant.length; segIdx++) {
    const segStartY = sortedYs[segIdx]
    const segEndY = sortedYs[segIdx + 1]
    const dominantIdx = segmentDominant[segIdx]

    if (dominantIdx === -1) continue

    const dominantBoundary =
      side === 'left' ? contours[dominantIdx].left : contours[dominantIdx].right

    // Check if dominant contour has explicit points at segStartY
    const explicitPointsAtStart = dominantBoundary.filter((p) => p.y === segStartY)
    const hasExplicitAtStart = explicitPointsAtStart.length > 0

    // Handle transition to a new dominant contour
    if (dominantIdx !== currentDominantIdx) {
      // Add transition point at segment start from OLD dominant (to close its path)
      if (currentDominantIdx !== -1) {
        const oldBoundary =
          side === 'left'
            ? contours[currentDominantIdx].left
            : contours[currentDominantIdx].right
        const oldX = interpolateFn(oldBoundary, segStartY)
        if (oldX !== null) {
          addPointIfNew(result, { x: oldX, y: segStartY })
        }
      }

      // Add transition point at segment start from NEW dominant
      // Only add interpolated point if there are no explicit points at this y
      if (!hasExplicitAtStart) {
        const startX = interpolateFn(dominantBoundary, segStartY)
        if (startX !== null) {
          addPointIfNew(result, { x: startX, y: segStartY })
        }
      }
      currentDominantIdx = dominantIdx
    } else {
      // Same dominant contour - add interpolated point only if no explicit points at this y
      // to ensure continuity when there are no explicit points in this segment
      if (!hasExplicitAtStart) {
        const startX = interpolateFn(dominantBoundary, segStartY)
        if (startX !== null) {
          addPointIfNew(result, { x: startX, y: segStartY })
        }
      }
    }

    // Add all points from the dominant contour in this segment (including segStartY)
    // maintaining the original order to preserve the boundary path
    for (const p of dominantBoundary) {
      if (p.y >= segStartY && p.y < segEndY) {
        addPointIfNew(result, { x: p.x, y: p.y })
      }
    }
  }

  // Handle the last y-breakpoint
  if (sortedYs.length > 0 && currentDominantIdx !== -1) {
    const lastY = sortedYs[sortedYs.length - 1]
    const dominantBoundary =
      side === 'left'
        ? contours[currentDominantIdx].left
        : contours[currentDominantIdx].right

    // Add interpolated point at the last y
    const lastX = interpolateFn(dominantBoundary, lastY)
    if (lastX !== null) {
      addPointIfNew(result, { x: lastX, y: lastY })
    }

    // Also add any explicit points at exactly the last y
    for (const p of dominantBoundary) {
      if (p.y === lastY) {
        addPointIfNew(result, { x: p.x, y: p.y })
      }
    }
  }

  return result
}

/**
 * Add a point to the result array if it's not a duplicate of the last point.
 */
function addPointIfNew(result: ContourPoint[], point: ContourPoint): void {
  const last = result[result.length - 1]
  if (!last || last.x !== point.x || last.y !== point.y) {
    result.push(point)
  }
}

/**
 * Interpolate the x-coordinate of a left boundary at a given y.
 * Returns the MINIMUM x at that y level (leftmost point).
 *
 * @param boundary Array of points forming the left boundary (ordered by increasing y)
 * @param y The y-coordinate to query
 * @returns The x-coordinate at y, or null if y is outside the boundary's y-range
 */
function interpolateLeftBoundaryX(boundary: ContourPoint[], y: number): number | null {
  if (boundary.length === 0) return null

  const firstY = boundary[0].y
  const lastY = boundary[boundary.length - 1].y

  // Outside range
  if (y < firstY || y > lastY) return null

  let minX = Infinity

  // Check all segments that contain y and find the minimum x
  for (let i = 0; i < boundary.length - 1; i++) {
    const p1 = boundary[i]
    const p2 = boundary[i + 1]

    if (y >= p1.y && y <= p2.y) {
      let x: number
      if (p2.y === p1.y) {
        // Horizontal segment - take minimum of both endpoints
        x = Math.min(p1.x, p2.x)
      } else {
        const t = (y - p1.y) / (p2.y - p1.y)
        x = p1.x + t * (p2.x - p1.x)
      }
      minX = Math.min(minX, x)
    }
  }

  // Also check if y is exactly at the last point
  if (y === lastY) {
    minX = Math.min(minX, boundary[boundary.length - 1].x)
  }

  return isFinite(minX) ? minX : null
}

/**
 * Interpolate the x-coordinate of a right boundary at a given y.
 * Returns the MAXIMUM x at that y level (rightmost point).
 *
 * @param boundary Array of points forming the right boundary (ordered by increasing y)
 * @param y The y-coordinate to query
 * @returns The x-coordinate at y, or null if y is outside the boundary's y-range
 */
function interpolateRightBoundaryX(boundary: ContourPoint[], y: number): number | null {
  if (boundary.length === 0) return null

  const firstY = boundary[0].y
  const lastY = boundary[boundary.length - 1].y

  // Outside range
  if (y < firstY || y > lastY) return null

  let maxX = -Infinity

  // Check all segments that contain y and find the maximum x
  for (let i = 0; i < boundary.length - 1; i++) {
    const p1 = boundary[i]
    const p2 = boundary[i + 1]

    if (y >= p1.y && y <= p2.y) {
      let x: number
      if (p2.y === p1.y) {
        // Horizontal segment - take maximum of both endpoints
        x = Math.max(p1.x, p2.x)
      } else {
        const t = (y - p1.y) / (p2.y - p1.y)
        x = p1.x + t * (p2.x - p1.x)
      }
      maxX = Math.max(maxX, x)
    }
  }

  // Also check if y is exactly at the last point
  if (y === lastY) {
    maxX = Math.max(maxX, boundary[boundary.length - 1].x)
  }

  return isFinite(maxX) ? maxX : null
}

// ============================================================================
// Segment Distance Calculation
// ============================================================================

/**
 * Compute the minimum Euclidean distance between two line segments.
 *
 * This properly handles diagonal segments that may approach each other
 * more closely than their horizontal gap at any Y level would suggest.
 */
function minDistanceBetweenSegments(
  ax1: number,
  ay1: number,
  ax2: number,
  ay2: number,
  bx1: number,
  by1: number,
  bx2: number,
  by2: number
): number {
  // Check all four endpoint-to-segment distances
  const d1 = pointToSegmentDistance(ax1, ay1, bx1, by1, bx2, by2)
  const d2 = pointToSegmentDistance(ax2, ay2, bx1, by1, bx2, by2)
  const d3 = pointToSegmentDistance(bx1, by1, ax1, ay1, ax2, ay2)
  const d4 = pointToSegmentDistance(bx2, by2, ax1, ay1, ax2, ay2)

  return Math.min(d1, d2, d3, d4)
}

/**
 * Compute the distance from a point to a line segment.
 */
function pointToSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSq = dx * dx + dy * dy

  if (lengthSq === 0) {
    // Segment is a point
    return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1))
  }

  // Parameter t for the projection of point onto the line
  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq

  // Clamp t to [0, 1] to stay within the segment
  t = Math.max(0, Math.min(1, t))

  // Find the closest point on the segment
  const closestX = x1 + t * dx
  const closestY = y1 + t * dy

  return Math.sqrt((px - closestX) * (px - closestX) + (py - closestY) * (py - closestY))
}

// ============================================================================
// Intersection Detection (for subtree placement)
// ============================================================================

/**
 * Find the minimum horizontal gap between two contours (signed).
 * Used for determining placement direction.
 *
 * @returns Positive if contours are separated, negative if overlapping
 */
function findSignedHorizontalGap(
  leftContour: YMonotonePolygon,
  rightContour: YMonotonePolygon
): number | null {
  // Find y-range overlap
  const leftBounds = getContourBounds(leftContour)
  const rightBounds = getContourBounds(rightContour)

  const overlapTop = Math.max(leftBounds.top, rightBounds.top)
  const overlapBottom = Math.min(leftBounds.bottom, rightBounds.bottom)

  if (overlapTop >= overlapBottom) {
    return null // No y-overlap
  }

  // Collect all y-breakpoints in the overlap range
  const yBreakpoints = new Set<number>()
  yBreakpoints.add(overlapTop)
  yBreakpoints.add(overlapBottom)

  for (const p of leftContour.right) {
    if (p.y >= overlapTop && p.y <= overlapBottom) {
      yBreakpoints.add(p.y)
    }
  }
  for (const p of rightContour.left) {
    if (p.y >= overlapTop && p.y <= overlapBottom) {
      yBreakpoints.add(p.y)
    }
  }

  const sortedYs = Array.from(yBreakpoints).sort((a, b) => a - b)

  let minGap = Infinity

  for (const y of sortedYs) {
    const leftRightX = interpolateRightBoundaryX(leftContour.right, y)
    const rightLeftX = interpolateLeftBoundaryX(rightContour.left, y)

    if (leftRightX !== null && rightLeftX !== null) {
      const gap = rightLeftX - leftRightX
      minGap = Math.min(minGap, gap)
    }
  }

  return isFinite(minGap) ? minGap : null
}

/**
 * Find the minimum Euclidean gap between two contours, accounting for diagonal segments.
 *
 * This computes the actual minimum Euclidean distance between the contour
 * boundaries, not just the horizontal distance at Y breakpoints. This is
 * essential for proper spacing when contours have diagonal edges that
 * approach each other.
 *
 * @param leftContour The left subtree's contour
 * @param rightContour The right subtree's contour (at its current position)
 * @returns The minimum Euclidean distance between the contours in the overlap region,
 *          or null if the contours don't overlap in y
 */
export function findMinGap(
  leftContour: YMonotonePolygon,
  rightContour: YMonotonePolygon
): number | null {
  // Find y-range overlap
  const leftBounds = getContourBounds(leftContour)
  const rightBounds = getContourBounds(rightContour)

  const overlapTop = Math.max(leftBounds.top, rightBounds.top)
  const overlapBottom = Math.min(leftBounds.bottom, rightBounds.bottom)

  if (overlapTop >= overlapBottom) {
    return null // No y-overlap
  }

  let minGap = Infinity

  // Get the relevant segments from each contour in the overlap region
  const leftSegments = getSegmentsInYRange(leftContour.right, overlapTop, overlapBottom)
  const rightSegments = getSegmentsInYRange(rightContour.left, overlapTop, overlapBottom)

  // For each pair of segments that could potentially be closest, compute min distance
  for (const leftSeg of leftSegments) {
    for (const rightSeg of rightSegments) {
      // Check if segments overlap in Y range
      const segOverlapTop = Math.max(leftSeg.y1, rightSeg.y1)
      const segOverlapBottom = Math.min(leftSeg.y2, rightSeg.y2)

      if (segOverlapTop <= segOverlapBottom) {
        // Segments overlap in Y - compute minimum Euclidean distance
        const dist = minDistanceBetweenSegments(
          leftSeg.x1, leftSeg.y1, leftSeg.x2, leftSeg.y2,
          rightSeg.x1, rightSeg.y1, rightSeg.x2, rightSeg.y2
        )
        minGap = Math.min(minGap, dist)
      }
    }
  }

  return isFinite(minGap) ? minGap : null
}

/**
 * Extract line segments from a boundary that fall within a Y range.
 */
function getSegmentsInYRange(
  boundary: ContourPoint[],
  yTop: number,
  yBottom: number
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = []

  for (let i = 0; i < boundary.length - 1; i++) {
    const p1 = boundary[i]
    const p2 = boundary[i + 1]

    // Check if segment overlaps with the Y range
    if (p2.y >= yTop && p1.y <= yBottom) {
      // Clip segment to the Y range if necessary
      const y1 = Math.max(p1.y, yTop)
      const y2 = Math.min(p2.y, yBottom)

      // Interpolate X values at clipped Y positions
      let x1: number, x2: number
      if (p2.y === p1.y) {
        // Horizontal segment
        x1 = p1.x
        x2 = p2.x
      } else {
        const t1 = (y1 - p1.y) / (p2.y - p1.y)
        const t2 = (y2 - p1.y) / (p2.y - p1.y)
        x1 = p1.x + t1 * (p2.x - p1.x)
        x2 = p1.x + t2 * (p2.x - p1.x)
      }

      segments.push({ x1, y1, x2, y2 })
    }
  }

  return segments
}

// Keep the old function name as an alias for backwards compatibility
export const findMinHorizontalGap = findMinGap

/**
 * Calculate the horizontal offset needed to place rightContour adjacent to leftContour
 * with a specified minimum gap (Euclidean distance).
 *
 * Uses the signed horizontal gap to determine the base offset direction, then
 * iteratively adjusts to ensure the Euclidean gap meets the requirement.
 *
 * @param leftContour The left subtree's contour (positioned)
 * @param rightContour The right subtree's contour (at origin)
 * @param desiredGap The minimum Euclidean gap to maintain between contours
 * @returns The x-offset to apply to rightContour
 */
export function calculatePlacementOffset(
  leftContour: YMonotonePolygon,
  rightContour: YMonotonePolygon,
  desiredGap: number
): number {
  const leftBounds = getContourBounds(leftContour)
  const rightBounds = getContourBounds(rightContour)

  // Check if there's Y-overlap at all
  const overlapTop = Math.max(leftBounds.top, rightBounds.top)
  const overlapBottom = Math.min(leftBounds.bottom, rightBounds.bottom)

  if (overlapTop >= overlapBottom) {
    // No Y-overlap - just place based on bounding boxes
    return leftBounds.right - rightBounds.left + desiredGap
  }

  // Initial estimate based on Y-overlapping region only.
  // Gap calculation is purely geometric - we only consider where contours
  // actually overlap in Y, not parts at different Y levels.
  const signedHGap = findSignedHorizontalGap(leftContour, rightContour)
  const baseOffset = signedHGap !== null ? desiredGap - signedHGap : 0

  // Verify the gap is achieved at base offset
  const translatedRight = translateContour(rightContour, baseOffset, 0)
  const actualGap = findMinGap(leftContour, translatedRight)

  if (actualGap !== null && actualGap >= desiredGap - 0.5) {
    return baseOffset
  }

  // Binary search for the right offset if base offset isn't sufficient
  let lowOffset = baseOffset
  let highOffset = baseOffset + desiredGap * 3 // Wider range for complex cases

  const tolerance = 0.5
  const maxIterations = 20

  for (let i = 0; i < maxIterations; i++) {
    const midOffset = (lowOffset + highOffset) / 2
    const testRight = translateContour(rightContour, midOffset, 0)
    const testGap = findMinGap(leftContour, testRight)

    if (testGap === null) {
      // Shouldn't happen if we started with Y-overlap, but handle gracefully
      highOffset = midOffset
      continue
    }

    const diff = testGap - desiredGap

    if (Math.abs(diff) < tolerance) {
      return midOffset
    }

    if (diff < 0) {
      lowOffset = midOffset
    } else {
      highOffset = midOffset
    }
  }

  return highOffset
}

/**
 * Merge two contours with a specified gap between them.
 *
 * This function:
 * 1. Calculates the offset needed to place rightContour adjacent to leftContour
 *    with the specified gap
 * 2. Translates rightContour by that offset
 * 3. Returns the union of both contours
 *
 * The result is a single contour that encompasses both input contours,
 * preserving all detail from both boundaries.
 *
 * @param leftContour The left subtree's contour (positioned)
 * @param rightContour The right subtree's contour (at its current position)
 * @param gap The minimum gap to maintain between contours
 * @returns Object containing the merged contour and the offset applied to rightContour
 */
export function mergeContoursWithGap(
  leftContour: YMonotonePolygon,
  rightContour: YMonotonePolygon,
  gap: number
): { merged: YMonotonePolygon; rightOffset: number } {
  const offset = calculatePlacementOffset(leftContour, rightContour, gap)
  const translatedRight = translateContour(rightContour, offset, 0)
  const merged = unionContours([leftContour, translatedRight])

  return { merged, rightOffset: offset }
}
