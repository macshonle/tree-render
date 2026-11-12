import type { TreeNode, LayoutNode } from '@/types'
import type { LayoutContext } from '../types'
import { calculateNodeSize } from '../utils'
import { tidyTree } from '@/tidy-tree/tidy-tree'
import type { TidyNode } from '@/tidy-tree/tidy-tree'

/**
 * Tidy layout algorithm.
 *
 * A thin adapter around the standalone module in src/tidy-tree, which does
 * the real work: van der Ploeg's linear-time layout for trees with
 * variable-sized nodes, made exactly mirror-symmetric by a second pass.
 *
 * - Subtrees interlock: a shallow subtree tucks in beside a deeper one
 * - Reflective symmetry: mirror images produce mirrored layouts
 * - Small subtrees are spread evenly between larger neighbours
 * - Top-aligned children, one vertical gap below their own parent
 * - Parents are centred over their first and last child
 *
 * Unlike the bounding-box algorithm, which is composed node by node, this
 * lays out the whole tree at once and converts the result to the app's
 * LayoutNode shape (centre coordinates, root at the origin).
 *
 * Spacing is measured between node boxes, not between polygon contours.
 */
export function tidyLayout(root: TreeNode, context: LayoutContext): LayoutNode {
  const { horizontalGap, verticalGap, reduceLeafSiblingGaps } = context.layout
  const isLeaf = (n: TidyNode<TreeNode>) => n.children.length === 0

  const tree = tidyTree(root, {
    nodeSize: (node) => calculateNodeSize(node, context),
    nodeGap: horizontalGap,
    levelGap: verticalGap,
    spacing: reduceLeafSiblingGaps
      ? (a, b) => (a.parent === b.parent && isLeaf(a) && isLeaf(b) ? horizontalGap / 2 : horizontalGap)
      : undefined,
  })

  const originX = tree.root.x + tree.root.width / 2
  const originY = tree.root.y + tree.root.height / 2
  const nodes: LayoutNode[] = tree.nodes.map((n) => ({
    id: n.data.id,
    label: n.data.label,
    x: n.x + n.width / 2 - originX,
    y: n.y + n.height / 2 - originY,
    width: n.width,
    height: n.height,
    children: [],
  }))
  // tree.nodes is breadth-first, so each node's children follow in order.
  for (let i = 0, next = 1; i < nodes.length; i++) {
    for (let k = 0; k < tree.nodes[i].children.length; k++) nodes[i].children.push(nodes[next++])
  }

  return nodes[0]
}
