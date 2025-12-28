import type { TreeNode, LayoutNode, TreeStyle, TreeExample, EdgeStyle } from '@/types'

// ============================================================================
// Edge-Aware Y-Monotone Polygon Contours
// ============================================================================

/**
 * A point on a contour path.
 * Coordinates are integers (pixel resolution).
 */
export interface ContourPoint {
  x: number
  y: number
}

/**
 * A Y-monotone polygon representing a subtree's contour.
 *
 * Y-monotone means every horizontal line intersects the boundary at most twice.
 * This property is guaranteed for tree layouts because:
 * - Tree structure flows strictly downward (parent above children)
 * - No subtree can wrap around another from below
 * - No caves, overhangs, or U-shapes are possible
 *
 * The polygon is represented as two boundary paths:
 * - left: traces the left boundary from top to bottom (y increasing)
 * - right: traces the right boundary from top to bottom (y increasing)
 *
 * The closed polygon path (counterclockwise in screen coords) is:
 *   left[0] → left[1] → ... → left[n] →
 *   right[n] → right[n-1] → ... → right[0] → left[0]
 *
 * Coordinates are relative to the subtree root's position (root at origin).
 */
export interface YMonotonePolygon {
  /** Left boundary points, ordered top-to-bottom (y increasing) */
  left: ContourPoint[]
  /** Right boundary points, ordered top-to-bottom (y increasing) */
  right: ContourPoint[]
}

/**
 * Edge contour style determines how parent-to-child connections affect the contour.
 *
 * - 'curve': Corner-to-corner diagonals (simplest - parent bottom corners to child top corners)
 * - 'straight-arrow': Center-to-center diagonals (parent bottom-center to child top-center)
 * - 'org-chart': Rectangular segments (vertical drop, horizontal bar, vertical drops to children)
 */
export type EdgeContourStyle = EdgeStyle

// ============================================================================
// Text Measurement
// ============================================================================

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
 * Result of laying out a subtree.
 * Contains both the positioned nodes and the subtree's boundary information.
 */
export interface LayoutResult {
  /** The positioned node tree */
  root: LayoutNode
  /** Boundary information for composition with siblings */
  bounds: SubtreeBounds
  /** Edge-aware Y-monotone polygon contour */
  polygonContour: YMonotonePolygon
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
  /** Edge style (for edge-aware contour building) */
  edgeStyle: EdgeStyle
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
