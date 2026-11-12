import type { TreeNode, LayoutNode } from '@/types'
import type { LayoutContext, LayoutOptions } from '../types'
import { calculateNodeSize } from '../utils'
import { attachContours } from '../contour'

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
 *
 * The whole tree is laid out in three linear passes over a flat node list:
 * build the nodes, work out each subtree's width and each child's offset
 * from its parent (children before parents), then turn the offsets into
 * positions (parents before children). Nothing recurses and no subtree is
 * ever copied or shifted, so time is proportional to the number of nodes.
 *
 * Returns centre coordinates with the root at the origin.
 */
export function boundingBoxLayout(
  root: TreeNode,
  context: LayoutContext,
  options: LayoutOptions = {}
): LayoutNode {
  const { horizontalGap, verticalGap, reduceLeafSiblingGaps } = context.layout

  // Breadth-first node list: a node's children are consecutive, and every
  // parent comes before its children.
  const sources: TreeNode[] = [root]
  const nodes: LayoutNode[] = []
  const firstChild: number[] = []
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]
    const size = calculateNodeSize(source, context)
    nodes.push({
      id: source.id,
      label: source.label,
      x: 0,
      y: 0,
      width: size.width,
      height: size.height,
      children: [],
    })
    firstChild.push(sources.length)
    if (source.children) {
      for (const child of source.children) sources.push(child)
    }
  }
  const count = nodes.length
  for (let i = 0; i < count; i++) {
    const childCount = sources[i].children?.length ?? 0
    for (let k = 0; k < childCount; k++) nodes[i].children.push(nodes[firstChild[i] + k])
  }

  const isLeaf = (index: number) => nodes[index].children.length === 0
  const gapBefore = (index: number) =>
    reduceLeafSiblingGaps && isLeaf(index - 1) && isLeaf(index) ? horizontalGap / 2 : horizontalGap

  // Children before parents: the horizontal extent of each subtree relative
  // to its own root, and each child's horizontal offset from its parent.
  const left = new Float64Array(count)
  const right = new Float64Array(count)
  const offsetX = new Float64Array(count)
  for (let i = count - 1; i >= 0; i--) {
    const node = nodes[i]
    const childCount = node.children.length
    let lo = -node.width / 2
    let hi = node.width / 2
    if (childCount > 0) {
      const start = firstChild[i]
      const end = start + childCount
      let widths = 0
      let gaps = 0
      for (let c = start; c < end; c++) {
        widths += right[c] - left[c]
        if (c > start) gaps += gapBefore(c)
      }
      // Lay the subtree boxes side by side, centred as a group on the parent.
      let cursor = -(widths + gaps) / 2
      for (let c = start; c < end; c++) {
        offsetX[c] = cursor - left[c]
        lo = Math.min(lo, offsetX[c] + left[c])
        hi = Math.max(hi, offsetX[c] + right[c])
        cursor += right[c] - left[c] + (c + 1 < end ? gapBefore(c + 1) : 0)
      }
    }
    left[i] = lo
    right[i] = hi
  }

  // Parents before children: offsets become positions. Children are
  // top-aligned one vertical gap below the bottom of their parent.
  for (let i = 0; i < count; i++) {
    const node = nodes[i]
    const childrenTop = node.y + node.height / 2 + verticalGap
    for (let c = firstChild[i], end = c + node.children.length; c < end; c++) {
      nodes[c].x = node.x + offsetX[c]
      nodes[c].y = childrenTop + nodes[c].height / 2
    }
  }

  if (options.contours) attachContours(nodes, context.edgeStyle)

  return nodes[0]
}
