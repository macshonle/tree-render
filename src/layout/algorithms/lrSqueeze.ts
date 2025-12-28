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
  mergeContoursWithGap,
  unionContours,
  type ChildContourInfo,
} from '../contour'

/**
 * LR Squeeze (Left-to-Right Squeeze) layout algorithm.
 *
 * Centers the current node above its children. Children are placed left-to-right
 * using contour-based compaction - each child is brought as close as possible
 * to the already-placed children while maintaining the horizontalGap.
 *
 * Vertical alignment: All sibling ROOT NODES have their TOP edges aligned
 * at the same y-coordinate, exactly verticalGap below the parent's bottom.
 *
 * Key difference from top-align: Instead of using bounding box widths,
 * this algorithm uses the actual polygon contours to allow interlocking
 * of subtrees that have different shapes, resulting in more compact layouts.
 */
export const lrSqueezeLayout: LayoutAlgorithm = (
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

  // Position children using contour-based compaction
  // Start with the leftmost child, then add each subsequent child
  // as close as possible to the right edge of the "forest" contour
  const positionedChildren: LayoutNode[] = []
  const childBoundsList: SubtreeBounds[] = []
  const childContourInfos: ChildContourInfo[] = []
  const childOffsets: { x: number; y: number }[] = []

  // Track the forest contour (union of all placed children so far)
  // All contours are translated to parent-relative coordinates
  let forestContour: typeof children[0]['layout']['polygonContour'] | null = null

  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    const childLayout = child.layout

    // Top alignment: position child root top at childrenTopY
    // Child root is at y=0, so its top is at -height/2
    // We want: childRootTop + childOffsetY = childrenTopY
    // So: -height/2 + childOffsetY = childrenTopY
    // childOffsetY = childrenTopY + height/2
    const childOffsetY = childrenTopY + childLayout.root.height / 2

    let childOffsetX: number

    if (forestContour === null) {
      // First child - place at its natural position (centered at x=0)
      // We need to offset so the child's left bound is at -totalWidth/2
      // For now, just place at x=0 and we'll center everything at the end
      childOffsetX = 0
    } else {
      // Subsequent children - use contour-based placement
      // Translate child contour to the same y-level
      const childContourAtY = translateContour(childLayout.polygonContour, 0, childOffsetY)

      // Calculate offset needed to place child adjacent to forest with gap
      const { rightOffset } = mergeContoursWithGap(forestContour, childContourAtY, horizontalGap)
      childOffsetX = rightOffset
    }

    // Clone and translate the child's layout
    const translatedChild = structuredClone(childLayout.root)
    translateNode(translatedChild, childOffsetX, childOffsetY)
    positionedChildren.push(translatedChild)

    // Track the translated bounds
    const translatedBounds = translateBounds(childLayout.bounds, childOffsetX, childOffsetY)
    childBoundsList.push(translatedBounds)

    // Store offset for contour info
    childOffsets.push({ x: childOffsetX, y: childOffsetY })

    // Update forest contour by unioning with the newly placed child
    // Note: We use unionContours directly here because the child is already
    // positioned correctly. mergeContoursWithGap would re-calculate placement.
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

  // Center the parent over its direct children's node span
  // (left edge of first child node to right edge of last child node)
  // NOT over the entire forest bounds which includes grandchildren
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
