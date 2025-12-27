import type { TreeNode, LayoutNode } from '@/types'
import type { LayoutAlgorithm, LayoutResult, LaidOutChild, SubtreeBounds } from '../types'
import {
  calculateNodeSize,
  translateNode,
  translateBounds,
  mergeBounds,
  nodeBounds,
  calculateChildrenTotalWidth,
  contourFromNodeBox,
  mergeContours,
  cloneContour,
} from '../utils'

/**
 * Centered layout algorithm.
 *
 * Centers the current node above its children. Children are compacted
 * horizontally so their bounding boxes are exactly horizontalGap apart.
 *
 * Vertical alignment: All sibling ROOT NODES have their CENTERS aligned
 * at the same y-coordinate. This means a taller sibling will extend
 * further down, but all nodes at the same level start at the same vertical
 * center line.
 */
export const maxwidthLayout: LayoutAlgorithm = (
  node: TreeNode,
  children: LaidOutChild[],
  context
): LayoutResult => {
  const { horizontalGap, verticalGap, contourRowStep } = context.layout
  const nodeSize = calculateNodeSize(node, context)

  // Create contour for this node
  const nodeContour = contourFromNodeBox(nodeSize.width, nodeSize.height, contourRowStep)

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

  // If no children, bounds and contour are just this node
  if (children.length === 0) {
    layoutNode.contour = nodeContour
    return {
      root: layoutNode,
      bounds: nodeBounds(nodeSize.width, nodeSize.height),
      contour: nodeContour,
    }
  }

  // Calculate child subtree widths for horizontal positioning
  const childWidths = children.map((c) => c.layout.bounds.right - c.layout.bounds.left)
  const totalChildrenWidth = calculateChildrenTotalWidth(childWidths, horizontalGap)

  // For center alignment: find the tallest child root node
  // All children will have their root centers at the same y
  const maxChildRootHeight = Math.max(...children.map((c) => c.layout.root.height))

  // Position children's centers at this y (relative to parent at origin)
  // Parent bottom is at nodeSize.height / 2
  // We want the tallest child's top to be verticalGap below parent bottom
  // tallestChildTop = childCenterY - maxChildRootHeight / 2 = parentBottom + verticalGap
  // So: childCenterY = parentBottom + verticalGap + maxChildRootHeight / 2
  const parentBottom = nodeSize.height / 2
  const childCenterY = parentBottom + verticalGap + maxChildRootHeight / 2

  // Position children starting from left, centered under parent
  let currentX = -totalChildrenWidth / 2
  const positionedChildren: LayoutNode[] = []
  const childBoundsList: SubtreeBounds[] = []

  // Start with the node's own contour, then merge children
  const subtreeContour = cloneContour(nodeContour)

  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    const childLayout = child.layout
    const childBounds = childLayout.bounds
    const childWidth = childWidths[i]

    // Place so child's left bound aligns with currentX
    const childOffsetX = currentX - childBounds.left

    // Center alignment: position child root center at childCenterY
    // Child root is at y=0 in its own coordinate system
    const childOffsetY = childCenterY

    // Clone and translate the child's layout
    const translatedChild = structuredClone(childLayout.root)
    translateNode(translatedChild, childOffsetX, childOffsetY)
    positionedChildren.push(translatedChild)

    // Track the translated bounds
    childBoundsList.push(translateBounds(childBounds, childOffsetX, childOffsetY))

    // Merge child contour into subtree contour
    // Contours are indexed from the TOP of the node, not the center.
    // childOffsetY is center-to-center, but we need top-to-top for contour merging:
    // contourDy = (childTop) - (parentTop) = (childOffsetY - childHeight/2) - (-parentHeight/2)
    const contourDy = childOffsetY - childLayout.root.height / 2 + nodeSize.height / 2
    mergeContours(subtreeContour, childLayout.contour, childOffsetX, contourDy, contourRowStep)

    currentX += childWidth + horizontalGap
  }

  layoutNode.children = positionedChildren
  layoutNode.contour = subtreeContour

  // Compute overall bounds: union of this node's bounds and all children's bounds
  const overallBounds = mergeBounds([
    nodeBounds(nodeSize.width, nodeSize.height),
    ...childBoundsList,
  ])

  return { root: layoutNode, bounds: overallBounds, contour: subtreeContour }
}
