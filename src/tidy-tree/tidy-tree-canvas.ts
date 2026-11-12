/**
 * tidy-tree-canvas.ts — optional canvas renderer for tidy-tree.ts.
 *
 * Plain DOM and Canvas 2D, no framework. Depends only on ./tidy-tree
 * (imported with a .js extension so the compiled file runs in a browser
 * as it is; bundlers and TypeScript resolve it to the .ts source).
 * One call measures labels, lays the tree out and paints it:
 *
 *   renderTree(document.getElementById('panel'), data)   // makes its own canvas
 *   renderTree(canvasElement, data)                      // takes over a canvas
 *   renderTree(ctx, data, { rect: { x, y, width, height } })  // guest in yours
 *
 * Given an element or a canvas it owns the canvas: it sizes the backing
 * store for the device pixel ratio, clears it, and redraws when the element
 * resizes. Pass a dedicated element: if it has a height the canvas covers it
 * (and the element is made `position: relative` if it was static); if it has
 * none, the canvas takes the height the tree needs.
 *
 * Given a 2D context it is a guest: it never resizes or clears the canvas,
 * draws only inside `rect`, and leaves the context state as it found it, so
 * it can share a canvas with whatever else you draw.
 */

import { linkTo, nodeAt, tidyTree } from './tidy-tree.js'
import type { TidyNode, TidySize, TidyTree, TidyTreeOptions } from './tidy-tree.js'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type TreeEdgeStyle = 'elbow' | 'curve' | 'straight'

export interface TreeCanvasStyle {
  /** CSS font shorthand used for labels. */
  font: string
  /** Distance between the baselines of a multi-line label. */
  lineHeight: number
  /** Space between a label and the edge of its box. */
  paddingX: number
  paddingY: number
  textColor: string
  nodeFill: string
  nodeStroke: string
  nodeStrokeWidth: number
  /** Corner radius of node boxes. */
  nodeRadius: number
  edgeStyle: TreeEdgeStyle
  edgeColor: string
  edgeWidth: number
  /** Painted behind the tree; null leaves what is already there. */
  background: string | null
}

export const defaultTreeCanvasStyle: TreeCanvasStyle = {
  font: '13px system-ui, -apple-system, "Segoe UI", sans-serif',
  lineHeight: 18,
  paddingX: 12,
  paddingY: 8,
  textColor: '#0f172a',
  nodeFill: '#ffffff',
  nodeStroke: '#475569',
  nodeStrokeWidth: 1.5,
  nodeRadius: 6,
  edgeStyle: 'elbow',
  edgeColor: '#94a3b8',
  edgeWidth: 1.5,
  background: null,
}

export interface TreeRect {
  x: number
  y: number
  width: number
  height: number
}

/** Maps layout coordinates to canvas coordinates: `canvas = layout * scale + (x, y)`. */
export interface TreeTransform {
  scale: number
  x: number
  y: number
}

export interface TreeDrawOptions<T> {
  /** Text shown in a node. Default: `data.label`, `data.name`, `data.title` or `data.id`. */
  label?: (data: T) => string
  style?: Partial<TreeCanvasStyle>
  /**
   * Where to draw, in the context's current coordinates (CSS pixels when
   * tidy-tree owns the canvas). Default: the whole canvas.
   */
  rect?: TreeRect
  /** Space kept free inside `rect`. Default 16. */
  margin?: number
  /**
   * 'scale-down' (default) shrinks the tree to fit but never enlarges it,
   * 'contain' also enlarges it to fill the rect, 'none' draws at 1:1.
   */
  fit?: 'scale-down' | 'contain' | 'none'
  /**
   * Replaces the built-in node painting. Called in layout coordinates, so
   * draw at `node.x`, `node.y` with `node.width` × `node.height`.
   */
  drawNode?: (ctx: CanvasRenderingContext2D, node: TidyNode<T>, style: TreeCanvasStyle) => void
}

export interface TreeCanvasOptions<T> extends TreeDrawOptions<T>, TidyTreeOptions<T> {
  /** Called on click when tidy-tree owns the canvas; `node` is null for empty space. */
  onNodeClick?: (node: TidyNode<T> | null, event: MouseEvent) => void
  /** Redraw when the owned canvas or its container resizes. Default true. */
  autoResize?: boolean
  /**
   * Only when the target is a container element: 'fill' makes the canvas
   * cover the element, 'auto' makes it as tall as the tree needs. Default:
   * 'auto' if the element has no height of its own, otherwise 'fill'.
   */
  height?: 'fill' | 'auto'
}

export interface TreeView<T> {
  /** The canvas being drawn on. */
  readonly canvas: HTMLCanvasElement
  /** The current layout. */
  readonly tree: TidyTree<T>
  /** The transform used by the last draw. */
  readonly transform: TreeTransform
  /** Lay out and draw again, optionally with new data and/or changed options. */
  update(data?: T, options?: TreeCanvasOptions<T>): void
  /** Draw again without laying out, e.g. after you have repainted a shared canvas. */
  draw(): void
  /** The node under a canvas position such as `event.offsetX`, `event.offsetY`. */
  nodeAt(x: number, y: number): TidyNode<T> | null
  /** Stop observing and listening; removes the canvas if tidy-tree created it. */
  destroy(): void
}

export type TreeTarget = HTMLElement | HTMLCanvasElement | CanvasRenderingContext2D

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

function defaultLabel(data: unknown): string {
  if (data === null || typeof data !== 'object') return data === null || data === undefined ? '' : String(data)
  const d = data as Record<string, unknown>
  const value = d.label ?? d.name ?? d.title ?? d.id
  return value === null || value === undefined ? '' : String(value)
}

/**
 * Size of the box needed for a label, using the context's current font.
 * Labels may contain line breaks.
 */
export function measureLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  style: Partial<TreeCanvasStyle> = {}
): TidySize {
  const s = { ...defaultTreeCanvasStyle, ...style }
  const lines = text.split('\n')
  let widest = 0
  for (const line of lines) widest = Math.max(widest, ctx.measureText(line).width)
  return {
    width: Math.ceil(widest + s.paddingX * 2),
    height: Math.ceil(lines.length * s.lineHeight + s.paddingY * 2),
  }
}

// ---------------------------------------------------------------------------
// Drawing an existing layout
// ---------------------------------------------------------------------------

function visibleRect(ctx: CanvasRenderingContext2D): TreeRect {
  const canvas = ctx.canvas
  const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null
  // Undo an axis-aligned transform (the usual device-pixel-ratio scale) so
  // the default rect is the whole canvas in the caller's own units.
  if (m && m.a > 0 && m.d > 0 && m.b === 0 && m.c === 0) {
    return { x: (0 - m.e) / m.a, y: (0 - m.f) / m.d, width: canvas.width / m.a, height: canvas.height / m.d }
  }
  return { x: 0, y: 0, width: canvas.width, height: canvas.height }
}

function fitTransform(
  tree: { width: number; height: number },
  rect: TreeRect,
  margin: number,
  fit: 'scale-down' | 'contain' | 'none'
): TreeTransform {
  let scale = 1
  if (fit !== 'none') {
    const sx = tree.width > 0 ? (rect.width - margin * 2) / tree.width : Infinity
    const sy = tree.height > 0 ? (rect.height - margin * 2) / tree.height : Infinity
    scale = Math.min(sx, sy)
    if (fit === 'scale-down') scale = Math.min(scale, 1)
    if (!(scale > 0 && scale < Infinity)) scale = 1
  }
  return {
    scale,
    x: rect.x + (rect.width - tree.width * scale) / 2,
    y: rect.y + (rect.height - tree.height * scale) / 2,
  }
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function edgePath<T>(
  ctx: CanvasRenderingContext2D,
  node: TidyNode<T>,
  tree: TidyTree<T>,
  edgeStyle: TreeEdgeStyle
): void {
  const link = linkTo(node, tree.direction)
  if (!link) return
  const { x1, y1, x2, y2 } = link
  const vertical = tree.direction === 'down' || tree.direction === 'up'
  const sign = tree.direction === 'down' || tree.direction === 'right' ? 1 : -1
  ctx.moveTo(x1, y1)
  // The band of one level gap in front of the child is clear of other nodes,
  // so all the sideways travel happens there. In a layered tree a short
  // parent ends before the band starts: go straight to the band first.
  if (vertical) {
    const band = y2 - sign * tree.levelGap
    const mid = (band + y2) / 2
    if (Math.abs(band - y1) > 0.01) ctx.lineTo(x1, band)
    if (edgeStyle === 'straight') {
      ctx.lineTo(x2, y2)
    } else if (edgeStyle === 'curve') {
      ctx.bezierCurveTo(x1, mid, x2, mid, x2, y2)
    } else {
      ctx.lineTo(x1, mid)
      ctx.lineTo(x2, mid)
      ctx.lineTo(x2, y2)
    }
  } else {
    const band = x2 - sign * tree.levelGap
    const mid = (band + x2) / 2
    if (Math.abs(band - x1) > 0.01) ctx.lineTo(band, y1)
    if (edgeStyle === 'straight') {
      ctx.lineTo(x2, y2)
    } else if (edgeStyle === 'curve') {
      ctx.bezierCurveTo(mid, y1, mid, y2, x2, y2)
    } else {
      ctx.lineTo(mid, y1)
      ctx.lineTo(mid, y2)
      ctx.lineTo(x2, y2)
    }
  }
}

/**
 * Paint an already laid-out tree into a context, inside `options.rect`.
 * The context's state (transform, clip, styles) is restored afterwards.
 * Returns the transform used, for mapping pointer positions back to nodes.
 */
export function drawTree<T>(
  ctx: CanvasRenderingContext2D,
  tree: TidyTree<T>,
  options: TreeDrawOptions<T> = {}
): TreeTransform {
  const style: TreeCanvasStyle = { ...defaultTreeCanvasStyle, ...options.style }
  const rect = options.rect ?? visibleRect(ctx)
  const transform = fitTransform(tree, rect, options.margin ?? 16, options.fit ?? 'scale-down')
  const label = options.label ?? defaultLabel
  const nodes = tree.nodes

  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.x, rect.y, rect.width, rect.height)
  ctx.clip()
  if (style.background) {
    ctx.fillStyle = style.background
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
  }
  ctx.translate(transform.x, transform.y)
  ctx.scale(transform.scale, transform.scale)

  // Connectors first, in one path, so boxes sit on top of them.
  ctx.beginPath()
  for (let i = 1; i < nodes.length; i++) edgePath(ctx, nodes[i], tree, style.edgeStyle)
  ctx.strokeStyle = style.edgeColor
  ctx.lineWidth = style.edgeWidth
  ctx.lineJoin = 'round'
  ctx.stroke()

  ctx.font = style.font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Labels that would come out smaller than about 3px are just noise.
  const showText = style.lineHeight * transform.scale >= 3
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (options.drawNode) {
      options.drawNode(ctx, node, style)
      continue
    }
    roundedRectPath(ctx, node.x, node.y, node.width, node.height, style.nodeRadius)
    ctx.fillStyle = style.nodeFill
    ctx.fill()
    if (style.nodeStrokeWidth > 0) {
      ctx.strokeStyle = style.nodeStroke
      ctx.lineWidth = style.nodeStrokeWidth
      ctx.stroke()
    }
    if (!showText) continue
    const lines = label(node.data).split('\n')
    ctx.fillStyle = style.textColor
    const cx = node.x + node.width / 2
    const firstLine = node.y + node.height / 2 - ((lines.length - 1) * style.lineHeight) / 2
    for (let l = 0; l < lines.length; l++) ctx.fillText(lines[l], cx, firstLine + l * style.lineHeight)
  }
  ctx.restore()
  return transform
}

// ---------------------------------------------------------------------------
// One-call rendering
// ---------------------------------------------------------------------------

function isContext(target: unknown): target is CanvasRenderingContext2D {
  const t = target as CanvasRenderingContext2D
  return typeof t.fillRect === 'function' && typeof t.measureText === 'function'
}

function isCanvas(target: unknown): target is HTMLCanvasElement {
  return typeof (target as HTMLCanvasElement).getContext === 'function'
}

/**
 * Measure, lay out and draw a tree. See the top of this file for what each
 * kind of target means. Returns a handle for updating, hit-testing and
 * cleaning up.
 */
export function renderTree<T>(target: TreeTarget, data: T, options: TreeCanvasOptions<T> = {}): TreeView<T> {
  let currentData = data
  let currentOptions = options
  let tree!: TidyTree<T>
  let transform: TreeTransform = { scale: 1, x: 0, y: 0 }

  let canvas: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D
  let container: HTMLElement | null = null
  let restorePosition: string | null = null
  // True when the canvas should be as tall as the tree needs rather than
  // fill a given height.
  let autoHeight = false
  const owns = !isContext(target)

  if (isContext(target)) {
    ctx = target
    canvas = target.canvas
  } else {
    if (isCanvas(target)) {
      canvas = target
    } else {
      container = target
      const doc = target.ownerDocument
      // Measured before the canvas goes in, so the canvas cannot be what
      // gives the container its height.
      autoHeight = options.height ? options.height === 'auto' : target.clientHeight === 0
      canvas = doc.createElement('canvas')
      canvas.style.display = 'block'
      canvas.style.width = '100%'
      if (!autoHeight) {
        // Out of flow, so the canvas follows the container's size and never
        // props it open.
        if (doc.defaultView?.getComputedStyle(target).position === 'static') {
          restorePosition = target.style.position
          target.style.position = 'relative'
        }
        canvas.style.position = 'absolute'
        canvas.style.left = '0'
        canvas.style.top = '0'
        canvas.style.height = '100%'
      }
      target.appendChild(canvas)
    }
    const context = canvas.getContext('2d')
    if (!context) throw new Error('tidy-tree: could not get a 2D context from the canvas')
    ctx = context
  }

  const sizeCache = new Map<string, TidySize>()
  let cacheKey = ''

  function layout(): void {
    const style: TreeCanvasStyle = { ...defaultTreeCanvasStyle, ...currentOptions.style }
    const label = currentOptions.label ?? defaultLabel
    const key = `${style.font}|${style.lineHeight}|${style.paddingX}|${style.paddingY}`
    if (key !== cacheKey) {
      sizeCache.clear()
      cacheKey = key
    }
    ctx.save()
    ctx.font = style.font
    const measured = (d: T): TidySize => {
      const text = label(d)
      let size = sizeCache.get(text)
      if (!size) {
        size = measureLabel(ctx, text, style)
        sizeCache.set(text, size)
      }
      return size
    }
    tree = tidyTree(currentData, { ...currentOptions, nodeSize: currentOptions.nodeSize ?? measured })
    ctx.restore()
  }

  let lastWidth = -1
  let lastHeight = -1

  function draw(): void {
    if (!owns) {
      transform = drawTree(ctx, tree, currentOptions)
      return
    }
    let width = canvas.clientWidth
    let height = canvas.clientHeight
    if (autoHeight) {
      const natural = { x: 0, y: 0, width, height: Infinity }
      const scale = fitTransform(tree, natural, currentOptions.margin ?? 16, currentOptions.fit ?? 'scale-down').scale
      height = Math.ceil(tree.height * scale + (currentOptions.margin ?? 16) * 2)
      canvas.style.height = `${height}px`
    }
    let ratio = 1
    if (width > 0 && height > 0) {
      ratio = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1
      const w = Math.round(width * ratio)
      const h = Math.round(height * ratio)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        // A canvas with no CSS size is displayed at its attribute size, so
        // it would have just grown. Pin it to the size it had.
        if (canvas.clientWidth !== width || (!autoHeight && canvas.clientHeight !== height)) {
          canvas.style.width = `${width}px`
          canvas.style.height = `${height}px`
        }
      }
    } else {
      // Not in a laid-out document: treat the attribute size as CSS pixels.
      width = canvas.width
      height = canvas.height
    }
    lastWidth = width
    lastHeight = height
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, width, height)
    transform = drawTree(ctx, tree, { ...currentOptions, rect: currentOptions.rect ?? { x: 0, y: 0, width, height } })
  }

  function onClick(event: MouseEvent): void {
    currentOptions.onNodeClick?.(view.nodeAt(event.offsetX, event.offsetY), event)
  }

  let observer: ResizeObserver | null = null
  if (owns) {
    canvas.addEventListener('click', onClick)
    if (options.autoResize !== false && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        // Our own height changes in auto-height mode must not retrigger.
        const widthChanged = canvas.clientWidth !== lastWidth
        const heightChanged = !autoHeight && canvas.clientHeight !== lastHeight
        if (widthChanged || heightChanged) draw()
      })
      observer.observe(canvas)
    }
  }

  const view: TreeView<T> = {
    get canvas() {
      return canvas
    },
    get tree() {
      return tree
    },
    get transform() {
      return transform
    },
    update(newData?: T, newOptions?: TreeCanvasOptions<T>) {
      if (newData !== undefined) currentData = newData
      if (newOptions) currentOptions = { ...currentOptions, ...newOptions }
      layout()
      draw()
    },
    draw,
    nodeAt(x: number, y: number) {
      return nodeAt(tree, (x - transform.x) / transform.scale, (y - transform.y) / transform.scale)
    },
    destroy() {
      observer?.disconnect()
      observer = null
      if (owns) canvas.removeEventListener('click', onClick)
      if (container) {
        if (canvas.parentNode === container) container.removeChild(canvas)
        if (restorePosition !== null) container.style.position = restorePosition
      }
    },
  }

  layout()
  draw()
  return view
}
