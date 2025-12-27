import type { TreeNode, LayoutNode } from '@/types'
import type { LayoutContext, SubtreeBounds } from './types'

/**
 * Calculate node dimensions based on sizing mode and per-node overrides.
 * Priority: node-level dimensions > example fixed dimensions > content-based
 */
export function calculateNodeSize(
  node: TreeNode,
  context: LayoutContext
): { width: number; height: number } {
  // Per-node dimensions take highest priority (for images, etc.)
  if (node.width !== undefined && node.height !== undefined) {
    return { width: node.width, height: node.height }
  }

  // Example-level fixed dimensions
  const { treeData } = context
  if (treeData.sizingMode === 'fixed' && treeData.nodeWidth && treeData.nodeHeight) {
    return { width: treeData.nodeWidth, height: treeData.nodeHeight }
  }

  // Content-based sizing
  const measurement = context.measureText.measure(node.label, context.padding)
  return { width: measurement.width, height: measurement.height }
}

/**
 * Translate a layout node and all its children by (dx, dy).
 */
export function translateNode(node: LayoutNode, dx: number, dy: number): void {
  node.x += dx
  node.y += dy
  for (const child of node.children) {
    translateNode(child, dx, dy)
  }
}

/**
 * Translate bounds by (dx, dy).
 */
export function translateBounds(bounds: SubtreeBounds, dx: number, dy: number): SubtreeBounds {
  return {
    left: bounds.left + dx,
    right: bounds.right + dx,
    top: bounds.top + dy,
    bottom: bounds.bottom + dy,
  }
}

/**
 * Merge multiple bounds into one encompassing bounds.
 */
export function mergeBounds(boundsList: SubtreeBounds[]): SubtreeBounds {
  if (boundsList.length === 0) {
    return { left: 0, right: 0, top: 0, bottom: 0 }
  }
  return {
    left: Math.min(...boundsList.map((b) => b.left)),
    right: Math.max(...boundsList.map((b) => b.right)),
    top: Math.min(...boundsList.map((b) => b.top)),
    bottom: Math.max(...boundsList.map((b) => b.bottom)),
  }
}

/**
 * Create bounds for a single node positioned at origin.
 */
export function nodeBounds(width: number, height: number): SubtreeBounds {
  return {
    left: -width / 2,
    right: width / 2,
    top: -height / 2,
    bottom: height / 2,
  }
}

/**
 * Calculate total width needed for children with gaps between them.
 */
export function calculateChildrenTotalWidth(
  childWidths: number[],
  horizontalGap: number
): number {
  if (childWidths.length === 0) return 0
  const totalWidth = childWidths.reduce((sum, w) => sum + w, 0)
  const totalGaps = (childWidths.length - 1) * horizontalGap
  return totalWidth + totalGaps
}
