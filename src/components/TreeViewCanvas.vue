<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { mdiPlus, mdiMinus } from '@mdi/js'
import type { TreeStyle, TreeExample, LayoutNode, YMonotonePolygon, ContourPoint } from '@/types'
import { layoutTree, createCanvasTextMeasurer } from '@/layout'
import { useDebugMode } from '@/composables/useDebugMode'

const props = defineProps<{
  styleConfig: TreeStyle
  treeData?: TreeExample | null
}>()

const { debugMode, selection, selectNode, selectEdge, clearSelection } = useDebugMode()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

// Pan and zoom state
const panOffset = ref({ x: 0, y: 0 })
const zoom = ref(1)
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
let currentOffsetY = 50

// Edge hit detection threshold (in canvas pixels before zoom)
const EDGE_HIT_THRESHOLD = 10

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

  // Calculate tree bounds for centering
  let minX = Infinity, maxX = -Infinity, maxY = -Infinity
  function calcBounds(node: LayoutNode) {
    minX = Math.min(minX, node.x - node.width / 2)
    maxX = Math.max(maxX, node.x + node.width / 2)
    maxY = Math.max(maxY, node.y + node.height)
    node.children.forEach(calcBounds)
  }
  calcBounds(layoutRoot)

  const treeWidth = maxX - minX
  const offsetX = -minX - treeWidth / 2
  const offsetY = 50

  // Store for hit testing
  currentLayoutRoot = layoutRoot
  currentOffsetX = offsetX
  currentOffsetY = offsetY

  // Apply transformations
  ctx.save()
  ctx.translate(canvas.width / 2 + panOffset.value.x, offsetY + panOffset.value.y)
  ctx.scale(zoom.value, zoom.value)

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
      const parentBottom = node.y + node.height / 2 + parentOffset

      // Calculate child endpoints
      const childEndpoints = node.children.map(child => {
        const childOffset = getShapeVerticalOffset(child.width, child.height)
        return {
          x: child.x + offsetX,
          y: child.y - child.height / 2 - childOffset
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
      ctx!.roundRect(node.x + offsetX - halfW, node.y - halfH, halfW * 2, halfH * 2, 6)
      ctx!.fill()
      ctx!.stroke()
      ctx!.restore()
    }

    drawNode(ctx!, node.x + offsetX, node.y, node.label, nodeStyle, node.width, node.height)
  }
  drawSubtree(layoutRoot)

  // Draw contours if debug mode is enabled and something is selected
  if (debugMode.value && selection.value) {
    drawDebugContours(ctx!, layoutRoot, offsetX, selection.value)
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
  sel: { type: 'node'; nodeId: string } | { type: 'edge'; parentId: string; childId: string; childIndex: number }
) {
  if (sel.type === 'node') {
    // Find the node and draw its contour
    const node = findNodeById(root, sel.nodeId)
    if (node?.polygonContour) {
      drawPolygonContour(ctx, node.polygonContour, node.x + offsetX, node.y, 'left', 'rgba(0, 180, 0, 0.9)')
      drawPolygonContour(ctx, node.polygonContour, node.x + offsetX, node.y, 'right', 'rgba(220, 0, 0, 0.9)')
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
        drawPolygonContour(ctx, leftChild.polygonContour, leftChild.x + offsetX, leftChild.y, 'right', 'rgba(220, 0, 0, 0.9)')
      }
    } else if (childIndex === 0) {
      // No immediate left sibling - find ancestor's left sibling
      const ancestorLeftSibling = findAncestorLeftSibling(root, sel.parentId)
      if (ancestorLeftSibling?.polygonContour) {
        drawPolygonContour(ctx, ancestorLeftSibling.polygonContour, ancestorLeftSibling.x + offsetX, ancestorLeftSibling.y, 'right', 'rgba(220, 0, 0, 0.9)')
      }
    }

    // Right boundary (green): the selected child's left contour
    if (childIndex < children.length) {
      const rightChild = children[childIndex]
      if (rightChild?.polygonContour) {
        drawPolygonContour(ctx, rightChild.polygonContour, rightChild.x + offsetX, rightChild.y, 'left', 'rgba(0, 180, 0, 0.9)')
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
    const dx = e.clientX - lastMousePos.value.x
    const dy = e.clientY - lastMousePos.value.y
    panOffset.value.x += dx
    panOffset.value.y += dy
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
    }
  }
  isPanning.value = false
}

function handleMouseLeave() {
  isPanning.value = false
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

  const canvasX = (e.clientX - rect.left) * (canvas.width / rect.width)
  const canvasY = (e.clientY - rect.top) * (canvas.height / rect.height)

  const treeX = (canvasX - canvas.width / 2 - panOffset.value.x) / zoom.value - currentOffsetX
  const treeY = (canvasY - currentOffsetY - panOffset.value.y) / zoom.value

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

function handleWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  zoom.value = Math.max(0.25, Math.min(4, zoom.value * delta))
  draw()
}

function resetView() {
  panOffset.value = { x: 0, y: 0 }
  zoom.value = 1
  draw()
}

// Watch for style, tree data, and debug state changes and redraw
watch(() => props.styleConfig, draw, { deep: true })
watch(() => props.treeData, () => {
  // Clear selection when switching examples (even if node IDs match, it's a different tree)
  clearSelection()
  hoverTarget.value = null
  draw()
}, { deep: true })
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
      <v-btn-group density="compact" variant="outlined">
        <v-btn size="small" @click="zoom = Math.min(4, zoom * 1.2); draw()">
          <v-icon :icon="mdiPlus" />
        </v-btn>
        <v-btn size="small" @click="resetView">
          <span class="text-caption">{{ Math.round(zoom * 100) }}%</span>
        </v-btn>
        <v-btn size="small" @click="zoom = Math.max(0.25, zoom * 0.8); draw()">
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
