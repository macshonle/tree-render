import type { TreeNode } from '@/types'
import type { LayoutContext } from './types'

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
