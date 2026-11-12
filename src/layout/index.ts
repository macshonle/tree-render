import type { TreeNode, LayoutNode, TreeStyle, TreeExample, LayoutAlgorithmType } from '@/types'
import type { LayoutContext, TextMeasurer } from './types'
import { boundingBoxLayout } from './algorithms/boundingBox'
import { tidyLayout } from './algorithms/tidy'

// Re-export types for convenience
export type { LayoutContext, TextMeasurer, TextMeasurement } from './types'

/**
 * Registry of available layout algorithms. Each lays out a whole tree and
 * returns the positioned root.
 */
const algorithms: Record<LayoutAlgorithmType, (root: TreeNode, context: LayoutContext) => LayoutNode> = {
  'bounding-box': boundingBoxLayout,
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
  }

  return algorithms[style.layout.algorithm](root, context)
}

/**
 * Get human-readable names for layout algorithms (for UI)
 */
export const layoutAlgorithmLabels: Record<LayoutAlgorithmType, string> = {
  'bounding-box': 'Bounding Box',
  'tidy': 'Tidy',
}
