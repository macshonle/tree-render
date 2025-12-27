import type { TreeNode, LayoutNode } from '@/types'
import type { LayoutContext, SubtreeBounds, SkylineContour } from './types'
import { DEFAULT_CONTOUR_ROW_STEP } from './types'

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
export function calculateChildrenTotalWidth(childWidths: number[], horizontalGap: number): number {
  if (childWidths.length === 0) return 0
  const totalWidth = childWidths.reduce((sum, w) => sum + w, 0)
  const totalGaps = (childWidths.length - 1) * horizontalGap
  return totalWidth + totalGaps
}

// ============================================================================
// Skyline Contour Utilities
// ============================================================================

/**
 * Create an empty contour with the specified number of rows.
 */
export function makeEmptyContour(
  rows: number,
  rowStep: number = DEFAULT_CONTOUR_ROW_STEP
): SkylineContour {
  return {
    left: new Array(rows).fill(+Infinity),
    right: new Array(rows).fill(-Infinity),
    height: rows * rowStep,
    rowStep,
  }
}

/**
 * Create a contour from a node's bounding box.
 * The node is centered at origin (x=0), extending from -w/2 to +w/2.
 */
export function contourFromNodeBox(
  width: number,
  height: number,
  rowStep: number = DEFAULT_CONTOUR_ROW_STEP
): SkylineContour {
  const rows = Math.ceil(height / rowStep)
  const left = -width / 2
  const right = width / 2
  return {
    left: new Array(rows).fill(left),
    right: new Array(rows).fill(right),
    height,
    rowStep,
  }
}

/**
 * Merge a source contour into a destination contour with offset (dx, dy).
 * Modifies dst in place, expanding its arrays if needed.
 */
export function mergeContours(
  dst: SkylineContour,
  src: SkylineContour,
  dx: number,
  dy: number,
  rowStep: number = DEFAULT_CONTOUR_ROW_STEP
): void {
  // Use round instead of floor to center error around 0 (±rowStep/2)
  // rather than always positive (0 to rowStep-1). This prevents
  // systematic error accumulation across tree levels.
  const rowShift = Math.round(dy / rowStep)
  const needRows = Math.max(dst.left.length, rowShift + src.left.length)

  // Expand destination arrays if needed
  if (needRows > dst.left.length) {
    const add = needRows - dst.left.length
    dst.left.push(...new Array(add).fill(+Infinity))
    dst.right.push(...new Array(add).fill(-Infinity))
  }

  // Merge source into destination
  for (let i = 0; i < src.left.length; i++) {
    const j = i + rowShift
    if (j >= 0 && j < dst.left.length) {
      dst.left[j] = Math.min(dst.left[j], src.left[i] + dx)
      dst.right[j] = Math.max(dst.right[j], src.right[i] + dx)
    }
  }

  // Update height
  dst.height = Math.max(dst.height, dy + src.height)
}

/**
 * Translate a contour by (dx, dy), returning a new contour.
 */
export function translateContour(
  contour: SkylineContour,
  dx: number,
  dy: number,
  rowStep: number = DEFAULT_CONTOUR_ROW_STEP
): SkylineContour {
  // Use round instead of floor for consistency with mergeContours
  const rowShift = Math.round(dy / rowStep)
  const newRows = Math.max(0, rowShift + contour.left.length)

  const result: SkylineContour = {
    left: new Array(newRows).fill(+Infinity),
    right: new Array(newRows).fill(-Infinity),
    height: Math.max(0, contour.height + dy),
    rowStep,
  }

  for (let i = 0; i < contour.left.length; i++) {
    const j = i + rowShift
    if (j >= 0 && j < newRows) {
      result.left[j] = contour.left[i] + dx
      result.right[j] = contour.right[i] + dx
    }
  }

  return result
}

/**
 * Clone a contour (deep copy).
 */
export function cloneContour(contour: SkylineContour): SkylineContour {
  return {
    left: [...contour.left],
    right: [...contour.right],
    height: contour.height,
    rowStep: contour.rowStep,
  }
}
