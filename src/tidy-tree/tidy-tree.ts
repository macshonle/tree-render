/**
 * tidy-tree.ts — tidy tree drawings on a canvas you supply, in one file.
 *
 * No imports and no framework: copy this file into any TypeScript project,
 * or its compiled form into any JavaScript one. It lays out a tree whose
 * nodes can all be different sizes and draws it with the Canvas 2D API.
 *
 *   renderTree(canvas, data)                                  // a canvas of yours
 *   renderTree(ctx, data, { rect: { x, y, width, height } })  // part of a canvas you draw on
 *   renderTree(element, data)                                 // or have it make the canvas
 *
 * Given a canvas, or an element to put one in, it owns the canvas: it sizes
 * the backing store for the device pixel ratio, clears it, and redraws when
 * the element resizes. For an element: if it has a height the canvas covers
 * it (and the element is made `position: relative` if it was static); if it
 * has none, the canvas takes the height the tree needs.
 *
 * Given a 2D context it is a guest: it never resizes or clears the canvas,
 * draws only inside `rect`, and leaves the context state as it found it, so
 * it can share a canvas with whatever else you draw.
 *
 * The first half of the file is the layout alone, which needs no canvas and
 * no DOM. Use it directly to draw with SVG, DOM elements, WebGL or your own
 * canvas code:
 *
 *   const tree = tidyTree(root, { nodeSize: (d) => ({ width: 120, height: 40 }) })
 *   for (const node of tree.nodes) drawBox(node.x, node.y, node.width, node.height)
 *
 * ALGORITHM
 *
 * The core is A. J. van der Ploeg's "Drawing Non-layered Tidy Trees in Linear
 * Time" (Software: Practice and Experience, 2014), the variable-node-size
 * successor to Reingold–Tilford, Walker and Buchheim et al. Each subtree is
 * laid out once and then treated as rigid. Sibling subtrees are pushed
 * together until their facing contours are exactly one gap apart, contours
 * are followed through "threads" so that a subtree is never re-scanned, and
 * moves are recorded as modifiers that a second walk turns into coordinates.
 * Time and memory are O(n) in the number of nodes, and nothing recurses, so
 * very deep trees are fine.
 *
 * On top of that, `symmetric` (on by default) runs the same pass on the
 * mirrored tree and averages the two results. The constraints a valid layout
 * has to satisfy (keep neighbours a gap apart, keep parents centred) are all
 * linear, so the average of two valid layouts is valid too, and it is exactly
 * left/right symmetric: mirroring the input mirrors the drawing.
 *
 * GUARANTEES
 *
 *  - No two nodes overlap. Nodes whose extents along the depth axis come
 *    within `levelGap` of each other are kept at least `nodeGap` apart.
 *  - Because of that margin, the band of height `levelGap` just before a row
 *    of children is clear of every other subtree for the full span of those
 *    children. Connectors routed through that band never cross a foreign
 *    node. (When not `layered` the band starts right at the parent, so any
 *    straight, curved or elbow connector qualifies. When `layered`, a short
 *    parent sits above the band: drop straight down to it first.)
 *  - A parent is centred over the span from its first child's leading edge
 *    to its last child's trailing edge.
 *  - Children keep their order, and identical subtrees are drawn identically
 *    wherever they appear.
 */

// ---------------------------------------------------------------------------
// Layout: public types
// ---------------------------------------------------------------------------

/** Which way the tree grows away from the root. */
export type TidyDirection = 'down' | 'up' | 'right' | 'left'

export interface TidySize {
  width: number
  height: number
}

/** One positioned node. `x`/`y` is the top-left corner of its box. */
export interface TidyNode<T> {
  /** The input object this node was created from. */
  data: T
  parent: TidyNode<T> | null
  children: TidyNode<T>[]
  /** 0 for the root, 1 for its children, and so on. */
  depth: number
  x: number
  y: number
  width: number
  height: number
}

export interface TidyTree<T> {
  root: TidyNode<T>
  /** Every node in breadth-first order; `nodes[0]` is the root. */
  nodes: TidyNode<T>[]
  /** Size of the whole drawing. Node boxes span (0,0)–(width,height). */
  width: number
  height: number
  /** The options the layout was made with, for whoever draws it. */
  direction: TidyDirection
  levelGap: number
  layered: boolean
}

export interface TidyTreeOptions<T> {
  /**
   * Returns a node's children. Default: `data.children`.
   * The input must be a tree: a cycle would never terminate.
   */
  children?: (data: T) => ArrayLike<T> | null | undefined
  /**
   * Size of each node's box, either one fixed size or a function.
   * Default: `data.width` × `data.height`, falling back to 80 × 40.
   */
  nodeSize?: TidySize | ((data: T) => TidySize)
  /** Minimum space between neighbouring nodes across the tree. Default 16. */
  nodeGap?: number
  /** Space between a parent and its children. Default 40. */
  levelGap?: number
  /**
   * Per-pair override of `nodeGap`. Called for nodes that end up facing each
   * other, `a` being the earlier one in sibling order. Must be symmetric in
   * meaning (it is called with the original order in both passes).
   */
  spacing?: (a: TidyNode<T>, b: TidyNode<T>) => number
  /** Growth direction. Default 'down' (root on top). */
  direction?: TidyDirection
  /**
   * When true, all nodes of the same depth start on a common line, as in a
   * classic layered tree. When false (default) children sit one `levelGap`
   * below their own parent, which is more compact when sizes vary.
   */
  layered?: boolean
  /**
   * When true (default) the layout is exactly mirror-symmetric at the cost of
   * a second pass. Turn off for roughly twice the speed on huge trees.
   */
  symmetric?: boolean
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const DEFAULT_WIDTH = 80
const DEFAULT_HEIGHT = 40
const DEFAULT_NODE_GAP = 16
const DEFAULT_LEVEL_GAP = 40

/** Finite and positive, or zero. Keeps bad input from poisoning the layout. */
function clean(value: unknown): number {
  const v = Number(value)
  return v > 0 && v < Infinity ? v : 0
}

function defaultChildren<T>(data: T): ArrayLike<T> | null | undefined {
  return (data as { children?: ArrayLike<T> | null } | null | undefined)?.children
}

function defaultSize(data: unknown): TidySize {
  const d = data as { width?: unknown; height?: unknown } | null | undefined
  return {
    width: typeof d?.width === 'number' ? d.width : DEFAULT_WIDTH,
    height: typeof d?.height === 'number' ? d.height : DEFAULT_HEIGHT,
  }
}

/**
 * Lay out a tree. Returns a new structure of positioned nodes; the input is
 * not modified.
 */
export function tidyTree<T>(rootData: T, options: TidyTreeOptions<T> = {}): TidyTree<T> {
  const getChildren = options.children ?? defaultChildren
  const sizeOption = options.nodeSize
  const getSize: (data: T) => TidySize =
    typeof sizeOption === 'function' ? sizeOption : sizeOption ? () => sizeOption : defaultSize
  const nodeGap = options.nodeGap === undefined ? DEFAULT_NODE_GAP : clean(options.nodeGap)
  const levelGap = options.levelGap === undefined ? DEFAULT_LEVEL_GAP : clean(options.levelGap)
  const spacing = options.spacing
  const direction = options.direction ?? 'down'
  const horizontal = direction === 'right' || direction === 'left'
  const layered = options.layered === true
  const symmetric = options.symmetric !== false

  // --- Build the node list, breadth first -----------------------------------
  // In breadth-first order the children of any node occupy consecutive
  // indices, so the tree structure fits in two integer arrays and no node
  // ever needs its own child-index list.

  const rootNode: TidyNode<T> = makeNode(rootData, null, 0, getSize)
  const nodes: TidyNode<T>[] = [rootNode]
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const kids = getChildren(node.data)
    if (!kids) continue
    for (let k = 0; k < kids.length; k++) {
      const child = makeNode(kids[k], node, node.depth + 1, getSize)
      node.children.push(child)
      nodes.push(child)
    }
  }

  const n = nodes.length
  const first = new Int32Array(n) // index of first child
  const count = new Int32Array(n) // number of children
  // "Breadth" runs across the tree (x for a top-down tree); "depth" runs from
  // the root towards the leaves (y for a top-down tree).
  const breadth = new Float64Array(n)
  const extent = new Float64Array(n) // size along the depth axis
  const top = new Float64Array(n) // start along the depth axis
  const bottom = new Float64Array(n) // end of the space the node claims

  let maxChildren = 0
  for (let i = 0, next = 1; i < n; i++) {
    const node = nodes[i]
    const k = node.children.length
    first[i] = next
    count[i] = k
    next += k
    if (k > maxChildren) maxChildren = k
    breadth[i] = horizontal ? node.height : node.width
    extent[i] = horizontal ? node.width : node.height
  }

  // --- Depth axis -----------------------------------------------------------
  // A node claims [top, bottom) where bottom includes the gap below it. Two
  // nodes need separating exactly when those claims overlap.

  let totalDepth = 0
  if (layered) {
    const levelStart: number[] = [0]
    const levelSize: number[] = []
    for (let i = 0; i < n; i++) {
      const d = nodes[i].depth
      if (!(levelSize[d] >= extent[i])) levelSize[d] = extent[i]
    }
    for (let d = 0; d < levelSize.length; d++) {
      levelStart[d + 1] = levelStart[d] + levelSize[d] + levelGap
    }
    for (let i = 0; i < n; i++) {
      const d = nodes[i].depth
      top[i] = levelStart[d]
      bottom[i] = levelStart[d + 1]
    }
    totalDepth = levelStart[levelSize.length] - levelGap
  } else {
    for (let i = 0; i < n; i++) {
      // Parents precede children, so top[i] is already final here.
      const end = top[i] + extent[i]
      bottom[i] = end + levelGap
      if (end > totalDepth) totalDepth = end
      for (let c = first[i], stop = c + count[i]; c < stop; c++) top[c] = bottom[i]
    }
  }

  // --- Breadth axis ---------------------------------------------------------

  const prelim = new Float64Array(n) // position relative to the parent frame
  const mod = new Float64Array(n) // offset applied to a whole subtree
  const shift = new Float64Array(n) // deferred spreading of in-between siblings
  const change = new Float64Array(n)
  const threadL = new Int32Array(n) // continuation of a left contour, or -1
  const threadR = new Int32Array(n) // continuation of a right contour, or -1
  const extremeL = new Int32Array(n) // deepest node on a subtree's left contour
  const extremeR = new Int32Array(n) // deepest node on a subtree's right contour
  const modSumL = new Float64Array(n) // sum of modifiers down to extremeL
  const modSumR = new Float64Array(n) // sum of modifiers down to extremeR
  // Stack of earlier siblings still visible from the right, deepest at the base.
  const visLow = new Float64Array(maxChildren + 1)
  const visIdx = new Int32Array(maxChildren + 1)

  /**
   * One van der Ploeg pass. `mirrored` lays the children out in reverse
   * order, i.e. it lays out the mirror image of the tree. Writes the leading
   * edge of every node along the breadth axis into `out`.
   */
  function pass(mirrored: boolean, out: Float64Array): void {
    prelim.fill(0)
    mod.fill(0)
    shift.fill(0)
    change.fill(0)
    threadL.fill(-1)
    threadR.fill(-1)
    const step = mirrored ? -1 : 1

    // First walk, children before parents (reverse breadth-first order).
    for (let t = n - 1; t >= 0; t--) {
      const k = count[t]
      if (k === 0) {
        extremeL[t] = extremeR[t] = t
        modSumL[t] = modSumR[t] = 0
        continue
      }
      const c0 = mirrored ? first[t] + k - 1 : first[t]
      let visTop = 0
      visLow[0] = bottom[extremeL[c0]]
      visIdx[0] = 0

      for (let i = 1; i < k; i++) {
        const ci = c0 + i * step
        const prev = ci - step
        // Read before separating: separating may repoint ci's extremes.
        const lowest = bottom[extremeR[ci]]

        // Walk the right contour of the siblings placed so far (sr) and the
        // left contour of the new subtree (cl) in lockstep, pushing the new
        // subtree right wherever the two would be closer than the gap.
        let sr = prev
        let cl = ci
        let sumR = mod[sr]
        let sumL = mod[cl]
        let vis = visTop
        let isRootPair = true
        while (sr !== -1 && cl !== -1) {
          while (vis > 0 && bottom[sr] > visLow[vis]) vis--
          const gap = spacing
            ? clean(mirrored ? spacing(nodes[cl], nodes[sr]) : spacing(nodes[sr], nodes[cl]))
            : nodeGap
          const dist = sumR + prelim[sr] + breadth[sr] + gap - (sumL + prelim[cl])
          // The two subtree roots always face each other, so the first pair
          // sets the baseline even when that means moving left; after that
          // the subtree only ever moves right.
          if (dist > 0 || isRootPair) {
            sumL += dist
            mod[ci] += dist
            modSumL[ci] += dist
            modSumR[ci] += dist
            // If the collision was with a sibling further back than the
            // previous one, spread the siblings in between evenly.
            const si = isRootPair ? i - 1 : visIdx[vis]
            if (si !== i - 1) {
              const parts = i - si
              shift[c0 + (si + 1) * step] += dist / parts
              shift[ci] -= dist / parts
              change[ci] -= dist - dist / parts
            }
          }
          isRootPair = false
          const sy = bottom[sr]
          const cy = bottom[cl]
          if (sy <= cy) {
            sr = count[sr] === 0 ? threadR[sr] : mirrored ? first[sr] : first[sr] + count[sr] - 1
            if (sr !== -1) sumR += mod[sr]
          }
          if (sy >= cy) {
            cl = count[cl] === 0 ? threadL[cl] : mirrored ? first[cl] + count[cl] - 1 : first[cl]
            if (cl !== -1) sumL += mod[cl]
          }
        }

        if (sr === -1 && cl !== -1) {
          // The new subtree is deeper than everything before it: the left
          // contour of the group continues into it. The thread's source gets
          // a modifier that makes modifier sums come out right across the
          // jump, and its prelim is compensated so it does not move.
          const from = extremeL[c0]
          threadL[from] = cl
          const diff = sumL - mod[cl] - modSumL[c0]
          mod[from] += diff
          prelim[from] -= diff
          extremeL[c0] = extremeL[ci]
          modSumL[c0] = modSumL[ci]
        } else if (sr !== -1 && cl === -1) {
          // The earlier siblings are deeper: the right contour continues
          // from the new subtree back into them.
          const from = extremeR[ci]
          threadR[from] = sr
          const diff = sumR - mod[sr] - modSumR[ci]
          mod[from] += diff
          prelim[from] -= diff
          extremeR[ci] = extremeR[prev]
          modSumR[ci] = modSumR[prev]
        }

        // Siblings no deeper than the new subtree are now hidden behind it.
        while (visTop >= 0 && lowest >= visLow[visTop]) visTop--
        visTop++
        visLow[visTop] = lowest
        visIdx[visTop] = i
      }

      // Centre the parent over its first and last child.
      const cLast = c0 + (k - 1) * step
      prelim[t] =
        (prelim[c0] + mod[c0] + mod[cLast] + prelim[cLast] + breadth[cLast]) / 2 - breadth[t] / 2
      extremeL[t] = extremeL[c0]
      modSumL[t] = modSumL[c0]
      extremeR[t] = extremeR[cLast]
      modSumR[t] = modSumR[cLast]
    }

    // Second walk, parents before children: apply the deferred spreading and
    // accumulate modifiers into absolute positions. modSumL is free by now
    // and is reused to carry each node's accumulated modifier.
    const acc = modSumL
    acc[0] = mod[0]
    out[0] = prelim[0] + mod[0]
    for (let t = 0; t < n; t++) {
      const k = count[t]
      if (k === 0) continue
      const c0 = mirrored ? first[t] + k - 1 : first[t]
      let spread = 0
      let delta = 0
      for (let i = 0; i < k; i++) {
        const c = c0 + i * step
        spread += shift[c]
        delta += spread + change[c]
        acc[c] = acc[t] + mod[c] + delta
        out[c] = prelim[c] + acc[c]
      }
    }
  }

  const pos = new Float64Array(n)
  pass(false, pos)
  if (symmetric && maxChildren > 1) {
    // Lay out the mirror image, reflect it back, line the roots up, average.
    const other = new Float64Array(n)
    pass(true, other)
    const a0 = pos[0]
    const b0 = -(other[0] + breadth[0])
    for (let i = 0; i < n; i++) {
      pos[i] = (pos[i] - a0 + (-(other[i] + breadth[i]) - b0)) / 2
    }
  }

  // --- Normalise and map onto x / y -----------------------------------------

  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < n; i++) {
    if (pos[i] < min) min = pos[i]
    if (pos[i] + breadth[i] > max) max = pos[i] + breadth[i]
  }
  const totalBreadth = max - min
  const reversed = direction === 'up' || direction === 'left'
  for (let i = 0; i < n; i++) {
    const node = nodes[i]
    const across = pos[i] - min
    const along = reversed ? totalDepth - top[i] - extent[i] : top[i]
    if (horizontal) {
      node.x = along
      node.y = across
    } else {
      node.x = across
      node.y = along
    }
  }

  return {
    root: rootNode,
    nodes,
    width: horizontal ? totalDepth : totalBreadth,
    height: horizontal ? totalBreadth : totalDepth,
    direction,
    levelGap,
    layered,
  }
}

function makeNode<T>(
  data: T,
  parent: TidyNode<T> | null,
  depth: number,
  getSize: (data: T) => TidySize
): TidyNode<T> {
  const size = getSize(data)
  return {
    data,
    parent,
    children: [],
    depth,
    x: 0,
    y: 0,
    width: clean(size?.width),
    height: clean(size?.height),
  }
}

// ---------------------------------------------------------------------------
// Layout: helpers for whoever draws it
// ---------------------------------------------------------------------------

export interface TidyLink {
  /** Where the connector leaves the parent. */
  x1: number
  y1: number
  /** Where the connector enters the child. */
  x2: number
  y2: number
}

/**
 * Endpoints of the connector from a node's parent to the node: the middle of
 * the parent's side facing the children, and the middle of the node's side
 * facing the parent. Returns null for the root.
 *
 * The last `tree.levelGap` of the way to (x2, y2) is the band that is
 * guaranteed clear of other nodes.
 */
export function linkTo<T>(node: TidyNode<T>, direction: TidyDirection = 'down'): TidyLink | null {
  const p = node.parent
  if (!p) return null
  switch (direction) {
    case 'down':
      return { x1: p.x + p.width / 2, y1: p.y + p.height, x2: node.x + node.width / 2, y2: node.y }
    case 'up':
      return { x1: p.x + p.width / 2, y1: p.y, x2: node.x + node.width / 2, y2: node.y + node.height }
    case 'right':
      return { x1: p.x + p.width, y1: p.y + p.height / 2, x2: node.x, y2: node.y + node.height / 2 }
    case 'left':
      return { x1: p.x, y1: p.y + p.height / 2, x2: node.x + node.width, y2: node.y + node.height / 2 }
  }
}

/** The node whose box contains the point, or null. For clicks and hovers. */
export function nodeAt<T>(tree: TidyTree<T>, x: number, y: number): TidyNode<T> | null {
  const nodes = tree.nodes
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (x >= node.x && x <= node.x + node.width && y >= node.y && y <= node.y + node.height) {
      return node
    }
  }
  return null
}

// ===========================================================================
// CANVAS RENDERER
//
// Everything above is the layout and never touches the DOM. Everything below
// draws a layout with the Canvas 2D API. It touches the page (the target's
// document, `devicePixelRatio`, `ResizeObserver`) only inside renderTree, and
// only when it owns the canvas.
// ===========================================================================

// ---------------------------------------------------------------------------
// Canvas: public types
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
// Canvas: measuring
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
// Canvas: drawing an existing layout
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
// Canvas: one-call rendering
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
