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
  const { horizontalGap, verticalGap, reduceLeafSiblingGaps } = context.layout
  const nodeSize = calculateNodeSize(node, context)

  function isLeaf(child: LaidOutChild): boolean {
    return !child.node.children || child.node.children.length === 0
  }

  function isLeafSiblingPair(leftIndex: number, rightIndex: number): boolean {
    if (!reduceLeafSiblingGaps) return false
    return isLeaf(children[leftIndex]) && isLeaf(children[rightIndex])
  }

  function gapForIndex(leftIndex: number, rightIndex: number): number {
    return isLeafSiblingPair(leftIndex, rightIndex) ? horizontalGap / 2 : horizontalGap
  }

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
  const positionsLR = calculateLRPositions(children, childOffsetYs, gapForIndex)

  // Phase 2: Calculate RL positions (right-to-left placement)
  const positionsRL = calculateRLPositions(children, childOffsetYs, gapForIndex)

  // Phase 3: Average positions for symmetry
  const positionsAvg = children.map(
    (_, i) => (positionsLR[i] + positionsRL[i]) / 2
  )

  // Phase 4: Apportion gaps evenly
  const positionsFinal = apportionGaps(
    positionsAvg,
    children,
    childOffsetYs,
    gapForIndex,
    isLeafSiblingPair
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
  gapForIndex: (leftIndex: number, rightIndex: number) => number
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
      const gap = gapForIndex(i - 1, i)
      childOffsetX = calculatePlacementOffset(
        forestContour,
        childContourAtY,
        gap
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
  gapForIndex: (leftIndex: number, rightIndex: number) => number
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
      const gap = gapForIndex(i, i + 1)
      const offset = calculatePlacementOffset(
        childContourAtY,
        forestContour,
        gap
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
 * Redistribute gaps across siblings (apportionment).
 *
 * Calculates current gaps between adjacent siblings, computes
 * average gaps for leaf and non-leaf pairs, and redistributes
 * positions so gaps move toward their group average while
 * respecting per-pair minimum gaps.
 */
function apportionGaps(
  positions: number[],
  children: LaidOutChild[],
  childOffsetYs: number[],
  gapForIndex: (leftIndex: number, rightIndex: number) => number,
  isLeafSiblingPair: (leftIndex: number, rightIndex: number) => boolean
): number[] {
  if (children.length <= 1) {
    return [...positions]
  }

  // Calculate actual gaps between adjacent children using contours
  const gaps: number[] = []
  const leafGaps: number[] = []
  const nonLeafGaps: number[] = []
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
    const resolvedGap = gap ?? gapForIndex(i, i + 1)
    gaps.push(resolvedGap)
    if (isLeafSiblingPair(i, i + 1)) {
      leafGaps.push(resolvedGap)
    } else {
      nonLeafGaps.push(resolvedGap)
    }
  }

  const totalGap = gaps.reduce((sum, g) => sum + g, 0)
  const avgGap = totalGap / gaps.length
  const leafAvg = leafGaps.length > 0
    ? leafGaps.reduce((sum, g) => sum + g, 0) / leafGaps.length
    : avgGap
  const nonLeafAvg = nonLeafGaps.length > 0
    ? nonLeafGaps.reduce((sum, g) => sum + g, 0) / nonLeafGaps.length
    : avgGap

  // Redistribute: first child stays, others adjusted to achieve even gaps
  const result: number[] = [positions[0]]
  let cumulativeShift = 0

  for (let i = 1; i < children.length; i++) {
    const minGap = gapForIndex(i - 1, i)
    const targetGap = isLeafSiblingPair(i - 1, i)
      ? Math.max(leafAvg, minGap)
      : Math.max(nonLeafAvg, minGap)
    const gapAdjustment = targetGap - gaps[i - 1]
    cumulativeShift += gapAdjustment
    result.push(positions[i] + cumulativeShift)
  }

  return result
}
