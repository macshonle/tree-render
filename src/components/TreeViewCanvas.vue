<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { mdiPlus, mdiMinus } from '@mdi/js'
import type { TreeStyle, TreeExample, LayoutNode, YMonotonePolygon, ContourPoint } from '@/types'
import { layoutTree, createCanvasTextMeasurer } from '@/layout'
import { useDebugMode } from '@/composables/useDebugMode'
import { useCanvasView } from '@/composables/useCanvasView'
import { preserveRootPosition } from '@/components/treeViewPositioning'

const props = defineProps<{
  styleConfig: TreeStyle
  treeData?: TreeExample | null
}>()

const { debugMode, selection, selectNode, selectEdge, clearSelection } = useDebugMode()
const {
  zoom,
  applyPanDelta,
  setZoom,
  setPanOffset,
  resetView: resetCanvasView,
  setCurrentExample,
  markUserInteraction,
  getPanOffset,
  getZoom,
  hasUserInteracted,
} = useCanvasView()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

// Local panning state (not shared)
const isPanning = ref(false)
const lastMousePos = ref({ x: 0, y: 0 })
const mouseDownPos = ref({ x: 0, y: 0 })

// Hover state for debug mode
type HoverTarget =
  | { type: 'node'; nodeId: string }
  | { type: 'edge'; parentId: string; childId: string; childIndex: number }
  | null
const hoverTarget = ref<HoverTarget>(null)

// Store the current layout for hit testing
let currentLayoutRoot: LayoutNode | null = null
let currentOffsetX = 0
let currentOffsetY = 0

// Store previous root screen position to preserve it when algorithm changes
let previousRootScreenX: number | null = null
let previousRootScreenY: number | null = null

// Track layout algorithm to detect algorithm-only changes
let previousLayoutAlgorithm: string | null = null

// Flag to indicate we're in a pan/zoom operation (don't adjust position)
let isInteracting = false

// Edge hit detection threshold (in canvas pixels before zoom)
const EDGE_HIT_THRESHOLD = 10

// Predefined zoom levels to avoid floating point drift
// Button zoom steps through these exact values
const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0]

/**
 * Find the next zoom level up from current zoom.
 * Returns the current zoom clamped to max if already at or above max.
 */
function getNextZoomUp(current: number): number {
  for (const level of ZOOM_LEVELS) {
    if (level > current + 0.001) { // Small epsilon for floating point comparison
      return level
    }
  }
  return ZOOM_LEVELS[ZOOM_LEVELS.length - 1]
}

/**
 * Find the next zoom level down from current zoom.
 * Returns the current zoom clamped to min if already at or below min.
 */
function getNextZoomDown(current: number): number {
  for (let i = ZOOM_LEVELS.length - 1; i >= 0; i--) {
    if (ZOOM_LEVELS[i] < current - 0.001) { // Small epsilon for floating point comparison
      return ZOOM_LEVELS[i]
    }
  }
  return ZOOM_LEVELS[0]
}

function resizeCanvas() {
  if (containerRef.value && canvasRef.value) {
    const rect = containerRef.value.getBoundingClientRect()
    // Set canvas dimensions directly on the DOM element
    // Do NOT use Vue reactive bindings for canvas dimensions - Vue's batched
    // updates would clear the canvas after draw() by re-setting width/height
    canvasRef.value.width = rect.width
    canvasRef.value.height = rect.height
    draw()
  }
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const { node: nodeStyle, edge: edgeStyle } = props.styleConfig

  // Clear canvas
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Draw checkerboard pattern for transparency indicator
  drawCheckerboard(ctx, canvas.width, canvas.height)

  // Early return if no tree data
  if (!props.treeData?.root) {
    ctx.save()
    ctx.fillStyle = '#666666'
    ctx.font = '14px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Select an example from the dropdown', canvas.width / 2, canvas.height / 2)
    ctx.restore()
    return
  }

  // Set font for text measurement
  ctx.font = '14px system-ui, sans-serif'

  // Calculate tree layout using the selected algorithm
  const textMeasurer = createCanvasTextMeasurer(ctx)
  const layoutRoot = layoutTree(props.treeData.root, props.treeData, props.styleConfig, textMeasurer)

  // Calculate tree bounds (for positioning)
  let minX = Infinity
  function calcBounds(node: LayoutNode) {
    minX = Math.min(minX, node.x - node.width / 2)
    node.children.forEach(calcBounds)
  }
  calcBounds(layoutRoot)

  // Get gap values from style config
  // horizontalGap (Min Gap) is used for canvas margins (both left and top)
  // verticalGap (Line Spacing) is used for spacing between tree levels
  const { horizontalGap } = props.styleConfig.layout

  // Calculate root's bounding box top
  const rootTop = layoutRoot.y - layoutRoot.height / 2

  // offsetX: shifts tree so that left boundary is at x=0 in tree space
  // offsetY: shifts tree so that root top is at y=0 in tree space
  const offsetX = -minX
  const offsetY = -rootTop

  // Store for hit testing
  currentLayoutRoot = layoutRoot
  currentOffsetX = offsetX
  currentOffsetY = offsetY

  // Get current view state
  const panOffset = getPanOffset()
  const zoom = getZoom()
  const currentAlgorithm = props.styleConfig.layout.algorithm

  const algorithmChanged = previousLayoutAlgorithm !== null && previousLayoutAlgorithm !== currentAlgorithm
  const rootPosition = preserveRootPosition({
    horizontalGap,
    panOffset,
    layoutRootX: layoutRoot.x,
    layoutRootY: layoutRoot.y,
    offsetX,
    offsetY,
    zoom,
    previousRootScreenX,
    previousRootScreenY,
    hasUserInteracted: hasUserInteracted(),
    isInteracting,
    algorithmChanged,
  })
  if (rootPosition.didAdjust) {
    setPanOffset(rootPosition.panOffset.x, rootPosition.panOffset.y)
  }

  // Update tracking state for next redraw
  previousLayoutAlgorithm = currentAlgorithm
  previousRootScreenX = rootPosition.rootScreenX
  previousRootScreenY = rootPosition.rootScreenY

  // Apply transformations
  // Position tree at top-left with gaps:
  // - Tree left boundary at horizontalGap from canvas left edge
  // - Root top at horizontalGap from canvas top edge (same margin for both)
  ctx.save()
  ctx.translate(horizontalGap + rootPosition.panOffset.x, horizontalGap + rootPosition.panOffset.y)
  ctx.scale(zoom, zoom)

  // Calculate shape-specific vertical offset for edge attachment points
  // Accounts for shape extensions beyond bounding box + stroke width
  function getShapeVerticalOffset(nodeWidth: number, nodeHeight: number): number {
    const strokeOffset = nodeStyle.strokeWidth / 2
    switch (nodeStyle.shape) {
      case 'circle':
        // Circle uses max dimension, may extend beyond height
        const circleRadius = Math.max(nodeWidth, nodeHeight) / 2
        const heightRadius = nodeHeight / 2
        return (circleRadius - heightRadius) + strokeOffset
      case 'ellipse':
        // Ellipse adds +2 to vertical radius
        return 2 + strokeOffset
      default:
        // Rectangle and rounded-rectangle match bounding box
        return strokeOffset
    }
  }

  // Draw tree bottom-up: children first, then edges, then parent node.
  // This ensures arrow heads are drawn over child nodes, while edge starts
  // are covered by parent nodes.
  function drawSubtree(node: LayoutNode) {
    // 1. Recursively draw all children first
    for (const child of node.children) {
      drawSubtree(child)
    }

    // 2. Draw edges from this node to its children (arrows on top of children)
    if (node.children.length > 0) {
      const parentOffset = getShapeVerticalOffset(node.width, node.height)
      const parentX = node.x + offsetX
      const parentBottom = node.y + offsetY + node.height / 2 + parentOffset

      // Calculate child endpoints
      const childEndpoints = node.children.map(child => {
        const childOffset = getShapeVerticalOffset(child.width, child.height)
        return {
          x: child.x + offsetX,
          y: child.y + offsetY - child.height / 2 - childOffset
        }
      })

      if (edgeStyle.style === 'org-chart') {
        // Org-chart: draw as single connected structure with shared horizontal bar
        // Bar Y is midpoint between parent bottom and topmost child
        const minChildY = Math.min(...childEndpoints.map(c => c.y))
        const barY = (parentBottom + minChildY) / 2

        ctx!.strokeStyle = edgeStyle.color
        ctx!.lineWidth = edgeStyle.width
        ctx!.lineCap = 'round'
        ctx!.lineJoin = 'round'
        ctx!.beginPath()

        // Vertical drop from parent to bar
        ctx!.moveTo(parentX, parentBottom)
        ctx!.lineTo(parentX, barY)

        // Horizontal bar spanning all children
        const leftX = Math.min(...childEndpoints.map(c => c.x))
        const rightX = Math.max(...childEndpoints.map(c => c.x))
        ctx!.moveTo(leftX, barY)
        ctx!.lineTo(rightX, barY)

        // Vertical drops from bar to each child
        for (let i = 0; i < childEndpoints.length; i++) {
          const child = childEndpoints[i]
          // Check if this edge is hovered
          const isHovered = debugMode.value && hoverTarget.value?.type === 'edge' &&
            hoverTarget.value.parentId === node.id &&
            hoverTarget.value.childIndex === i

          if (isHovered) {
            // Draw highlight for this vertical segment
            ctx!.stroke() // finish previous path
            ctx!.save()
            ctx!.strokeStyle = 'rgba(100, 150, 255, 0.8)'
            ctx!.lineWidth = edgeStyle.width + 4
            ctx!.beginPath()
            ctx!.moveTo(child.x, barY)
            ctx!.lineTo(child.x, child.y)
            ctx!.stroke()
            ctx!.restore()
            ctx!.beginPath()
          }

          ctx!.moveTo(child.x, barY)
          ctx!.lineTo(child.x, child.y)
        }

        ctx!.stroke()
      } else {
        // Curve and straight-arrow: draw individual edges
        for (let i = 0; i < childEndpoints.length; i++) {
          const child = childEndpoints[i]
          // Check if this edge is hovered
          const isHovered = debugMode.value && hoverTarget.value?.type === 'edge' &&
            hoverTarget.value.parentId === node.id &&
            hoverTarget.value.childIndex === i

          if (isHovered) {
            // Draw highlight behind the edge
            drawEdgeHighlight(ctx!, parentX, parentBottom, child.x, child.y, edgeStyle)
          }

          drawEdge(ctx!, parentX, parentBottom, child.x, child.y, edgeStyle)
        }
      }
    }

    // 3. Draw this node (covers edge starts)
    // Check if this node is hovered
    const isHovered = debugMode.value && hoverTarget.value?.type === 'node' &&
      hoverTarget.value.nodeId === node.id

    if (isHovered) {
      // Draw highlight behind the node
      ctx!.save()
      ctx!.fillStyle = 'rgba(100, 150, 255, 0.3)'
      ctx!.strokeStyle = 'rgba(100, 150, 255, 0.8)'
      ctx!.lineWidth = 3
      const halfW = node.width / 2 + 4
      const halfH = node.height / 2 + 4
      ctx!.beginPath()
      ctx!.roundRect(node.x + offsetX - halfW, node.y + offsetY - halfH, halfW * 2, halfH * 2, 6)
      ctx!.fill()
      ctx!.stroke()
      ctx!.restore()
    }

    drawNode(ctx!, node.x + offsetX, node.y + offsetY, node.label, nodeStyle, node.width, node.height)
  }
  drawSubtree(layoutRoot)

  // Draw contours if debug mode is enabled and something is selected
  if (debugMode.value && selection.value) {
    drawDebugContours(ctx!, layoutRoot, offsetX, offsetY, selection.value)
  }

  ctx.restore()
}

/**
 * Draw debug contours for the selected node or edge.
 */
function drawDebugContours(
  ctx: CanvasRenderingContext2D,
  root: LayoutNode,
  offsetX: number,
  offsetY: number,
  sel: { type: 'node'; nodeId: string } | { type: 'edge'; parentId: string; childId: string; childIndex: number }
) {
  if (sel.type === 'node') {
    // Find the node and draw its contour
    const node = findNodeById(root, sel.nodeId)
    if (node?.polygonContour) {
      drawPolygonContour(ctx, node.polygonContour, node.x + offsetX, node.y + offsetY, 'left', 'rgba(0, 180, 0, 0.9)')
      drawPolygonContour(ctx, node.polygonContour, node.x + offsetX, node.y + offsetY, 'right', 'rgba(220, 0, 0, 0.9)')
    }
  } else {
    // Find the parent node
    const parent = findNodeById(root, sel.parentId)
    if (!parent) return

    const childIndex = sel.childIndex
    const children = parent.children

    // For edge selection, show:
    // - Right contour of left subtree (if exists, or ancestor's left sibling)
    // - Left contour of right subtree (if exists, or ancestor's right sibling)

    // Left boundary (red): immediate left sibling, or walk up to find ancestor with left sibling
    if (childIndex > 0) {
      const leftChild = children[childIndex - 1]
      if (leftChild?.polygonContour) {
        drawPolygonContour(ctx, leftChild.polygonContour, leftChild.x + offsetX, leftChild.y + offsetY, 'right', 'rgba(220, 0, 0, 0.9)')
      }
    } else if (childIndex === 0) {
      // No immediate left sibling - find ancestor's left sibling
      const ancestorLeftSibling = findAncestorLeftSibling(root, sel.parentId)
      if (ancestorLeftSibling?.polygonContour) {
        drawPolygonContour(ctx, ancestorLeftSibling.polygonContour, ancestorLeftSibling.x + offsetX, ancestorLeftSibling.y + offsetY, 'right', 'rgba(220, 0, 0, 0.9)')
      }
    }

    // Right boundary (green): the selected child's left contour
    if (childIndex < children.length) {
      const rightChild = children[childIndex]
      if (rightChild?.polygonContour) {
        drawPolygonContour(ctx, rightChild.polygonContour, rightChild.x + offsetX, rightChild.y + offsetY, 'left', 'rgba(0, 180, 0, 0.9)')
      }
    }
  }
}

/**
 * Find the nearest ancestor that has a left sibling, and return that left sibling.
 * This is used when a node is the leftmost child - we walk up to find the
 * subtree that forms the left boundary.
 */
function findAncestorLeftSibling(root: LayoutNode, nodeId: string): LayoutNode | null {
  // Build path from root to nodeId
  const path = findPathToNode(root, nodeId)
  if (!path || path.length < 2) return null

  // Walk up the path (excluding the target node itself)
  // path[0] is root, path[path.length-1] is the target
  for (let i = path.length - 1; i >= 1; i--) {
    const node = path[i]
    const parent = path[i - 1]

    // Find node's index among parent's children
    const nodeIndex = parent.children.findIndex(c => c.id === node.id)
    if (nodeIndex > 0) {
      // Found an ancestor with a left sibling
      return parent.children[nodeIndex - 1]
    }
  }

  return null
}

/**
 * Find the path from root to a node with the given ID.
 * Returns array of nodes from root to target, or null if not found.
 */
function findPathToNode(node: LayoutNode, targetId: string, path: LayoutNode[] = []): LayoutNode[] | null {
  const currentPath = [...path, node]

  if (node.id === targetId) {
    return currentPath
  }

  for (const child of node.children) {
    const result = findPathToNode(child, targetId, currentPath)
    if (result) return result
  }

  return null
}

/**
 * Draw a Y-monotone polygon contour as left and right boundary paths.
 * This is the new edge-aware contour format.
 */
function drawPolygonContour(
  ctx: CanvasRenderingContext2D,
  contour: YMonotonePolygon,
  nodeX: number,
  nodeY: number,
  side: 'left' | 'right',
  color: string
) {
  const points: ContourPoint[] = side === 'left' ? contour.left : contour.right
  if (points.length === 0) return

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()

  // Draw the path - points are already in node-local coordinates
  const firstPoint = points[0]
  ctx.moveTo(nodeX + firstPoint.x, nodeY + firstPoint.y)

  for (let i = 1; i < points.length; i++) {
    const point = points[i]
    ctx.lineTo(nodeX + point.x, nodeY + point.y)
  }

  ctx.stroke()

  // Draw dots at all vertices
  ctx.fillStyle = color
  const dotRadius = 4

  for (const point of points) {
    ctx.beginPath()
    ctx.arc(nodeX + point.x, nodeY + point.y, dotRadius, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

/**
 * Find a node by ID in the layout tree
 */
function findNodeById(node: LayoutNode, id: string): LayoutNode | null {
  if (node.id === id) return node
  for (const child of node.children) {
    const found = findNodeById(child, id)
    if (found) return found
  }
  return null
}

function drawCheckerboard(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const size = 10
  ctx.fillStyle = '#f0f0f0'
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = '#e8e8e8'
  for (let y = 0; y < height; y += size * 2) {
    for (let x = 0; x < width; x += size * 2) {
      ctx.fillRect(x, y, size, size)
      ctx.fillRect(x + size, y + size, size, size)
    }
  }
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  style: TreeStyle['node'],
  nodeWidth?: number,
  nodeHeight?: number
) {
  const { shape, fillColor, strokeColor, strokeWidth, padding } = style

  // Use provided dimensions or calculate from text
  ctx.font = '14px system-ui, sans-serif'
  const lines = label.split('\n')
  const lineHeight = 18

  let boxWidth: number
  let boxHeight: number

  if (nodeWidth !== undefined && nodeHeight !== undefined) {
    boxWidth = nodeWidth
    boxHeight = nodeHeight
  } else {
    let maxWidth = 0
    for (const line of lines) {
      const metrics = ctx.measureText(line)
      maxWidth = Math.max(maxWidth, metrics.width)
    }
    boxWidth = maxWidth + padding * 2
    boxHeight = lines.length * lineHeight + padding * 2
  }

  ctx.fillStyle = fillColor
  ctx.strokeStyle = strokeColor
  ctx.lineWidth = strokeWidth

  switch (shape) {
    case 'rectangle':
      ctx.beginPath()
      ctx.rect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight)
      ctx.fill()
      if (strokeWidth > 0) ctx.stroke()
      break

    case 'rounded-rectangle':
      const radius = Math.min(8, boxHeight / 4)
      ctx.beginPath()
      roundRect(ctx, x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight, radius)
      ctx.fill()
      if (strokeWidth > 0) ctx.stroke()
      break

    case 'circle':
      // Use the larger dimension to ensure text fits, shape extends beyond bounding box
      const circleRadius = Math.max(boxWidth, boxHeight) / 2
      ctx.beginPath()
      ctx.arc(x, y, circleRadius, 0, Math.PI * 2)
      ctx.fill()
      if (strokeWidth > 0) ctx.stroke()
      break

    case 'ellipse':
      // Ellipse with slight padding to avoid text touching edges
      const ellipseRx = boxWidth / 2 + 2
      const ellipseRy = boxHeight / 2 + 2
      ctx.beginPath()
      ctx.ellipse(x, y, ellipseRx, ellipseRy, 0, 0, Math.PI * 2)
      ctx.fill()
      if (strokeWidth > 0) ctx.stroke()
      break
  }

  // Draw text (supports multi-line)
  ctx.fillStyle = '#333333'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (lines.length === 1) {
    ctx.fillText(label, x, y)
  } else {
    const totalHeight = lines.length * lineHeight
    const startY = y - totalHeight / 2 + lineHeight / 2
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, startY + i * lineHeight)
    }
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function drawEdge(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  style: TreeStyle['edge']
) {
  const { color, width, arrowSize } = style

  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.beginPath()

  switch (style.style) {
    case 'curve':
      ctx.moveTo(x1, y1)
      const cpY = (y1 + y2) / 2
      ctx.bezierCurveTo(x1, cpY, x2, cpY, x2, y2)
      break

    case 'straight-arrow':
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      // Draw arrow head
      const angle = Math.atan2(y2 - y1, x2 - x1)
      ctx.moveTo(x2, y2)
      ctx.lineTo(
        x2 - arrowSize * Math.cos(angle - Math.PI / 6),
        y2 - arrowSize * Math.sin(angle - Math.PI / 6)
      )
      ctx.moveTo(x2, y2)
      ctx.lineTo(
        x2 - arrowSize * Math.cos(angle + Math.PI / 6),
        y2 - arrowSize * Math.sin(angle + Math.PI / 6)
      )
      break

    case 'org-chart':
      // Horizontal bus style: down, across, down
      // Place horizontal bar at midpoint between parent bottom and child top
      const midY = (y1 + y2) / 2
      ctx.moveTo(x1, y1)
      ctx.lineTo(x1, midY)
      ctx.lineTo(x2, midY)
      ctx.lineTo(x2, y2)
      break
  }

  ctx.stroke()
}

/**
 * Draw a highlight behind an edge (for hover effect)
 */
function drawEdgeHighlight(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  style: TreeStyle['edge']
) {
  ctx.save()
  ctx.strokeStyle = 'rgba(100, 150, 255, 0.8)'
  ctx.lineWidth = style.width + 4
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.beginPath()

  switch (style.style) {
    case 'curve':
      ctx.moveTo(x1, y1)
      const cpY = (y1 + y2) / 2
      ctx.bezierCurveTo(x1, cpY, x2, cpY, x2, y2)
      break

    case 'straight-arrow':
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      break

    case 'org-chart':
      const midY = (y1 + y2) / 2
      ctx.moveTo(x1, y1)
      ctx.lineTo(x1, midY)
      ctx.lineTo(x2, midY)
      ctx.lineTo(x2, y2)
      break
  }

  ctx.stroke()
  ctx.restore()
}

// Mouse event handlers for pan, hover, and click
function handleMouseDown(e: MouseEvent) {
  if (e.button === 0) { // Left click
    isPanning.value = true
    lastMousePos.value = { x: e.clientX, y: e.clientY }
    mouseDownPos.value = { x: e.clientX, y: e.clientY }
  }
}

function handleMouseMove(e: MouseEvent) {
  if (isPanning.value) {
    isInteracting = true
    const dx = e.clientX - lastMousePos.value.x
    const dy = e.clientY - lastMousePos.value.y
    applyPanDelta(dx, dy)
    lastMousePos.value = { x: e.clientX, y: e.clientY }
    draw()
  } else if (debugMode.value) {
    // Not panning - do hover hit testing
    updateHover(e)
  }
}

function handleMouseUp(e: MouseEvent) {
  if (isPanning.value) {
    // Check if this was a click (minimal movement) vs a drag
    const dx = e.clientX - mouseDownPos.value.x
    const dy = e.clientY - mouseDownPos.value.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance < 5 && debugMode.value) {
      // This was a click - do hit testing
      handleClick(e)
    } else if (distance >= 5) {
      // User actually dragged - mark as interacted
      markUserInteraction()
    }
  }
  isPanning.value = false
  isInteracting = false
}

function handleMouseLeave() {
  isPanning.value = false
  isInteracting = false
  if (hoverTarget.value) {
    hoverTarget.value = null
    draw()
  }
}

/**
 * Update hover state based on mouse position
 */
function updateHover(e: MouseEvent) {
  if (!currentLayoutRoot || !canvasRef.value) {
    if (hoverTarget.value) {
      hoverTarget.value = null
      draw()
    }
    return
  }

  const { treeX, treeY } = screenToTreeCoords(e)

  // Check for node hover
  const hitNode = findNodeAtPoint(currentLayoutRoot, treeX, treeY)
  if (hitNode) {
    const newTarget: HoverTarget = { type: 'node', nodeId: hitNode.id }
    if (!hoverTarget.value || hoverTarget.value.type !== 'node' || hoverTarget.value.nodeId !== hitNode.id) {
      hoverTarget.value = newTarget
      updateCursor('pointer')
      draw()
    }
    return
  }

  // Check for edge hover
  const hitEdge = findEdgeAtPoint(currentLayoutRoot, treeX, treeY, props.styleConfig.edge.style)
  if (hitEdge) {
    const newTarget: HoverTarget = { type: 'edge', ...hitEdge }
    if (!hoverTarget.value || hoverTarget.value.type !== 'edge' ||
        hoverTarget.value.parentId !== hitEdge.parentId ||
        hoverTarget.value.childIndex !== hitEdge.childIndex) {
      hoverTarget.value = newTarget
      updateCursor('pointer')
      draw()
    }
    return
  }

  // Nothing hovered
  if (hoverTarget.value) {
    hoverTarget.value = null
    updateCursor('grab')
    draw()
  }
}

/**
 * Convert screen coordinates to tree coordinates
 */
function screenToTreeCoords(e: MouseEvent): { treeX: number; treeY: number } {
  const canvas = canvasRef.value!
  const rect = canvas.getBoundingClientRect()

  // horizontalGap is used for both left and top canvas margins
  const { horizontalGap } = props.styleConfig.layout
  const panOffset = getPanOffset()
  const zoom = getZoom()

  const canvasX = (e.clientX - rect.left) * (canvas.width / rect.width)
  const canvasY = (e.clientY - rect.top) * (canvas.height / rect.height)

  // Reverse the transformation: canvas coords -> tree coords
  // Forward transform was: ctx.translate(horizontalGap + panOffset.x, horizontalGap + panOffset.y) then scale
  const treeX = (canvasX - horizontalGap - panOffset.x) / zoom - currentOffsetX
  const treeY = (canvasY - horizontalGap - panOffset.y) / zoom - currentOffsetY

  return { treeX, treeY }
}

/**
 * Update cursor style
 */
function updateCursor(cursor: 'grab' | 'pointer') {
  if (containerRef.value) {
    containerRef.value.style.cursor = cursor
  }
}

/**
 * Handle click for node/edge selection in debug mode
 */
function handleClick(e: MouseEvent) {
  if (!currentLayoutRoot || !canvasRef.value) return

  const { treeX, treeY } = screenToTreeCoords(e)

  // First check for node hits
  const hitNode = findNodeAtPoint(currentLayoutRoot, treeX, treeY)
  if (hitNode) {
    selectNode(hitNode.id)
    draw()
    return
  }

  // Then check for edge hits
  const hitEdge = findEdgeAtPoint(currentLayoutRoot, treeX, treeY, props.styleConfig.edge.style)
  if (hitEdge) {
    selectEdge(hitEdge.parentId, hitEdge.childId, hitEdge.childIndex)
    draw()
    return
  }
}

/**
 * Find a node at the given point (in tree coordinates)
 */
function findNodeAtPoint(node: LayoutNode, x: number, y: number): LayoutNode | null {
  // Check if point is inside this node's bounding box
  const halfW = node.width / 2
  const halfH = node.height / 2
  if (x >= node.x - halfW && x <= node.x + halfW &&
      y >= node.y - halfH && y <= node.y + halfH) {
    return node
  }

  // Check children (in reverse order so topmost nodes are checked first)
  for (let i = node.children.length - 1; i >= 0; i--) {
    const found = findNodeAtPoint(node.children[i], x, y)
    if (found) return found
  }

  return null
}

/**
 * Find an edge at the given point (in tree coordinates)
 */
function findEdgeAtPoint(
  node: LayoutNode,
  x: number,
  y: number,
  edgeStyle: 'curve' | 'straight-arrow' | 'org-chart'
): { parentId: string; childId: string; childIndex: number } | null {
  // Check edges from this node to its children
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]

    const parentY = node.y + node.height / 2
    const childY = child.y - child.height / 2

    // Check if y is in the vertical range of the edge
    if (y >= parentY - EDGE_HIT_THRESHOLD && y <= childY + EDGE_HIT_THRESHOLD) {
      let hit = false

      switch (edgeStyle) {
        case 'org-chart': {
          // For org-chart: only check the vertical segment below the horizontal bar
          // (as per user's suggestion - more meaningful interaction)
          const barY = (parentY + childY) / 2

          // Check vertical segment from bar to child only
          if (Math.abs(x - child.x) < EDGE_HIT_THRESHOLD && y >= barY && y <= childY) {
            hit = true
          }
          break
        }

        case 'straight-arrow': {
          // Check distance to line segment
          const dist = distanceToLineSegment(x, y, node.x, parentY, child.x, childY)
          if (dist < EDGE_HIT_THRESHOLD) {
            hit = true
          }
          break
        }

        case 'curve': {
          // Check distance to bezier curve (approximate with samples)
          const dist = distanceToBezier(x, y, node.x, parentY, child.x, childY)
          if (dist < EDGE_HIT_THRESHOLD) {
            hit = true
          }
          break
        }
      }

      if (hit) {
        return { parentId: node.id, childId: child.id, childIndex: i }
      }
    }
  }

  // Recursively check children
  for (const child of node.children) {
    const found = findEdgeAtPoint(child, x, y, edgeStyle)
    if (found) return found
  }

  return null
}

/**
 * Calculate distance from point to line segment
 */
function distanceToLineSegment(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSq = dx * dx + dy * dy

  if (lengthSq === 0) {
    // Line segment is a point
    return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
  }

  // Project point onto line, clamped to segment
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq))
  const projX = x1 + t * dx
  const projY = y1 + t * dy

  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2)
}

/**
 * Calculate approximate distance from point to bezier curve
 * Uses sampling along the curve
 */
function distanceToBezier(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number
): number {
  // Control points for the bezier (same as in drawEdge)
  const cpY = (y1 + y2) / 2

  let minDist = Infinity
  const samples = 20

  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    // Cubic bezier formula: B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
    // Our bezier: P0=(x1,y1), P1=(x1,cpY), P2=(x2,cpY), P3=(x2,y2)
    const mt = 1 - t
    const mt2 = mt * mt
    const mt3 = mt2 * mt
    const t2 = t * t
    const t3 = t2 * t

    const bx = mt3 * x1 + 3 * mt2 * t * x1 + 3 * mt * t2 * x2 + t3 * x2
    const by = mt3 * y1 + 3 * mt2 * t * cpY + 3 * mt * t2 * cpY + t3 * y2

    const dist = Math.sqrt((px - bx) ** 2 + (py - by) ** 2)
    minDist = Math.min(minDist, dist)
  }

  return minDist
}

/**
 * Zoom toward a specific point on the canvas.
 * The point (focalX, focalY) in canvas coordinates stays fixed on screen.
 * If zoom is clamped at min/max, pan is not adjusted to prevent content flying away.
 */
function zoomToPoint(focalCanvasX: number, focalCanvasY: number, zoomFactor: number) {
  const { horizontalGap } = props.styleConfig.layout
  const panOffset = getPanOffset()
  const oldZoom = getZoom()
  const rawNewZoom = oldZoom * zoomFactor

  // Clamp zoom to valid range (same logic as setZoom)
  const MIN_ZOOM = 0.25
  const MAX_ZOOM = 4.0
  const clampedNewZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rawNewZoom))

  // If zoom didn't actually change (clamped at limit), don't adjust anything
  if (Math.abs(clampedNewZoom - oldZoom) < 0.001) {
    return
  }

  // Calculate actual zoom factor after clamping
  const actualZoomFactor = clampedNewZoom / oldZoom

  // Distance from the transformation origin to the focal point
  const dx = focalCanvasX - horizontalGap - panOffset.x
  const dy = focalCanvasY - horizontalGap - panOffset.y

  // Adjust pan so the focal point stays at the same screen position
  // Formula: newPan = oldPan + distance * (1 - actualZoomFactor)
  const newPanX = panOffset.x + dx * (1 - actualZoomFactor)
  const newPanY = panOffset.y + dy * (1 - actualZoomFactor)

  isInteracting = true
  setZoom(clampedNewZoom)
  setPanOffset(newPanX, newPanY)
  markUserInteraction()
  isInteracting = false
  draw()
}

function handleWheel(e: WheelEvent) {
  e.preventDefault()
  const canvas = canvasRef.value
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1

  // Get cursor position in canvas coordinates (accounting for CSS scaling)
  const canvasX = (e.clientX - rect.left) * (canvas.width / rect.width)
  const canvasY = (e.clientY - rect.top) * (canvas.height / rect.height)

  zoomToPoint(canvasX, canvasY, zoomFactor)
}

/**
 * Get the tree's bounding box center in canvas coordinates.
 * Returns null if no tree is loaded.
 */
function getTreeCenterInCanvasCoords(): { x: number; y: number } | null {
  if (!currentLayoutRoot) return null

  // Calculate tree bounding box
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity

  function calcBounds(node: LayoutNode) {
    const halfW = node.width / 2
    const halfH = node.height / 2
    minX = Math.min(minX, node.x - halfW)
    maxX = Math.max(maxX, node.x + halfW)
    minY = Math.min(minY, node.y - halfH)
    maxY = Math.max(maxY, node.y + halfH)
    node.children.forEach(calcBounds)
  }
  calcBounds(currentLayoutRoot)

  // Tree center in tree coordinates (before offset)
  const treeCenterX = (minX + maxX) / 2
  const treeCenterY = (minY + maxY) / 2

  // Convert to canvas coordinates
  const { horizontalGap } = props.styleConfig.layout
  const panOffset = getPanOffset()
  const zoom = getZoom()

  return {
    x: horizontalGap + panOffset.x + (treeCenterX + currentOffsetX) * zoom,
    y: horizontalGap + panOffset.y + (treeCenterY + currentOffsetY) * zoom,
  }
}

/**
 * Button zoom: step to next predefined zoom level, keeping tree center fixed.
 * Using exact values like 25%, 50%, 100%, etc. avoids floating point drift.
 * Zooming toward tree center keeps the content visually stable.
 */
function zoomIn() {
  const currentZoom = getZoom()
  const nextZoom = getNextZoomUp(currentZoom)
  if (nextZoom === currentZoom) return

  const focalPoint = getTreeCenterInCanvasCoords()
  if (focalPoint) {
    zoomToPoint(focalPoint.x, focalPoint.y, nextZoom / currentZoom)
  } else {
    // No tree loaded, just change zoom
    isInteracting = true
    setZoom(nextZoom)
    markUserInteraction()
    isInteracting = false
    draw()
  }
}

function zoomOut() {
  const currentZoom = getZoom()
  const nextZoom = getNextZoomDown(currentZoom)
  if (nextZoom === currentZoom) return

  const focalPoint = getTreeCenterInCanvasCoords()
  if (focalPoint) {
    zoomToPoint(focalPoint.x, focalPoint.y, nextZoom / currentZoom)
  } else {
    // No tree loaded, just change zoom
    isInteracting = true
    setZoom(nextZoom)
    markUserInteraction()
    isInteracting = false
    draw()
  }
}

function resetView() {
  resetCanvasView()
  // Reset tracking variables so next draw uses default positioning
  previousRootScreenX = null
  previousRootScreenY = null
  previousLayoutAlgorithm = null
  draw()
}

// Watch for style changes and redraw
watch(() => props.styleConfig, draw, { deep: true })

// Watch for tree data changes (example switching)
// immediate: true ensures the first example's ID is set on mount
watch(() => props.treeData, (newData) => {
  // Clear selection when switching examples (even if node IDs match, it's a different tree)
  clearSelection()
  hoverTarget.value = null
  // Set the current example ID so view state is loaded/stored for this example
  if (newData?.id) {
    setCurrentExample(newData.id)
  }
  // Reset tracking variables - each example has its own view state
  previousRootScreenX = null
  previousRootScreenY = null
  previousLayoutAlgorithm = null
  draw()
}, { deep: true, immediate: true })
watch(() => debugMode.value, draw)
watch(() => selection.value, draw, { deep: true })

// ResizeObserver for reliable initial sizing
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  // Use ResizeObserver for reliable detection of when container has actual dimensions
  // This is more robust than requestAnimationFrame because flexbox layout may not be
  // complete on the first animation frame
  if (containerRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          resizeCanvas()
        }
      }
    })
    resizeObserver.observe(containerRef.value)

    // Add wheel listener with { passive: false } to allow preventDefault()
    // Vue's @wheel directive uses passive listeners by default for performance,
    // but we need to prevent default to implement custom zoom behavior
    containerRef.value.addEventListener('wheel', handleWheel, { passive: false })
  }
  window.addEventListener('resize', resizeCanvas)
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeCanvas)
  containerRef.value?.removeEventListener('wheel', handleWheel)
  resizeObserver?.disconnect()
})
</script>

<template>
  <div
    ref="containerRef"
    class="tree-canvas-container"
    @mousedown="handleMouseDown"
    @mousemove="handleMouseMove"
    @mouseup="handleMouseUp"
    @mouseleave="handleMouseLeave"
  >
    <canvas
      ref="canvasRef"
      class="tree-view-canvas"
    />

    <!-- Zoom controls overlay -->
    <div class="zoom-controls">
      <v-btn-group
        density="compact"
        variant="outlined"
      >
        <v-btn
          size="small"
          @click="zoomIn"
        >
          <v-icon :icon="mdiPlus" />
        </v-btn>
        <v-btn
          size="small"
          @click="resetView"
        >
          <span class="text-caption">{{ Math.round(zoom * 100) }}%</span>
        </v-btn>
        <v-btn
          size="small"
          @click="zoomOut"
        >
          <v-icon :icon="mdiMinus" />
        </v-btn>
      </v-btn-group>
    </div>

    <!-- Help text -->
    <div class="canvas-help">
      Drag to pan | Scroll to zoom
    </div>
  </div>
</template>

<style scoped>
.tree-canvas-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  cursor: grab;
  overflow: hidden;
}

.tree-canvas-container:active {
  cursor: grabbing;
}

.tree-view-canvas {
  display: block;
}

.zoom-controls {
  position: absolute;
  bottom: 16px;
  right: 16px;
  background: rgb(var(--v-theme-surface));
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.canvas-help {
  position: absolute;
  bottom: 16px;
  left: 16px;
  font-size: 0.75rem;
  color: rgba(128, 128, 128, 0.8);
  background: rgb(var(--v-theme-surface));
  padding: 4px 8px;
  border-radius: 4px;
}
</style>
