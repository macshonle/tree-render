/**
 * Y-Monotone Polygon Contour Utilities
 *
 * A contour is the outline of a subtree: its nodes plus the connectors
 * between them. The debug overlay draws contours; no layout algorithm
 * consults them.
 *
 * Y-monotone polygons have the property that every horizontal line intersects
 * the boundary at most twice, which is guaranteed for tree layouts. Every
 * function here takes boundaries whose points run from top to bottom.
 *
 * `subtreeContour` outlines one subtree of a finished layout and is what the
 * app uses. `buildSubtreeContour` and `unionContours` expose the two steps it
 * is made of (place a parent over its children, merge siblings) for contours
 * given as plain point lists.
 */

import type { LayoutNode } from '@/types'
import type { ContourPoint, YMonotonePolygon, EdgeContourStyle } from './types'

// ============================================================================
// Constants
// ============================================================================

/**
 * Small epsilon for y-coordinate comparisons.
 * Used when filtering union boundary points to exclude points at exactly
 * the child's top edge (which are handled by edge geometry instead).
 *
 * This value should be smaller than any meaningful coordinate difference
 * but larger than floating point precision errors.
 */
const Y_EPSILON = 0.001

// ============================================================================
// Contour Creation
// ============================================================================

/**
 * Create a contour for a single rectangular node.
 *
 * The node is centered at origin (0, 0), with:
 * - left edge at -width/2
 * - right edge at +width/2
 * - top edge at -height/2
 * - bottom edge at +height/2
 *
 * @param width Node width in pixels
 * @param height Node height in pixels
 * @returns Y-monotone polygon with 4 corners (rectangle)
 */
export function createNodeContour(width: number, height: number): YMonotonePolygon {
  const halfW = width / 2
  const halfH = height / 2

  return {
    // Left boundary: top-left to bottom-left
    left: [
      { x: -halfW, y: -halfH },
      { x: -halfW, y: halfH },
    ],
    // Right boundary: top-right to bottom-right
    right: [
      { x: halfW, y: -halfH },
      { x: halfW, y: halfH },
    ],
  }
}

// ============================================================================
// Contour Transformation
// ============================================================================

/**
 * Translate a contour by (dx, dy).
 *
 * @param contour The contour to translate
 * @param dx Horizontal offset
 * @param dy Vertical offset
 * @returns New translated contour
 */
export function translateContour(
  contour: YMonotonePolygon,
  dx: number,
  dy: number
): YMonotonePolygon {
  return {
    left: contour.left.map((p) => ({ x: p.x + dx, y: p.y + dy })),
    right: contour.right.map((p) => ({ x: p.x + dx, y: p.y + dy })),
  }
}

/**
 * Clone a contour (deep copy).
 */
export function cloneContour(contour: YMonotonePolygon): YMonotonePolygon {
  return {
    left: contour.left.map((p) => ({ ...p })),
    right: contour.right.map((p) => ({ ...p })),
  }
}

/**
 * Get the bounding box of a contour.
 */
export function getContourBounds(contour: YMonotonePolygon): {
  top: number
  bottom: number
  left: number
  right: number
} {
  // A loop, not Math.min(...points): a contour can have more points than a
  // call can take arguments.
  const bounds = { top: Infinity, bottom: -Infinity, left: Infinity, right: -Infinity }
  for (const side of [contour.left, contour.right]) {
    for (const p of side) {
      bounds.top = Math.min(bounds.top, p.y)
      bounds.bottom = Math.max(bounds.bottom, p.y)
      bounds.left = Math.min(bounds.left, p.x)
      bounds.right = Math.max(bounds.right, p.x)
    }
  }
  return bounds
}

// ============================================================================
// Chains: one side of a contour while it is being built
// ============================================================================

/**
 * One side of a contour, stored from the bottom of the subtree up, so the
 * top of the contour is the end of the arrays.
 *
 * Building a parent's contour only changes the top of its children's: the
 * part beside shallower siblings is merged, and the parent's own corners and
 * connector points go on above. Stored this way the deep remainder never has
 * to be copied or even visited, which is what keeps deep trees linear.
 */
interface Chain {
  xs: number[]
  ys: number[]
  /**
   * The deepest y at which the same point appears twice in a row, or
   * -Infinity if none does. Merging removes such repeats, so a chain that
   * has one below the merged part cannot have that part left in place.
   */
  repeatY: number
}

/** A chain from a top-to-bottom point list, optionally moved by (dx, dy). */
function chainOf(points: ContourPoint[], dx: number, dy: number, move: boolean): Chain {
  const count = points.length
  const xs = new Array<number>(count)
  const ys = new Array<number>(count)
  let repeatY = -Infinity
  for (let i = 0; i < count; i++) {
    const p = points[count - 1 - i]
    xs[i] = move ? p.x + dx : p.x
    ys[i] = move ? p.y + dy : p.y
    if (i > 0 && xs[i] === xs[i - 1] && ys[i] === ys[i - 1] && ys[i] > repeatY) repeatY = ys[i]
  }
  return { xs, ys, repeatY }
}

/** The top-to-bottom point list of a chain, optionally relative to an origin. */
function pointsOf(chain: Chain, originX: number, originY: number, relative: boolean): ContourPoint[] {
  const { xs, ys } = chain
  const count = xs.length
  const points = new Array<ContourPoint>(count)
  for (let i = 0; i < count; i++) {
    const p = count - 1 - i
    points[i] = relative ? { x: xs[p] - originX, y: ys[p] - originY } : { x: xs[p], y: ys[p] }
  }
  return points
}

/** Add a point above the current top of a chain. */
function put(chain: Chain, x: number, y: number): void {
  const top = chain.xs.length - 1
  if (top >= 0 && chain.xs[top] === x && chain.ys[top] === y && y > chain.repeatY) chain.repeatY = y
  chain.xs.push(x)
  chain.ys.push(y)
}

/**
 * Whether merging a chain on its own would leave its last point alone.
 *
 * A merge re-derives the x at the very bottom from the segment that leads
 * there. That reproduces the last point exactly for a vertical segment (a
 * leaf's side, the usual case) but can be a rounding error away on a
 * diagonal one, or differ where several points share the bottom.
 */
function endsCleanly(chain: Chain): boolean {
  const { xs, ys } = chain
  if (ys.length < 2) return true
  if (ys[1] === ys[0]) return false
  return xs[1] + ((ys[0] - ys[1]) / (ys[0] - ys[1])) * (xs[0] - xs[1]) === xs[0]
}

// ============================================================================
// Contour Union (for merging sibling subtrees)
// ============================================================================

// Working storage for unionChains, reused between calls and grown on demand.
// Points of every chain taking part, top to bottom, one chain after another:
let X = new Float64Array(0)
let Y = new Float64Array(0)
let OWNER = new Int32Array(0)
let EVENTS = new Int32Array(0)
let SPARE = new Int32Array(0)
let OUT_X = new Float64Array(0)
let OUT_Y = new Float64Array(0)
// Per chain:
let OFFSET = new Int32Array(0)
let LENGTH = new Int32Array(0)
let PASSED = new Int32Array(0)
let SEEN = new Int32Array(0)
let FROM = new Int32Array(0)
let NEXT = new Int32Array(0)
let PREV = new Int32Array(0)
let RUNS = new Int32Array(0)
let BOUND = new Float64Array(0)

function reserve(points: number, chains: number): void {
  if (X.length < points) {
    const size = Math.max(points, X.length * 2, 64)
    X = new Float64Array(size)
    Y = new Float64Array(size)
    OWNER = new Int32Array(size)
    EVENTS = new Int32Array(size)
    SPARE = new Int32Array(size)
    // Each distinct y adds at most two interpolated points to the output.
    OUT_X = new Float64Array(size * 3 + 4)
    OUT_Y = new Float64Array(size * 3 + 4)
  }
  if (OFFSET.length < chains + 1) {
    const size = Math.max(chains + 1, OFFSET.length * 2, 16)
    OFFSET = new Int32Array(size)
    LENGTH = new Int32Array(size)
    PASSED = new Int32Array(size)
    SEEN = new Int32Array(size)
    FROM = new Int32Array(size)
    NEXT = new Int32Array(size)
    PREV = new Int32Array(size)
    RUNS = new Int32Array(size)
    BOUND = new Float64Array(size)
  }
}

/**
 * The x of chain `j` at `y`, where `y` is the level the sweep is at: the
 * leftmost (or rightmost) x the chain has there, or NaN if it does not reach
 * that level.
 */
function xAt(j: number, y: number, step: number, left: boolean): number {
  const count = LENGTH[j]
  if (count === 0) return NaN
  const offset = OFFSET[j]
  const lastY = Y[offset + count - 1]
  if (y < Y[offset] || y > lastY) return NaN

  // Only the segments that touch this level can contain it: from the one
  // arriving at the chain's first point here to the one leaving its last.
  const passed = PASSED[j]
  const first = SEEN[j] === step ? FROM[j] : passed
  const stop = Math.min(passed - 1, count - 2)
  let best = left ? Infinity : -Infinity
  for (let s = Math.max(first - 1, 0); s <= stop; s++) {
    const a = offset + s
    const y1 = Y[a]
    const y2 = Y[a + 1]
    if (y >= y1 && y <= y2) {
      let x: number
      if (y2 === y1) {
        x = left ? Math.min(X[a], X[a + 1]) : Math.max(X[a], X[a + 1])
      } else {
        x = X[a] + ((y - y1) / (y2 - y1)) * (X[a + 1] - X[a])
      }
      best = left ? Math.min(best, x) : Math.max(best, x)
    }
  }
  if (y === lastY) {
    const x = X[offset + count - 1]
    best = left ? Math.min(best, x) : Math.max(best, x)
  }
  return isFinite(best) ? best : NaN
}

/**
 * Merge the left (or right) sides of sibling subtrees into the side of their
 * union, preserving detail from whichever chain is outermost.
 *
 * The levels at which any chain has a point divide the y-axis into bands.
 * Within a band the outermost chain is the one that is leftmost (rightmost)
 * at the middle of the band, the lowest-numbered one winning ties. The
 * result follows that chain's own points, and where the outermost chain
 * changes it gets a point on the old chain and one on the new, both at the
 * level of the change.
 *
 * The chains are visited in one sweep down the y-axis with a cursor in each,
 * so the cost is that of sorting the points involved plus, per band, a look
 * at the chains that could be outermost there. Below the bottom of the
 * second-deepest chain only the deepest is left; that part of it is the
 * result as it stands, so it stays in place and is not visited.
 *
 * Takes the chains over: one of them may be returned, changed.
 */
function unionChains(chains: Chain[], left: boolean): Chain {
  const chainCount = chains.length

  // The chain that reaches deepest, and how deep the others go.
  let deepest = -1
  let deepestY = -Infinity
  let othersY = -Infinity
  let pointCount = 0
  for (let j = 0; j < chainCount; j++) {
    const ys = chains[j].ys
    pointCount += ys.length
    if (ys.length === 0) continue
    if (ys[0] > deepestY) {
      othersY = deepestY
      deepestY = ys[0]
      deepest = j
    } else if (ys[0] > othersY) {
      othersY = ys[0]
    }
  }

  // If the deepest chain goes on below all the others, leave that part of it
  // where it is. `kept` counts the points left in place; the topmost of them
  // still takes part, as the far end of the last segment the sweep looks at.
  let resting = -1
  let kept = 0
  if (deepest >= 0 && deepestY > othersY) {
    const chain = chains[deepest]
    const ys = chain.ys
    if (ys[ys.length - 1] <= othersY && chain.repeatY <= othersY && endsCleanly(chain)) {
      resting = deepest
      kept = ys.length
      while (ys[kept - 1] <= othersY) kept--
      pointCount -= kept - 1
    }
  }

  reserve(pointCount, chainCount)

  // Lay the points out top to bottom, chain after chain, and note for each
  // chain a bound on how far out it gets: no chain after j is further left
  // than BOUND[j] (no chain before j further right, for right sides).
  let position = 0
  for (let j = 0; j < chainCount; j++) {
    const { xs, ys } = chains[j]
    const stop = j === resting ? kept - 1 : 0
    let bound = left ? Infinity : -Infinity
    OFFSET[j] = position
    for (let p = ys.length - 1; p >= stop; p--) {
      const x = xs[p]
      X[position] = x
      Y[position] = ys[p]
      OWNER[position] = j
      if (left ? x < bound : x > bound) bound = x
      position++
    }
    LENGTH[j] = position - OFFSET[j]
    BOUND[j] = bound
    PASSED[j] = 0
    SEEN[j] = -1
  }
  if (left) {
    for (let j = chainCount - 2; j >= 0; j--) if (BOUND[j + 1] < BOUND[j]) BOUND[j] = BOUND[j + 1]
  } else {
    for (let j = 1; j < chainCount; j++) if (BOUND[j - 1] > BOUND[j]) BOUND[j] = BOUND[j - 1]
  }

  // Every point in order of y. Each chain is already in order, so this is a
  // merge of sorted runs. The resting chain's far end is not an event.
  let eventCount = 0
  let runCount = 0
  let head = -1
  let tail = -1
  for (let j = 0; j < chainCount; j++) {
    if (LENGTH[j] === 0) continue
    // Chains still in play, as a list in their original order.
    PREV[j] = tail
    NEXT[j] = -1
    if (tail >= 0) NEXT[tail] = j
    else head = j
    tail = j

    const count = LENGTH[j] - (j === resting ? 1 : 0)
    if (count === 0) continue
    RUNS[runCount++] = eventCount
    for (let t = 0; t < count; t++) EVENTS[eventCount++] = OFFSET[j] + t
  }
  RUNS[runCount] = eventCount
  let events = EVENTS
  let spare = SPARE
  while (runCount > 1) {
    let out = 0
    let merged = 0
    let r = 0
    for (; r + 1 < runCount; r += 2) {
      let a = RUNS[r]
      let b = RUNS[r + 1]
      const aEnd = b
      const bEnd = RUNS[r + 2]
      RUNS[merged++] = out
      while (a < aEnd && b < bEnd) spare[out++] = Y[events[b]] < Y[events[a]] ? events[b++] : events[a++]
      while (a < aEnd) spare[out++] = events[a++]
      while (b < bEnd) spare[out++] = events[b++]
    }
    if (r < runCount) {
      let a = RUNS[r]
      const aEnd = RUNS[r + 1]
      RUNS[merged++] = out
      while (a < aEnd) spare[out++] = events[a++]
    }
    RUNS[merged] = out
    runCount = merged
    const swap = events
    events = spare
    spare = swap
  }

  // The sweep. `current` is the chain the result is following.
  let outCount = 0
  let current = -1
  let step = 0
  let e = 0
  while (e < eventCount) {
    const y = Y[events[e]]

    // Move every chain with a point at this level past it. FROM..PASSED is
    // then the range of a chain's points at this level, if SEEN says it has
    // any. A chain with no points left drops out of play.
    let next = e
    do {
      const j = OWNER[events[next]]
      if (SEEN[j] !== step) {
        SEEN[j] = step
        FROM[j] = PASSED[j]
      }
      if (++PASSED[j] === LENGTH[j]) {
        const before = PREV[j]
        const after = NEXT[j]
        if (before >= 0) NEXT[before] = after
        else head = after
        if (after >= 0) PREV[after] = before
        else tail = before
      }
      next++
    } while (next < eventCount && Y[events[next]] === y)

    if (next < eventCount || resting >= 0) {
      // The band from this level down to the next one.
      const nextY = next < eventCount ? Y[events[next]] : Y[OFFSET[resting] + LENGTH[resting] - 1]
      const middle = (y + nextY) / 2

      // Which chain is outermost there. A chain in play has a point below
      // this level, so it crosses the band if it has started. The scan stops
      // once no remaining chain can get as far out as the best so far, with
      // a margin for rounding in the interpolation.
      let outer = -1
      if (left) {
        let best = Infinity
        for (let j = head; j >= 0; j = NEXT[j]) {
          if (BOUND[j] - 1e-9 * (Math.abs(best) + 1) > best) break
          const passed = PASSED[j]
          if (passed === 0) continue
          const a = OFFSET[j] + passed - 1
          const x = X[a] + ((middle - Y[a]) / (Y[a + 1] - Y[a])) * (X[a + 1] - X[a])
          if (x < best && isFinite(x)) {
            best = x
            outer = j
          }
        }
      } else {
        // Scanned from the far end, so `>=` gives ties to the earlier chain.
        let best = -Infinity
        for (let j = tail; j >= 0; j = PREV[j]) {
          if (BOUND[j] + 1e-9 * (Math.abs(best) + 1) < best) break
          const passed = PASSED[j]
          if (passed === 0) continue
          const a = OFFSET[j] + passed - 1
          const x = X[a] + ((middle - Y[a]) / (Y[a + 1] - Y[a])) * (X[a + 1] - X[a])
          if (x >= best && isFinite(x)) {
            best = x
            outer = j
          }
        }
      }

      if (outer >= 0) {
        const hasPointsHere = SEEN[outer] === step
        // Close off the chain being left, at the level where it is left.
        if (outer !== current && current >= 0) {
          const x = xAt(current, y, step, left)
          if (x === x && (outCount === 0 || OUT_X[outCount - 1] !== x || OUT_Y[outCount - 1] !== y)) {
            OUT_X[outCount] = x
            OUT_Y[outCount++] = y
          }
        }
        // Start (or continue) the outermost chain at this level: with its
        // own points if it has any here, otherwise with an interpolated one.
        if (!hasPointsHere) {
          const x = xAt(outer, y, step, left)
          if (x === x && (outCount === 0 || OUT_X[outCount - 1] !== x || OUT_Y[outCount - 1] !== y)) {
            OUT_X[outCount] = x
            OUT_Y[outCount++] = y
          }
        } else {
          const offset = OFFSET[outer]
          for (let t = offset + FROM[outer], end = offset + PASSED[outer]; t < end; t++) {
            if (outCount === 0 || OUT_X[outCount - 1] !== X[t] || OUT_Y[outCount - 1] !== Y[t]) {
              OUT_X[outCount] = X[t]
              OUT_Y[outCount++] = Y[t]
            }
          }
        }
        current = outer
      }
    } else if (current >= 0) {
      // The very last level: finish the chain being followed.
      const x = xAt(current, y, step, left)
      if (x === x && (outCount === 0 || OUT_X[outCount - 1] !== x || OUT_Y[outCount - 1] !== y)) {
        OUT_X[outCount] = x
        OUT_Y[outCount++] = y
      }
      if (SEEN[current] === step) {
        const offset = OFFSET[current]
        for (let t = offset + FROM[current], end = offset + PASSED[current]; t < end; t++) {
          if (outCount === 0 || OUT_X[outCount - 1] !== X[t] || OUT_Y[outCount - 1] !== Y[t]) {
            OUT_X[outCount] = X[t]
            OUT_Y[outCount++] = Y[t]
          }
        }
      }
    }

    e = next
    step++
  }

  // The result goes on top of what was left in place, or into a new chain.
  let result: Chain
  if (resting >= 0) {
    result = chains[resting]
    result.xs.length = kept
    result.ys.length = kept
    result.repeatY = -Infinity
  } else {
    result = { xs: [], ys: [], repeatY: -Infinity }
  }
  for (let t = outCount - 1; t >= 0; t--) {
    result.xs.push(OUT_X[t])
    result.ys.push(OUT_Y[t])
  }
  return result
}

/**
 * Compute the union of multiple Y-monotone polygon contours.
 *
 * This is used when combining sibling subtrees - the result is the outer
 * envelope that encompasses all input contours, while PRESERVING detail
 * from the dominant contour at each y-segment.
 *
 * For Y-monotone polygons, union is computed by:
 * - Left boundary: track which contour is leftmost at each y-segment,
 *   preserve all detail from the dominant contour
 * - Right boundary: track which contour is rightmost at each y-segment,
 *   preserve all detail from the dominant contour
 *
 * This differs from a simple envelope computation because it preserves
 * inflection points (like edge geometry dips) from the dominant contour,
 * which are needed for accurate debug visualization.
 *
 * @param contours Array of contours (already positioned in parent's coordinate system)
 * @returns Union contour encompassing all inputs
 */
export function unionContours(contours: YMonotonePolygon[]): YMonotonePolygon {
  if (contours.length === 0) {
    return { left: [], right: [] }
  }

  if (contours.length === 1) {
    return cloneContour(contours[0])
  }

  const left = unionChains(contours.map((c) => chainOf(c.left, 0, 0, false)), true)
  const right = unionChains(contours.map((c) => chainOf(c.right, 0, 0, false)), false)
  return { left: pointsOf(left, 0, 0, false), right: pointsOf(right, 0, 0, false) }
}

// ============================================================================
// Edge Connection
// ============================================================================

/**
 * Put a parent on top of the merged side of its children: drop what the
 * children's side has at or above the outer child's top edge, then add the
 * connector geometry and the parent's own corners.
 *
 * For curve and straight-arrow edges the connector is a diagonal from the
 * parent's bottom corner to the outer child's top corner, which envelopes
 * how those edges are drawn.
 *
 * Org-chart edges drop from the parent to a horizontal bar halfway down to
 * the children, which spans from the first child's centre to the last
 * child's, and drop again from the bar to each child. Where the bar reaches
 * out past the parent, the contour hugs it: a diagonal from the parent's
 * corner to the end of the bar, down to the child's top, and out to the
 * child's corner.
 *
 * @param chain The children's merged side, changed in place
 * @param left Whether this is the left side
 * @param orgChart Whether edges are drawn org-chart style
 * @param parentEdge x of the parent's left (right) edge
 * @param parentTop y of the parent's top edge
 * @param parentBottom y of the parent's bottom edge
 * @param childEdge x of the left edge of the first child (right edge of the last)
 * @param childX x of that child's centre, where its connector arrives
 * @param childTop y of that child's top edge
 * @param rowTop The higher of the first and last child's top edges
 */
function cap(
  chain: Chain,
  left: boolean,
  orgChart: boolean,
  parentEdge: number,
  parentTop: number,
  parentBottom: number,
  childEdge: number,
  childX: number,
  childTop: number,
  rowTop: number
): void {
  const { xs, ys } = chain
  let count = ys.length
  while (count > 0 && !(ys[count - 1] > childTop + Y_EPSILON)) count--
  xs.length = count
  ys.length = count

  if (orgChart) {
    if (left ? childX < parentEdge : childX > parentEdge) {
      // The bar is drawn at the midpoint between parent bottom and children top.
      const barY = parentBottom + (rowTop - parentBottom) / 2
      put(chain, childEdge, childTop)
      put(chain, childX, childTop)
      put(chain, childX, barY)
    } else {
      // The child's centre is within the parent's width: straight to its corner.
      put(chain, childEdge, childTop)
    }
  } else if (childTop > parentBottom) {
    put(chain, childEdge, childTop)
  }
  put(chain, parentEdge, parentBottom)
  put(chain, parentEdge, parentTop)
}

/**
 * Information about a child subtree for edge connection.
 */
export interface ChildContourInfo {
  /** The child's contour (in child's local coordinates) */
  contour: YMonotonePolygon
  /** Child's position relative to parent (parent at origin) */
  offsetX: number
  offsetY: number
  /** Child's node dimensions */
  width: number
  height: number
}

/**
 * Connect a parent node's contour to its children's contours based on edge style.
 *
 * This builds the complete subtree contour by:
 * 1. Starting with the parent node's rectangle
 * 2. Adding edge connection geometry based on edge style
 * 3. Incorporating the UNION of all children's subtree contours
 *
 * The union is important because a non-rightmost child might extend deeper
 * than the rightmost child, so we need to consider all children's boundaries.
 *
 * @param parentWidth Parent node width
 * @param parentHeight Parent node height
 * @param children Information about each child subtree
 * @param edgeStyle How edges connect parent to children
 * @returns Combined Y-monotone polygon for the subtree, with the parent at the origin
 */
export function buildSubtreeContour(
  parentWidth: number,
  parentHeight: number,
  children: ChildContourInfo[],
  edgeStyle: EdgeContourStyle
): YMonotonePolygon {
  if (children.length === 0) {
    return createNodeContour(parentWidth, parentHeight)
  }

  // Left to right, so the first and last are the ones the connectors reach.
  const sorted = [...children].sort((a, b) => a.offsetX - b.offsetX)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const halfW = parentWidth / 2
  const halfH = parentHeight / 2
  const firstTop = first.offsetY - first.height / 2
  const lastTop = last.offsetY - last.height / 2
  const rowTop = Math.min(firstTop, lastTop)
  const orgChart = edgeStyle === 'org-chart'

  // Every child takes part, not just the outer ones: an inner child may
  // reach deeper, or further out lower down.
  const lefts = sorted.map((c) => chainOf(c.contour.left, c.offsetX, c.offsetY, true))
  const left = lefts.length === 1 ? lefts[0] : unionChains(lefts, true)
  cap(left, true, orgChart, -halfW, -halfH, halfH, first.offsetX - first.width / 2, first.offsetX, firstTop, rowTop)

  const rights = sorted.map((c) => chainOf(c.contour.right, c.offsetX, c.offsetY, true))
  const right = rights.length === 1 ? rights[0] : unionChains(rights, false)
  cap(right, false, orgChart, halfW, -halfH, halfH, last.offsetX + last.width / 2, last.offsetX, lastTop, rowTop)

  return { left: pointsOf(left, 0, 0, false), right: pointsOf(right, 0, 0, false) }
}

/**
 * The contour of one subtree of a finished layout: the outline of its nodes
 * and the connectors between them, relative to the centre of `root`.
 *
 * Only the subtree is visited, children before parents, without recursion.
 * Each node takes over the contour of its deepest child instead of copying
 * it, so the work is close to proportional to the size of the subtree
 * however deep it is.
 *
 * @param root The node whose subtree to outline
 * @param edgeStyle How edges connect parent to children
 */
export function subtreeContour(root: LayoutNode, edgeStyle: EdgeContourStyle): YMonotonePolygon {
  const orgChart = edgeStyle === 'org-chart'

  // Breadth-first: a node's children are consecutive, and come after it.
  const nodes: LayoutNode[] = [root]
  const firstChild: number[] = []
  for (let i = 0; i < nodes.length; i++) {
    firstChild.push(nodes.length)
    const children = nodes[i].children
    for (let c = 0; c < children.length; c++) nodes.push(children[c])
  }

  const lefts = new Array<Chain | undefined>(nodes.length)
  const rights = new Array<Chain | undefined>(nodes.length)
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]
    const nodeLeft = node.x - node.width / 2
    const nodeRight = node.x + node.width / 2
    const nodeTop = node.y - node.height / 2
    const nodeBottom = node.y + node.height / 2
    const count = node.children.length

    if (count === 0) {
      const repeatY = nodeTop === nodeBottom ? nodeBottom : -Infinity
      lefts[i] = { xs: [nodeLeft, nodeLeft], ys: [nodeBottom, nodeTop], repeatY }
      rights[i] = { xs: [nodeRight, nodeRight], ys: [nodeBottom, nodeTop], repeatY }
      continue
    }

    // The children from left to right. Layouts produce them in that order;
    // anything else is sorted, keeping the order of children at the same x.
    const start = firstChild[i]
    let order: number[] | null = null
    for (let c = 1; c < count; c++) {
      if (nodes[start + c].x - node.x < nodes[start + c - 1].x - node.x) {
        order = Array.from({ length: count }, (_, k) => start + k)
        order.sort((a, b) => nodes[a].x - node.x - (nodes[b].x - node.x))
        break
      }
    }
    const first = nodes[order ? order[0] : start]
    const last = nodes[order ? order[count - 1] : start + count - 1]
    const firstTop = first.y - first.height / 2
    const lastTop = last.y - last.height / 2
    const rowTop = Math.min(firstTop, lastTop)

    let left: Chain
    let right: Chain
    if (count === 1) {
      left = lefts[start]!
      right = rights[start]!
    } else {
      const leftChains = new Array<Chain>(count)
      const rightChains = new Array<Chain>(count)
      for (let c = 0; c < count; c++) {
        const child = order ? order[c] : start + c
        leftChains[c] = lefts[child]!
        rightChains[c] = rights[child]!
      }
      left = unionChains(leftChains, true)
      right = unionChains(rightChains, false)
    }
    // The children's chains now belong to this node, or are spent.
    for (let c = start; c < start + count; c++) {
      lefts[c] = undefined
      rights[c] = undefined
    }

    cap(left, true, orgChart, nodeLeft, nodeTop, nodeBottom, first.x - first.width / 2, first.x, firstTop, rowTop)
    cap(right, false, orgChart, nodeRight, nodeTop, nodeBottom, last.x + last.width / 2, last.x, lastTop, rowTop)
    lefts[i] = left
    rights[i] = right
  }

  return {
    left: pointsOf(lefts[0]!, root.x, root.y, true),
    right: pointsOf(rights[0]!, root.x, root.y, true),
  }
}
