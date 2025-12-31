import type { TreeNode, LayoutNode } from '@/types'
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
  type ChildContourInfo,
} from '../contour'

/**
 * Bounding Box layout algorithm.
 *
 * A simple, non-compact layout that spaces subtrees by their bounding boxes.
 * Children are placed with their bounding boxes exactly horizontalGap apart,
 * without any interlocking of subtree shapes.
 *
 * - Children tops are aligned at the same Y level (top-aligned)
 * - Children are centered as a group under the parent
 * - Spacing uses bounding boxes, not contours (no compaction)
 *
 * This produces clean, predictable layouts. For simple trees, the result
 * may be identical to Tidy layout. For complex trees with varying subtree
 * depths, Bounding Box will use more horizontal space than compact layouts.
 */
export const boundingBoxLayout: LayoutAlgorithm = (
  node: TreeNode,
  children: LaidOutChild[],
  context
): LayoutResult => {
  const { horizontalGap, verticalGap, reduceLeafSiblingGaps } = context.layout
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

  function isLeaf(child: LaidOutChild): boolean {
    return !child.node.children || child.node.children.length === 0
  }

  function getSiblingGap(left: LaidOutChild, right: LaidOutChild): number {
    if (reduceLeafSiblingGaps && isLeaf(left) && isLeaf(right)) {
      return horizontalGap / 2
    }
    return horizontalGap
  }

  // Calculate child subtree widths for horizontal positioning
  const childWidths = children.map((c) => c.layout.bounds.right - c.layout.bounds.left)
  const childGaps = children.length > 1
    ? children.slice(0, -1).map((child, index) => getSiblingGap(child, children[index + 1]))
    : []
  const totalChildrenWidth = childWidths.reduce((sum, width) => sum + width, 0) +
    childGaps.reduce((sum, gap) => sum + gap, 0)

  // For top alignment: all children have their root tops at the same y
  // Parent bottom is at nodeSize.height / 2
  // Children tops should be at parentBottom + verticalGap
  const parentBottom = nodeSize.height / 2
  const childrenTopY = parentBottom + verticalGap

  // Position children starting from left, centered under parent
  let currentX = -totalChildrenWidth / 2
  const positionedChildren: LayoutNode[] = []
  const childBoundsList: SubtreeBounds[] = []
  const childContourInfos: ChildContourInfo[] = []

  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    const childLayout = child.layout
    const childBounds = childLayout.bounds
    const childWidth = childWidths[i]

    // Place so child's left bound aligns with currentX
    const childOffsetX = currentX - childBounds.left

    // Top alignment: position child root top at childrenTopY
    // Child root is at y=0, so its top is at -height/2
    // We want: childRootTop + childOffsetY = childrenTopY
    // So: -height/2 + childOffsetY = childrenTopY
    // childOffsetY = childrenTopY + height/2
    const childOffsetY = childrenTopY + childLayout.root.height / 2

    // Clone and translate the child's layout
    const translatedChild = structuredClone(childLayout.root)
    translateNode(translatedChild, childOffsetX, childOffsetY)
    positionedChildren.push(translatedChild)

    // Track the translated bounds
    childBoundsList.push(translateBounds(childBounds, childOffsetX, childOffsetY))

    // Collect child contour info for polygon contour building
    childContourInfos.push({
      contour: childLayout.polygonContour,
      offsetX: childOffsetX,
      offsetY: childOffsetY,
      width: childLayout.root.width,
      height: childLayout.root.height,
    })

    currentX += childWidth + (childGaps[i] ?? 0)
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
