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
  edgeStyle: EdgeContourStyle
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

  // Translate the boundary children's contours (for preserving inflection points)
  const leftChildContour = translateContour(leftChild.contour, leftChild.offsetX, leftChild.offsetY)
  const rightChildContour = translateContour(rightChild.contour, rightChild.offsetX, rightChild.offsetY)

  // Build the contour based on edge style
  switch (edgeStyle) {
    case 'curve':
      return buildCurveEdgeContour(
        parentHalfW,
        parentHalfH,
        parentBottom,
        leftChild,
        rightChild,
        leftChildContour,
        rightChildContour
      )

    case 'straight-arrow':
      return buildArrowEdgeContour(
        parentHalfW,
        parentHalfH,
        parentBottom,
        leftChild,
        rightChild,
        leftChildContour,
        rightChildContour
      )

    case 'org-chart':
      return buildOrgChartEdgeContour(
        parentHalfW,
        parentHalfH,
        parentBottom,
        leftChild,
        rightChild,
        leftChildContour,
        rightChildContour,
        sortedChildren
      )
  }
}

/**
 * Build contour for curve edges (corner-to-corner diagonals).
 *
 * The edge visually goes from parent's bottom corners to children's top corners,
 * so the contour follows the same path.
 */
function buildCurveEdgeContour(
  parentHalfW: number,
  parentHalfH: number,
  parentBottom: number,
  leftChild: ChildContourInfo,
  rightChild: ChildContourInfo,
  leftChildContour: YMonotonePolygon,
  rightChildContour: YMonotonePolygon
): YMonotonePolygon {
  const leftChildTop = leftChild.offsetY - leftChild.height / 2
  const leftChildLeft = leftChild.offsetX - leftChild.width / 2
  const rightChildTop = rightChild.offsetY - rightChild.height / 2
  const rightChildRight = rightChild.offsetX + rightChild.width / 2

  // Left boundary: parent top-left → parent bottom-left → child top-left (diagonal) → child's contour
  const left: ContourPoint[] = [
    { x: -parentHalfW, y: -parentHalfH }, // Parent top-left
    { x: -parentHalfW, y: parentBottom }, // Parent bottom-left
  ]

  // Diagonal connection to leftmost child's top-left
  // Only add if child is below parent (which it always should be)
  if (leftChildTop > parentBottom) {
    left.push({ x: leftChildLeft, y: leftChildTop })
  }

  // Add rest of leftmost child's left boundary (skip points above the connection)
  for (const p of leftChildContour.left) {
    if (p.y > leftChildTop + 0.5) {
      left.push(p)
    }
  }

  // Right boundary: parent top-right → parent bottom-right → child top-right (diagonal) → child's contour
  const right: ContourPoint[] = [
    { x: parentHalfW, y: -parentHalfH }, // Parent top-right
    { x: parentHalfW, y: parentBottom }, // Parent bottom-right
  ]

  // Diagonal connection to rightmost child's top-right
  if (rightChildTop > parentBottom) {
    right.push({ x: rightChildRight, y: rightChildTop })
  }

  // Add rest of rightmost child's right boundary (skip points above the connection)
  for (const p of rightChildContour.right) {
    if (p.y > rightChildTop + 0.5) {
      right.push(p)
    }
  }

  return { left, right }
}

/**
 * Build contour for arrow/straight edges (center-to-center diagonals).
 *
 * The edge goes from parent's bottom-center to each child's top-center,
 * creating triangular regions on the sides.
 */
function buildArrowEdgeContour(
  parentHalfW: number,
  parentHalfH: number,
  parentBottom: number,
  leftChild: ChildContourInfo,
  rightChild: ChildContourInfo,
  leftChildContour: YMonotonePolygon,
  rightChildContour: YMonotonePolygon
): YMonotonePolygon {
  const leftChildTop = leftChild.offsetY - leftChild.height / 2
  const leftChildLeft = leftChild.offsetX - leftChild.width / 2
  const leftChildCenterX = leftChild.offsetX

  const rightChildTop = rightChild.offsetY - rightChild.height / 2
  const rightChildRight = rightChild.offsetX + rightChild.width / 2
  const rightChildCenterX = rightChild.offsetX

  // Left boundary:
  // parent top-left → parent bottom-left → parent bottom-center →
  // leftmost child top-center (diagonal) → child top-left → child's contour
  const left: ContourPoint[] = [
    { x: -parentHalfW, y: -parentHalfH }, // Parent top-left
    { x: -parentHalfW, y: parentBottom }, // Parent bottom-left
    { x: 0, y: parentBottom }, // Parent bottom-center
  ]

  // Diagonal to leftmost child's top-center
  if (leftChildTop > parentBottom) {
    left.push({ x: leftChildCenterX, y: leftChildTop })
    // Horizontal to child's top-left corner
    left.push({ x: leftChildLeft, y: leftChildTop })
  }

  // Add rest of leftmost child's left boundary (skip points above the connection)
  for (const p of leftChildContour.left) {
    if (p.y > leftChildTop + 0.5) {
      left.push(p)
    }
  }

  // Right boundary:
  // parent top-right → parent bottom-right → parent bottom-center →
  // rightmost child top-center (diagonal) → child top-right → child's contour
  const right: ContourPoint[] = [
    { x: parentHalfW, y: -parentHalfH }, // Parent top-right
    { x: parentHalfW, y: parentBottom }, // Parent bottom-right
    { x: 0, y: parentBottom }, // Parent bottom-center
  ]

  // Diagonal to rightmost child's top-center
  if (rightChildTop > parentBottom) {
    right.push({ x: rightChildCenterX, y: rightChildTop })
    // Horizontal to child's top-right corner
    right.push({ x: rightChildRight, y: rightChildTop })
  }

  // Add rest of rightmost child's right boundary (skip points above the connection)
  for (const p of rightChildContour.right) {
    if (p.y > rightChildTop + 0.5) {
      right.push(p)
    }
  }

  return { left, right }
}

/**
 * Build contour for org-chart edges (rectangular segments).
 *
 * The edge structure is:
 * - Vertical drop from parent bottom-center to horizontal bar
 * - Horizontal bar spanning all children
 * - Vertical drops from bar to each child's top-center
 */
function buildOrgChartEdgeContour(
  parentHalfW: number,
  parentHalfH: number,
  parentBottom: number,
  leftChild: ChildContourInfo,
  rightChild: ChildContourInfo,
  leftChildContour: YMonotonePolygon,
  rightChildContour: YMonotonePolygon,
  sortedChildren: ChildContourInfo[]
): YMonotonePolygon {
  // Find the topmost child to determine bar position
  const topmostChildTop = Math.min(
    ...sortedChildren.map((c) => c.offsetY - c.height / 2)
  )

  // Bar Y is midpoint between parent bottom and topmost child
  const barY = (parentBottom + topmostChildTop) / 2

  const leftChildTop = leftChild.offsetY - leftChild.height / 2
  const leftChildLeft = leftChild.offsetX - leftChild.width / 2
  const leftChildCenterX = leftChild.offsetX

  const rightChildTop = rightChild.offsetY - rightChild.height / 2
  const rightChildRight = rightChild.offsetX + rightChild.width / 2
  const rightChildCenterX = rightChild.offsetX

  // Left boundary:
  // parent top-left → parent bottom-left → parent bottom-center →
  // down to bar → horizontal to leftmost child center →
  // down to child top → horizontal to child top-left → child's contour
  const left: ContourPoint[] = [
    { x: -parentHalfW, y: -parentHalfH }, // Parent top-left
    { x: -parentHalfW, y: parentBottom }, // Parent bottom-left
    { x: 0, y: parentBottom }, // Parent bottom-center
    { x: 0, y: barY }, // Vertical drop to bar
    { x: leftChildCenterX, y: barY }, // Horizontal along bar to leftmost child
    { x: leftChildCenterX, y: leftChildTop }, // Vertical drop to child top
    { x: leftChildLeft, y: leftChildTop }, // Horizontal to child top-left
  ]

  // Add rest of leftmost child's left boundary (skip points above the connection)
  for (const p of leftChildContour.left) {
    if (p.y > leftChildTop + 0.5) {
      left.push(p)
    }
  }

  // Right boundary:
  // parent top-right → parent bottom-right → parent bottom-center →
  // down to bar → horizontal to rightmost child center →
  // down to child top → horizontal to child top-right → child's contour
  const right: ContourPoint[] = [
    { x: parentHalfW, y: -parentHalfH }, // Parent top-right
    { x: parentHalfW, y: parentBottom }, // Parent bottom-right
    { x: 0, y: parentBottom }, // Parent bottom-center
    { x: 0, y: barY }, // Vertical drop to bar
    { x: rightChildCenterX, y: barY }, // Horizontal along bar to rightmost child
    { x: rightChildCenterX, y: rightChildTop }, // Vertical drop to child top
    { x: rightChildRight, y: rightChildTop }, // Horizontal to child top-right
  ]

  // Add rest of rightmost child's right boundary (skip points above the connection)
  for (const p of rightChildContour.right) {
    if (p.y > rightChildTop + 0.5) {
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
 * envelope that encompasses all input contours.
 *
 * For Y-monotone polygons, union is computed by:
 * - Left boundary: take minimum x at each y level
 * - Right boundary: take maximum x at each y level
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

  // Collect all y-coordinates where any contour has a vertex
  const yBreakpoints = new Set<number>()
  for (const contour of contours) {
    for (const p of contour.left) yBreakpoints.add(p.y)
    for (const p of contour.right) yBreakpoints.add(p.y)
  }

  const sortedYs = Array.from(yBreakpoints).sort((a, b) => a - b)

  // At each y, compute the envelope (min left, max right)
  const leftPoints: ContourPoint[] = []
  const rightPoints: ContourPoint[] = []

  for (const y of sortedYs) {
    let minX = Infinity
    let maxX = -Infinity

    for (const contour of contours) {
      const leftX = interpolateLeftBoundaryX(contour.left, y)
      const rightX = interpolateRightBoundaryX(contour.right, y)

      if (leftX !== null) minX = Math.min(minX, leftX)
      if (rightX !== null) maxX = Math.max(maxX, rightX)
    }

    if (isFinite(minX)) {
      // Avoid duplicate points
      const lastLeft = leftPoints[leftPoints.length - 1]
      if (!lastLeft || lastLeft.x !== minX || lastLeft.y !== y) {
        leftPoints.push({ x: minX, y })
      }
    }

    if (isFinite(maxX)) {
      const lastRight = rightPoints[rightPoints.length - 1]
      if (!lastRight || lastRight.x !== maxX || lastRight.y !== y) {
        rightPoints.push({ x: maxX, y })
      }
    }
  }

  return { left: leftPoints, right: rightPoints }
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

/**
 * Interpolate the x-coordinate of a contour boundary at a given y.
 * For generic use (e.g., gap detection) - returns the first matching x.
 *
 * @param boundary Array of points forming the boundary (ordered by increasing y)
 * @param y The y-coordinate to query
 * @returns The x-coordinate at y, or null if y is outside the boundary's y-range
 */
function interpolateContourX(boundary: ContourPoint[], y: number): number | null {
  if (boundary.length === 0) return null

  const firstY = boundary[0].y
  const lastY = boundary[boundary.length - 1].y

  // Outside range
  if (y < firstY || y > lastY) return null

  // Find the segment containing y
  for (let i = 0; i < boundary.length - 1; i++) {
    const p1 = boundary[i]
    const p2 = boundary[i + 1]

    if (y >= p1.y && y <= p2.y) {
      // Linear interpolation
      if (p2.y === p1.y) {
        // Horizontal segment - return either endpoint
        return p1.x
      }
      const t = (y - p1.y) / (p2.y - p1.y)
      return p1.x + t * (p2.x - p1.x)
    }
  }

  // Exactly at the last point
  return boundary[boundary.length - 1].x
}

// ============================================================================
// Intersection Detection (for subtree placement)
// ============================================================================

/**
 * Find the minimum horizontal gap between two contours at their overlapping y-range.
 *
 * This is used to determine how close two subtrees can be placed:
 * - leftContour: right boundary of the left subtree
 * - rightContour: left boundary of the right subtree
 *
 * @param leftContour The left subtree's contour
 * @param rightContour The right subtree's contour (at its current position)
 * @returns The minimum horizontal distance (right.left.x - left.right.x) in the overlap region,
 *          or null if the contours don't overlap in y
 */
export function findMinHorizontalGap(
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

  // Find minimum gap
  let minGap = Infinity

  for (const y of sortedYs) {
    const leftRightX = interpolateContourX(leftContour.right, y)
    const rightLeftX = interpolateContourX(rightContour.left, y)

    if (leftRightX !== null && rightLeftX !== null) {
      const gap = rightLeftX - leftRightX
      minGap = Math.min(minGap, gap)
    }
  }

  return isFinite(minGap) ? minGap : null
}

/**
 * Calculate the horizontal offset needed to place rightContour adjacent to leftContour
 * with a specified gap.
 *
 * @param leftContour The left subtree's contour (positioned)
 * @param rightContour The right subtree's contour (at origin)
 * @param desiredGap The minimum gap to maintain between contours
 * @returns The x-offset to apply to rightContour
 */
export function calculatePlacementOffset(
  leftContour: YMonotonePolygon,
  rightContour: YMonotonePolygon,
  desiredGap: number
): number {
  const currentGap = findMinHorizontalGap(leftContour, rightContour)

  if (currentGap === null) {
    // No overlap - just place based on bounding boxes
    const leftBounds = getContourBounds(leftContour)
    const rightBounds = getContourBounds(rightContour)
    return leftBounds.right - rightBounds.left + desiredGap
  }

  // Shift right contour so that minGap becomes desiredGap
  return desiredGap - currentGap
}
