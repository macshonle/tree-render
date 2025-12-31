// Node shape types
export type NodeShape = 'rectangle' | 'rounded-rectangle' | 'circle' | 'ellipse'

// Edge style types
export type EdgeStyle = 'curve' | 'straight-arrow' | 'org-chart'

// Layout algorithm types
export type LayoutAlgorithmType = 'bounding-box' | 'tidy'

// Style configuration for the tree
export interface TreeStyle {
  node: {
    shape: NodeShape
    fillColor: string
    strokeColor: string
    strokeWidth: number
    padding: number
  }
  edge: {
    style: EdgeStyle
    color: string
    width: number
    arrowSize: number
  }
  layout: {
    algorithm: LayoutAlgorithmType
    horizontalGap: number
    verticalGap: number
    reduceLeafSiblingGaps: boolean
  }
}

// Default style configuration
export const defaultTreeStyle: TreeStyle = {
  node: {
    shape: 'rounded-rectangle',
    fillColor: '#ffffff',
    strokeColor: '#111111',
    strokeWidth: 2,
    padding: 10
  },
  edge: {
    style: 'org-chart',
    color: '#000000',
    width: 2,
    arrowSize: 8
  },
  layout: {
    algorithm: 'bounding-box',
    horizontalGap: 10,
    verticalGap: 40,
    reduceLeafSiblingGaps: false
  }
}

// Tree node data structure
export interface TreeNode {
  id: string
  label: string
  children?: TreeNode[]
  // Per-node sizing (for images or fixed-size nodes)
  width?: number
  height?: number
}

// Point on a contour path (for edge-aware Y-monotone polygon contours)
export interface ContourPoint {
  x: number
  y: number
}

// Y-monotone polygon contour for edge-aware subtree boundaries
export interface YMonotonePolygon {
  /** Left boundary points, ordered top-to-bottom (y increasing) */
  left: ContourPoint[]
  /** Right boundary points, ordered top-to-bottom (y increasing) */
  right: ContourPoint[]
}

// Layout node with calculated positions (output of layout algorithms)
export interface LayoutNode {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  children: LayoutNode[]
  /** Edge-aware Y-monotone polygon contour for this subtree */
  polygonContour?: YMonotonePolygon
}

// Sizing mode for tree examples
export type SizingMode = 'fit-content' | 'fixed'

// Deep partial type for nested style overrides
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

// Tree example with metadata, sizing configuration, and optional style overrides
export interface TreeExample {
  id: string
  name: string
  sizingMode: SizingMode
  nodeWidth?: number   // For 'fixed' mode
  nodeHeight?: number  // For 'fixed' mode
  root: TreeNode
  style?: DeepPartial<TreeStyle>  // Example-specific style overrides
}

// Style preset for import/export
export interface StylePreset {
  name: string
  style: TreeStyle
  createdAt: string
}
