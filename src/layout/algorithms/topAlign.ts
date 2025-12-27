import type { TreeNode, LayoutNode } from '@/types'
import type { LayoutAlgorithm, LayoutResult, LaidOutChild, SubtreeBounds } from '../types'
import {
  calculateNodeSize,
  translateNode,
  translateBounds,
  mergeBounds,
  nodeBounds,
  calculateChildrenTotalWidth,
} from '../utils'

/**
 * Top-align layout algorithm.
 *
 * Centers the current node above its children. Children are compacted
 * horizontally so their bounding boxes are exactly horizontalGap apart.
 *
 * Vertical alignment: All sibling ROOT NODES have their TOP edges aligned
 * at the same y-coordinate, exactly verticalGap below the parent's bottom.
 * This is ideal when child nodes have varying heights and you want a clean
 * horizontal alignment of each row.
 */
export const topAlignLayout: LayoutAlgorithm = (
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

  // If no children, bounds are just this node
  if (children.length === 0) {
    return { root: layoutNode, bounds: nodeBounds(nodeSize.width, nodeSize.height) }
  }

  // Calculate child subtree widths for horizontal positioning
  const childWidths = children.map((c) => c.layout.bounds.right - c.layout.bounds.left)
  const totalChildrenWidth = calculateChildrenTotalWidth(childWidths, horizontalGap)

  // For top alignment: all children have their root tops at the same y
  // Parent bottom is at nodeSize.height / 2
  // Children tops should be at parentBottom + verticalGap
  const parentBottom = nodeSize.height / 2
  const childrenTopY = parentBottom + verticalGap

  // Position children starting from left, centered under parent
  let currentX = -totalChildrenWidth / 2
  const positionedChildren: LayoutNode[] = []
  const childBoundsList: SubtreeBounds[] = []

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

    currentX += childWidth + horizontalGap
  }

  layoutNode.children = positionedChildren

  // Compute overall bounds: union of this node's bounds and all children's bounds
  const overallBounds = mergeBounds([
    nodeBounds(nodeSize.width, nodeSize.height),
    ...childBoundsList,
  ])

  return { root: layoutNode, bounds: overallBounds }
}
