// Node shape types
export type NodeShape = 'rectangle' | 'rounded-rectangle' | 'circle' | 'ellipse'

// Edge style types
export type EdgeStyle = 'curve' | 'straight-arrow' | 'org-chart'

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
    horizontalGap: number
    verticalGap: number
    lineSpacing: number
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
    horizontalGap: 10,
    verticalGap: 40,
    lineSpacing: 20
  }
}

// Tree node data structure (for future use)
export interface TreeNode {
  id: string
  label: string
  children?: TreeNode[]
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
