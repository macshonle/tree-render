import type { TreeNode, LayoutNode, TreeStyle, TreeExample } from '@/types'

/**
 * Text measurement result
 */
export interface TextMeasurement {
  width: number
  height: number
  lines: string[]
}

/**
 * Abstraction for measuring text dimensions.
 * This decouples layout algorithms from canvas-specific APIs.
 */
export interface TextMeasurer {
  measure(label: string, padding: number): TextMeasurement
}

/**
 * Bounding rectangle for a subtree.
 * Coordinates are relative to the subtree root's position.
 */
export interface SubtreeBounds {
  /** Leftmost x coordinate (relative to root x) */
  left: number
  /** Rightmost x coordinate (relative to root x) */
  right: number
  /** Topmost y coordinate (relative to root y) */
  top: number
  /** Bottommost y coordinate (relative to root y) */
  bottom: number
}

/**
 * Skyline contour for a subtree.
 *
 * Represents the left and right edge profiles of a subtree as arrays
 * indexed by row (y / rowStep). This enables tighter packing where
 * subtree bounding boxes can overlap without nodes actually intersecting.
 *
 * Coordinates are relative to the subtree root's position.
 */
export interface SkylineContour {
  /** Left edge x-coordinates per row (indexed by row number) */
  left: number[]
  /** Right edge x-coordinates per row (indexed by row number) */
  right: number[]
  /** Total height of the contour in pixels */
  height: number
  /** Row step used when this contour was created (for consistent rendering) */
  rowStep: number
}

/** Default row height for contour sampling (pixels). Use layout.contourRowStep for configurable value. */
export const DEFAULT_CONTOUR_ROW_STEP = 4

/**
 * Result of laying out a subtree.
 * Contains both the positioned nodes and the subtree's boundary information.
 */
export interface LayoutResult {
  /** The positioned node tree */
  root: LayoutNode
  /** Boundary information for composition with siblings */
  bounds: SubtreeBounds
  /** Skyline contour for tighter packing algorithms */
  contour: SkylineContour
}

/**
 * A child subtree that has already been laid out.
 * Parent algorithms receive these to compose into the final layout.
 */
export interface LaidOutChild {
  /** Original tree node (for accessing node properties) */
  node: TreeNode
  /** The laid-out result with positions and bounds */
  layout: LayoutResult
}

/**
 * Context passed to layout algorithms containing all necessary configuration
 */
export interface LayoutContext {
  /** Measures text dimensions */
  measureText: TextMeasurer
  /** Tree example metadata (for sizing mode, fixed dimensions) */
  treeData: TreeExample
  /** Layout configuration from style */
  layout: TreeStyle['layout']
  /** Node padding from style */
  padding: number
}

/**
 * A layout algorithm function signature.
 *
 * Algorithms receive:
 * - The current node to position
 * - Pre-laid-out children (each child subtree already positioned with bounds)
 * - Layout context
 *
 * Algorithms return:
 * - LayoutResult with positioned tree and boundary information
 *
 * This design enables:
 * - Recursive composition (children laid out before parent)
 * - Polymorphic layouts (different algorithms per subtree)
 * - Boundary-aware composition (parent can compact children based on bounds)
 */
export type LayoutAlgorithm = (
  node: TreeNode,
  children: LaidOutChild[],
  context: LayoutContext
) => LayoutResult
