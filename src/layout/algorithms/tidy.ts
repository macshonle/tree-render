import type { TreeNode, LayoutNode, YMonotonePolygon } from '@/types'
import type { LayoutAlgorithm, LayoutResult, LaidOutChild, SubtreeBounds } from '../types'
import {
  calculateNodeSize,
  translateNode,
  translateBounds,
  mergeBounds,
  nodeBounds,
} from '../utils'
import {
  createNodeContour,
  buildSubtreeContour,
  translateContour,
  unionContours,
  calculatePlacementOffset,
  findMinHorizontalGap,
  type ChildContourInfo,
} from '../contour'

/**
 * Tidy layout algorithm.
 *
 * Implements Buchheim-style tree layout with:
 * - Reflective symmetry: mirror images produce mirrored layouts
 * - Even gap distribution (apportionment): gaps between siblings are equalized
 * - Top-aligned children: sibling root tops at same y-level
 * - Contour-based compaction: subtrees can interlock
 *
 * Algorithm phases:
 * 1. LR placement: place children left-to-right
 * 2. RL placement: place children right-to-left
 * 3. Average positions for symmetry
 * 4. Apportion gaps evenly across siblings
 * 5. Center children under parent
 */
export const tidyLayout: LayoutAlgorithm = (
  node: TreeNode,
  children: LaidOutChild[],
  context
): LayoutResult => {
  const { horizontalGap, verticalGap } = context.layout
  const nodeSize = calculateNodeSize(node, context)

  // Position current node at origin (will be translated by parent)
  const layoutNode: LayoutNode = {
    id: node.id,
    label: node.label,
    x: 0,
    y: 0,
    width: nodeSize.width,
    height: nodeSize.height,
    children: [],
  }

  // Create polygon contour for this node
  const nodePolygonContour = createNodeContour(nodeSize.width, nodeSize.height)

  // If no children, bounds and contour are just this node
  if (children.length === 0) {
    layoutNode.polygonContour = nodePolygonContour
    return {
      root: layoutNode,
      bounds: nodeBounds(nodeSize.width, nodeSize.height),
      polygonContour: nodePolygonContour,
    }
  }

  // For top alignment: all children have their root tops at the same y
  // Parent bottom is at nodeSize.height / 2
  // Children tops should be at parentBottom + verticalGap
  const parentBottom = nodeSize.height / 2
  const childrenTopY = parentBottom + verticalGap

  // Calculate y offset for each child (top-aligned)
  const childOffsetYs = children.map(
    (child) => childrenTopY + child.layout.root.height / 2
  )

  // Phase 1: Calculate LR positions (left-to-right placement)
  const positionsLR = calculateLRPositions(children, childOffsetYs, horizontalGap)

  // Phase 2: Calculate RL positions (right-to-left placement)
  const positionsRL = calculateRLPositions(children, childOffsetYs, horizontalGap)

  // Phase 3: Average positions for symmetry
  const positionsAvg = children.map(
    (_, i) => (positionsLR[i] + positionsRL[i]) / 2
  )

  // Phase 4: Apportion gaps evenly
  const positionsFinal = apportionGaps(
    positionsAvg,
    children,
    childOffsetYs,
    horizontalGap
  )

  // Phase 5: Center under parent
  const firstChild = children[0]
  const lastChild = children[children.length - 1]
  const childrenLeft = positionsFinal[0] - firstChild.layout.root.width / 2
  const childrenRight =
    positionsFinal[children.length - 1] + lastChild.layout.root.width / 2
  const childrenCenterX = (childrenLeft + childrenRight) / 2
  const centeringOffset = -childrenCenterX

  // Apply final positions
  const positionedChildren: LayoutNode[] = []
  const childBoundsList: SubtreeBounds[] = []
  const childContourInfos: ChildContourInfo[] = []

  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    const childLayout = child.layout
    const childOffsetX = positionsFinal[i] + centeringOffset
    const childOffsetY = childOffsetYs[i]

    // Clone and translate the child's layout
    const translatedChild = structuredClone(childLayout.root)
    translateNode(translatedChild, childOffsetX, childOffsetY)
    positionedChildren.push(translatedChild)

    // Track the translated bounds
    const translatedBounds = translateBounds(
      childLayout.bounds,
      childOffsetX,
      childOffsetY
    )
    childBoundsList.push(translatedBounds)

    // Collect child contour info for polygon contour building
    childContourInfos.push({
      contour: childLayout.polygonContour,
      offsetX: childOffsetX,
      offsetY: childOffsetY,
      width: childLayout.root.width,
      height: childLayout.root.height,
    })
  }

  // Build edge-aware polygon contour for this subtree
  const subtreePolygonContour = buildSubtreeContour(
    nodeSize.width,
    nodeSize.height,
    childContourInfos,
    context.edgeStyle
  )

  layoutNode.children = positionedChildren
  layoutNode.polygonContour = subtreePolygonContour

  // Compute overall bounds: union of this node's bounds and all children's bounds
  const overallBounds = mergeBounds([
    nodeBounds(nodeSize.width, nodeSize.height),
    ...childBoundsList,
  ])

  return { root: layoutNode, bounds: overallBounds, polygonContour: subtreePolygonContour }
}

/**
 * Calculate x-offsets using LR (left-to-right) contour placement.
 * First child at x=0, subsequent children placed adjacent to forest.
 */
function calculateLRPositions(
  children: LaidOutChild[],
  childOffsetYs: number[],
  horizontalGap: number
): number[] {
  const positions: number[] = []
  let forestContour: YMonotonePolygon | null = null

  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    const childLayout = child.layout
    const childOffsetY = childOffsetYs[i]

    let childOffsetX: number

    if (forestContour === null) {
      // First child - place at x=0
      childOffsetX = 0
    } else {
      // Subsequent children - use contour-based placement
      const childContourAtY = translateContour(
        childLayout.polygonContour,
        0,
        childOffsetY
      )
      childOffsetX = calculatePlacementOffset(
        forestContour,
        childContourAtY,
        horizontalGap
      )
    }

    positions.push(childOffsetX)

    // Update forest contour
    const childContourAtPosition = translateContour(
      childLayout.polygonContour,
      childOffsetX,
      childOffsetY
    )
    if (forestContour === null) {
      forestContour = childContourAtPosition
    } else {
      forestContour = unionContours([forestContour, childContourAtPosition])
    }
  }

  return positions
}

/**
 * Calculate x-offsets using RL (right-to-left) contour placement.
 * Last child at x=0, preceding children placed adjacent to forest.
 */
function calculateRLPositions(
  children: LaidOutChild[],
  childOffsetYs: number[],
  horizontalGap: number
): number[] {
  const positions: number[] = new Array(children.length)
  let forestContour: YMonotonePolygon | null = null

  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i]
    const childLayout = child.layout
    const childOffsetY = childOffsetYs[i]

    let childOffsetX: number

    if (forestContour === null) {
      // First child (rightmost) - place at x=0
      childOffsetX = 0
    } else {
      // Subsequent children - place to the LEFT of forest
      const childContourAtY = translateContour(
        childLayout.polygonContour,
        0,
        childOffsetY
      )
      // Calculate offset to place child to the left of forest with gap
      const offset = calculatePlacementOffset(
        childContourAtY,
        forestContour,
        horizontalGap
      )
      childOffsetX = -offset
    }

    positions[i] = childOffsetX

    // Update forest contour
    const childContourAtPosition = translateContour(
      childLayout.polygonContour,
      childOffsetX,
      childOffsetY
    )
    if (forestContour === null) {
      forestContour = childContourAtPosition
    } else {
      forestContour = unionContours([childContourAtPosition, forestContour])
    }
  }

  return positions
}

/**
 * Redistribute gaps evenly across siblings (apportionment).
 *
 * Calculates the current gaps between all adjacent siblings,
 * computes the average gap, and redistributes positions so all
 * gaps are equal to the average (but not less than horizontalGap).
 */
function apportionGaps(
  positions: number[],
  children: LaidOutChild[],
  childOffsetYs: number[],
  horizontalGap: number
): number[] {
  if (children.length <= 1) {
    return [...positions]
  }

  // Calculate actual gaps between adjacent children using contours
  const gaps: number[] = []
  for (let i = 0; i < children.length - 1; i++) {
    const leftContour = translateContour(
      children[i].layout.polygonContour,
      positions[i],
      childOffsetYs[i]
    )
    const rightContour = translateContour(
      children[i + 1].layout.polygonContour,
      positions[i + 1],
      childOffsetYs[i + 1]
    )
    const gap = findMinHorizontalGap(leftContour, rightContour)
    gaps.push(gap ?? horizontalGap)
  }

  // Calculate average gap (but ensure it's at least horizontalGap)
  const totalGap = gaps.reduce((sum, g) => sum + g, 0)
  const avgGap = Math.max(totalGap / gaps.length, horizontalGap)

  // Redistribute: first child stays, others adjusted to achieve even gaps
  const result: number[] = [positions[0]]
  let cumulativeShift = 0

  for (let i = 1; i < children.length; i++) {
    // How much we need to shift this child to make the previous gap equal to avgGap
    const gapAdjustment = avgGap - gaps[i - 1]
    cumulativeShift += gapAdjustment
    result.push(positions[i] + cumulativeShift)
  }

  return result
}
