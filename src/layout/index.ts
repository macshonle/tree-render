import type { TreeNode, LayoutNode, TreeStyle, TreeExample, LayoutAlgorithmType } from '@/types'
import type { LayoutAlgorithm, LayoutContext, LayoutResult, LaidOutChild, TextMeasurer } from './types'
import { maxwidthLayout } from './algorithms/maxwidth'
import { topAlignLayout } from './algorithms/topAlign'
import { lrSqueezeLayout } from './algorithms/lrSqueeze'
import { rlSqueezeLayout } from './algorithms/rlSqueeze'
import { tidyLayout } from './algorithms/tidy'

// Re-export types for convenience
export type {
  LayoutContext,
  TextMeasurer,
  TextMeasurement,
  LayoutAlgorithm,
  LayoutResult,
  LaidOutChild,
  SubtreeBounds,
} from './types'

/**
 * Registry of available layout algorithms
 */
const algorithms: Record<LayoutAlgorithmType, LayoutAlgorithm> = {
  'maxwidth': maxwidthLayout,
  'top-align': topAlignLayout,
  'lr-squeeze': lrSqueezeLayout,
  'rl-squeeze': rlSqueezeLayout,
  'tidy': tidyLayout,
}

/**
 * Creates a TextMeasurer from a canvas 2D context.
 * This bridges the abstract TextMeasurer interface to the concrete canvas API.
 */
export function createCanvasTextMeasurer(ctx: CanvasRenderingContext2D): TextMeasurer {
  return {
    measure(label: string, padding: number) {
      const lines = label.split('\n')
      const lineHeight = 18
      let maxWidth = 0
      for (const line of lines) {
        const metrics = ctx.measureText(line)
        maxWidth = Math.max(maxWidth, metrics.width)
      }
      return {
        width: maxWidth + padding * 2,
        height: lines.length * lineHeight + padding * 2,
        lines,
      }
    },
  }
}

/**
 * Recursively lays out a tree, processing children before parents.
 * This enables boundary-aware composition where parent algorithms
 * can inspect child bounds to determine spacing.
 *
 * @param node - Current node to lay out
 * @param context - Layout context with style and measurement
 * @param getAlgorithm - Function to get algorithm for a node (enables per-subtree algorithms)
 * @returns LayoutResult with positioned tree and bounds
 */
function layoutSubtree(
  node: TreeNode,
  context: LayoutContext,
  getAlgorithm: (node: TreeNode) => LayoutAlgorithm
): LayoutResult {
  // Recursively lay out all children first
  const laidOutChildren: LaidOutChild[] = (node.children ?? []).map((child) => ({
    node: child,
    layout: layoutSubtree(child, context, getAlgorithm),
  }))

  // Get the algorithm for this node and compose
  const algorithm = getAlgorithm(node)
  return algorithm(node, laidOutChildren, context)
}

/**
 * Main entry point for tree layout.
 * Calculates positions for all nodes based on the selected algorithm.
 *
 * @param root - The tree root node
 * @param treeData - Tree example metadata (for sizing mode, fixed dimensions)
 * @param style - Style configuration including layout settings
 * @param measureText - Text measurer (typically created from canvas context)
 * @returns Positioned LayoutNode tree
 */
export function layoutTree(
  root: TreeNode,
  treeData: TreeExample,
  style: TreeStyle,
  measureText: TextMeasurer
): LayoutNode {
  const context: LayoutContext = {
    measureText,
    treeData,
    layout: style.layout,
    padding: style.node.padding,
    edgeStyle: style.edge.style,
  }

  // For now, use the same algorithm for all nodes.
  // Future: support per-node algorithm selection via TreeNode.layoutAlgorithm
  const globalAlgorithm = algorithms[style.layout.algorithm]
  const getAlgorithm = (_node: TreeNode) => globalAlgorithm

  const result = layoutSubtree(root, context, getAlgorithm)
  return result.root
}

/**
 * Get human-readable names for layout algorithms (for UI)
 */
export const layoutAlgorithmLabels: Record<LayoutAlgorithmType, string> = {
  'maxwidth': 'Centered',
  'top-align': 'Top Align',
  'lr-squeeze': 'LR Squeeze',
  'rl-squeeze': 'RL Squeeze',
  'tidy': 'Tidy',
}
