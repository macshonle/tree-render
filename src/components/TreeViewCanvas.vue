<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { mdiPlus, mdiMinus } from '@mdi/js'
import type { TreeStyle, TreeExample, TreeNode } from '@/types'

const props = defineProps<{
  styleConfig: TreeStyle
  treeData?: TreeExample | null
}>()

// Layout node with calculated positions
interface LayoutNode {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  children: LayoutNode[]
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

// Pan and zoom state
const panOffset = ref({ x: 0, y: 0 })
const zoom = ref(1)
const isPanning = ref(false)
const lastMousePos = ref({ x: 0, y: 0 })

// Measure text dimensions (supports multi-line)
function measureText(
  ctx: CanvasRenderingContext2D,
  label: string,
  padding: number
): { width: number; height: number; lines: string[] } {
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
}

// Calculate node dimensions based on sizing mode
function calculateNodeSize(
  ctx: CanvasRenderingContext2D,
  label: string,
  treeData: TreeExample,
  padding: number
): { width: number; height: number; lines: string[] } {
  if (treeData.sizingMode === 'fixed' && treeData.nodeWidth && treeData.nodeHeight) {
    return {
      width: treeData.nodeWidth,
      height: treeData.nodeHeight,
      lines: label.split('\n'),
    }
  }
  // fit-content mode
  return measureText(ctx, label, padding)
}

// Calculate layout for the tree using maxwidth algorithm
function layoutTree(
  ctx: CanvasRenderingContext2D,
  root: TreeNode,
  treeData: TreeExample,
  layout: TreeStyle['layout'],
  padding: number
): LayoutNode {
  const { horizontalGap, verticalGap } = layout

  // First pass: calculate sizes for all nodes
  function calculateSizes(node: TreeNode): LayoutNode {
    const size = calculateNodeSize(ctx, node.label, treeData, padding)
    const layoutNode: LayoutNode = {
      id: node.id,
      label: node.label,
      x: 0,
      y: 0,
      width: size.width,
      height: size.height,
      children: node.children?.map(calculateSizes) ?? [],
    }
    return layoutNode
  }

  const layoutRoot = calculateSizes(root)

  // Calculate subtree widths
  function calcSubtreeWidth(node: LayoutNode): number {
    if (node.children.length === 0) {
      return node.width
    }
    let childrenWidth = 0
    for (const child of node.children) {
      childrenWidth += calcSubtreeWidth(child)
    }
    childrenWidth += (node.children.length - 1) * horizontalGap
    return Math.max(node.width, childrenWidth)
  }

  // Position nodes
  function positionNodes(node: LayoutNode, x: number, y: number) {
    node.x = x
    node.y = y

    if (node.children.length === 0) return

    const subtreeWidth = calcSubtreeWidth(node)
    let childX = x - subtreeWidth / 2

    for (const child of node.children) {
      const childSubtreeWidth = calcSubtreeWidth(child)
      const childCenterX = childX + childSubtreeWidth / 2
      positionNodes(child, childCenterX, y + node.height + verticalGap)
      childX += childSubtreeWidth + horizontalGap
    }
  }

  const totalWidth = calcSubtreeWidth(layoutRoot)
  positionNodes(layoutRoot, totalWidth / 2, 0)

  return layoutRoot
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

  const { node: nodeStyle, edge: edgeStyle, layout } = props.styleConfig

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

  // Calculate tree layout
  const layoutRoot = layoutTree(ctx, props.treeData.root, props.treeData, layout, nodeStyle.padding)

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

  // Apply transformations
  ctx.save()
  ctx.translate(canvas.width / 2 + panOffset.value.x, offsetY + panOffset.value.y)
  ctx.scale(zoom.value, zoom.value)

  // Draw edges recursively
  function drawEdges(node: LayoutNode) {
    for (const child of node.children) {
      const parentBottom = node.y + node.height / 2
      const childTop = child.y - child.height / 2
      drawEdge(ctx!, node.x + offsetX, parentBottom, child.x + offsetX, childTop, edgeStyle, layout)
      drawEdges(child)
    }
  }
  drawEdges(layoutRoot)

  // Draw nodes recursively
  function drawNodes(node: LayoutNode) {
    drawNode(ctx!, node.x + offsetX, node.y, node.label, nodeStyle, node.width, node.height)
    node.children.forEach(drawNodes)
  }
  drawNodes(layoutRoot)

  ctx.restore()
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
      const circleRadius = Math.max(boxWidth, boxHeight) / 2
      ctx.beginPath()
      ctx.arc(x, y, circleRadius, 0, Math.PI * 2)
      ctx.fill()
      if (strokeWidth > 0) ctx.stroke()
      break

    case 'ellipse':
      ctx.beginPath()
      ctx.ellipse(x, y, boxWidth / 2 + 4, boxHeight / 2 + 2, 0, 0, Math.PI * 2)
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
  style: TreeStyle['edge'],
  layout: TreeStyle['layout']
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
      const midY = y1 + layout.lineSpacing
      ctx.moveTo(x1, y1)
      ctx.lineTo(x1, midY)
      ctx.lineTo(x2, midY)
      ctx.lineTo(x2, y2)
      break
  }

  ctx.stroke()
}

// Mouse event handlers for pan
function handleMouseDown(e: MouseEvent) {
  if (e.button === 0) { // Left click
    isPanning.value = true
    lastMousePos.value = { x: e.clientX, y: e.clientY }
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
  }
}

function handleMouseUp() {
  isPanning.value = false
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

// Watch for style and tree data changes and redraw
watch(() => props.styleConfig, draw, { deep: true })
watch(() => props.treeData, draw, { deep: true })

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
  }
  window.addEventListener('resize', resizeCanvas)
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeCanvas)
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
    @mouseleave="handleMouseUp"
    @wheel="handleWheel"
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
