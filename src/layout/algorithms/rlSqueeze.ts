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
  translateContour,
  calculatePlacementOffset,
  unionContours,
  type ChildContourInfo,
} from '../contour'

/**
 * RL Squeeze (Right-to-Left Squeeze) layout algorithm.
 *
 * Centers the current node above its children. Children are placed right-to-left
 * using contour-based compaction - each child is brought as close as possible
 * to the already-placed children while maintaining the horizontalGap.
 *
 * This is the mirror image of LR Squeeze - it processes children from right to left,
 * which can produce different layouts when subtrees have asymmetric shapes.
 *
 * Vertical alignment: All sibling ROOT NODES have their TOP edges aligned
 * at the same y-coordinate, exactly verticalGap below the parent's bottom.
 */
export const rlSqueezeLayout: LayoutAlgorithm = (
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

  // Position children using contour-based compaction (RIGHT TO LEFT)
  // Start with the rightmost child, then add each subsequent child
  // as close as possible to the left edge of the "forest" contour
  const positionedChildren: LayoutNode[] = new Array(children.length)
  const childBoundsList: SubtreeBounds[] = new Array(children.length)
  const childOffsets: { x: number; y: number }[] = new Array(children.length)

  // Track the forest contour (union of all placed children so far)
  // All contours are translated to parent-relative coordinates
  let forestContour: typeof children[0]['layout']['polygonContour'] | null = null

  // Process children from RIGHT to LEFT
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i]
    const childLayout = child.layout

    // Top alignment: position child root top at childrenTopY
    const childOffsetY = childrenTopY + childLayout.root.height / 2

    let childOffsetX: number

    if (forestContour === null) {
      // First child (rightmost) - place at x=0
      childOffsetX = 0
    } else {
      // Subsequent children - use contour-based placement
      // Place this child to the LEFT of the forest
      const childContourAtY = translateContour(childLayout.polygonContour, 0, childOffsetY)

      // Calculate offset needed to place child to the left of forest with gap
      // We need the child's right edge to be gap pixels away from forest's left edge
      // This is the reverse of LR Squeeze
      const offset = calculatePlacementOffsetLeft(childContourAtY, forestContour, horizontalGap)
      childOffsetX = offset
    }

    // Clone and translate the child's layout
    const translatedChild = structuredClone(childLayout.root)
    translateNode(translatedChild, childOffsetX, childOffsetY)
    positionedChildren[i] = translatedChild

    // Track the translated bounds
    const translatedBounds = translateBounds(childLayout.bounds, childOffsetX, childOffsetY)
    childBoundsList[i] = translatedBounds

    // Store offset for contour info
    childOffsets[i] = { x: childOffsetX, y: childOffsetY }

    // Update forest contour by unioning with the newly placed child
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

  // Center the parent over its direct children's node span
  // (left edge of first child node to right edge of last child node)
  const firstChild = positionedChildren[0]
  const lastChild = positionedChildren[positionedChildren.length - 1]
  const directChildrenLeft = firstChild.x - firstChild.width / 2
  const directChildrenRight = lastChild.x + lastChild.width / 2
  const directChildrenCenterX = (directChildrenLeft + directChildrenRight) / 2

  // Shift all children so the direct children span is centered at x=0 (parent's center)
  const centeringOffset = -directChildrenCenterX

  for (let i = 0; i < positionedChildren.length; i++) {
    translateNode(positionedChildren[i], centeringOffset, 0)
    childBoundsList[i] = translateBounds(childBoundsList[i], centeringOffset, 0)
    childOffsets[i].x += centeringOffset
  }

  // Collect child contour info for polygon contour building
  const childContourInfos: ChildContourInfo[] = []
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    childContourInfos.push({
      contour: child.layout.polygonContour,
      offsetX: childOffsets[i].x,
      offsetY: childOffsets[i].y,
      width: child.layout.root.width,
      height: child.layout.root.height,
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
 * Calculate the horizontal offset needed to place leftContour to the LEFT of rightContour
 * with a specified gap.
 *
 * This is the mirror of calculatePlacementOffset - it places the left contour
 * so its right edge is 'gap' pixels away from the right contour's left edge.
 *
 * @param leftContour The contour to place (at origin)
 * @param rightContour The existing forest contour (already positioned)
 * @param desiredGap The minimum gap to maintain between contours
 * @returns The x-offset to apply to leftContour
 */
function calculatePlacementOffsetLeft(
  leftContour: typeof arguments[0],
  rightContour: typeof arguments[1],
  desiredGap: number
): number {
  // Use the existing calculatePlacementOffset but swap the arguments
  // and negate the result since we're placing to the left
  const offset = calculatePlacementOffset(leftContour, rightContour, desiredGap)
  // The offset tells us how much to move rightContour to the right of leftContour
  // We want the inverse: how much to move leftContour to the left of rightContour
  // If leftContour is at origin and we get offset X, then placing leftContour
  // at position -offset would put it to the left
  return -offset
}
