import { describe, it, expect } from 'vitest'
import { tidyTree } from './tidy-tree'
import canvasSource from './tidy-tree-canvas.ts?raw'
import { drawTree, measureLabel, renderTree } from './tidy-tree-canvas'
import type { TreeRect } from './tidy-tree-canvas'

// The tests run without a DOM. These stand-ins implement just enough of the
// canvas and element interfaces to record what the renderer does to them.

interface Call {
  op: string
  args: unknown[]
}

function fakeContext(canvas: { width: number; height: number }) {
  const calls: Call[] = []
  let depth = 0
  let font = '10px sans-serif'
  const record =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args })
    }
  const ctx = {
    canvas,
    calls,
    get saveDepth() {
      return depth
    },
    get font() {
      return font
    },
    set font(value: string) {
      font = value
      calls.push({ op: 'font', args: [value] })
    },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: 'miter',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    save() {
      depth++
      calls.push({ op: 'save', args: [] })
    },
    restore() {
      depth--
      calls.push({ op: 'restore', args: [] })
    },
    // 7px per character, whatever the font.
    measureText: (text: string) => ({ width: text.length * 7 }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    setTransform: record('setTransform'),
    clearRect: record('clearRect'),
    fillRect: record('fillRect'),
    rect: record('rect'),
    clip: record('clip'),
    translate: record('translate'),
    scale: record('scale'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arcTo: record('arcTo'),
    bezierCurveTo: record('bezierCurveTo'),
    stroke: record('stroke'),
    fill: record('fill'),
    fillText: record('fillText'),
  }
  return ctx
}

type FakeContext = ReturnType<typeof fakeContext>

function fakeCanvas(clientWidth: number, clientHeight: number) {
  const listeners = new Map<string, (event: unknown) => void>()
  const canvas = {
    width: 300,
    height: 150,
    clientWidth,
    clientHeight,
    style: {} as Record<string, string>,
    parentNode: null as unknown,
    ctx: null as unknown as FakeContext,
    listeners,
    getContext: () => canvas.ctx,
    addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  }
  canvas.ctx = fakeContext(canvas)
  return canvas
}

function fakeContainer(clientWidth: number, clientHeight: number, position = 'static') {
  const canvas = fakeCanvas(clientWidth, clientHeight)
  const container = {
    clientWidth,
    clientHeight,
    style: { position: '' } as Record<string, string>,
    children: [] as unknown[],
    canvas,
    ownerDocument: {
      createElement: () => canvas,
      defaultView: { getComputedStyle: () => ({ position }) },
    },
    appendChild(child: typeof canvas) {
      container.children.push(child)
      child.parentNode = container
    },
    removeChild(child: typeof canvas) {
      container.children = container.children.filter((c) => c !== child)
      child.parentNode = null
    },
  }
  return container
}

const asContext = (ctx: FakeContext) => ctx as unknown as CanvasRenderingContext2D
const asCanvas = (canvas: ReturnType<typeof fakeCanvas>) => canvas as unknown as HTMLCanvasElement
const asElement = (el: ReturnType<typeof fakeContainer>) => el as unknown as HTMLElement

interface Labelled {
  label: string
  children?: Labelled[]
}

const data: Labelled = {
  label: 'Root',
  children: [{ label: 'Alpha' }, { label: 'Two\nlines', children: [{ label: 'Leaf' }] }, { label: 'Gamma' }],
}

function ops(ctx: FakeContext, op: string): Call[] {
  return ctx.calls.filter((c) => c.op === op)
}

describe('measureLabel', () => {
  it('sizes a box from the widest line plus padding', () => {
    const ctx = fakeContext({ width: 100, height: 100 })
    expect(measureLabel(asContext(ctx), 'Hello', { paddingX: 10, paddingY: 5, lineHeight: 20 })).toEqual({
      width: 5 * 7 + 20,
      height: 20 + 10,
    })
    expect(measureLabel(asContext(ctx), 'a\nlonger\nb', { paddingX: 0, paddingY: 0, lineHeight: 10 })).toEqual({
      width: 6 * 7,
      height: 30,
    })
  })
})

describe('drawTree', () => {
  it('scales a large tree down to fit the rect and centres it', () => {
    const tree = tidyTree(data, { nodeSize: { width: 200, height: 100 } })
    const ctx = fakeContext({ width: 400, height: 300 })
    const rect: TreeRect = { x: 50, y: 20, width: 300, height: 200 }
    const t = drawTree(asContext(ctx), tree, { rect, margin: 10 })
    expect(t.scale).toBeLessThan(1)
    for (const node of tree.nodes) {
      const left = node.x * t.scale + t.x
      const top = node.y * t.scale + t.y
      expect(left).toBeGreaterThanOrEqual(rect.x + 10 - 1e-9)
      expect(top).toBeGreaterThanOrEqual(rect.y + 10 - 1e-9)
      expect(left + node.width * t.scale).toBeLessThanOrEqual(rect.x + rect.width - 10 + 1e-9)
      expect(top + node.height * t.scale).toBeLessThanOrEqual(rect.y + rect.height - 10 + 1e-9)
    }
    // Centred: equal slack on both sides.
    expect(t.x - rect.x).toBeCloseTo(rect.x + rect.width - (t.x + tree.width * t.scale), 9)
    expect(t.y - rect.y).toBeCloseTo(rect.y + rect.height - (t.y + tree.height * t.scale), 9)
  })

  it('never enlarges by default, enlarges with fit: contain, ignores the rect with fit: none', () => {
    const tree = tidyTree(data, { nodeSize: { width: 10, height: 10 } })
    const rect: TreeRect = { x: 0, y: 0, width: 1000, height: 1000 }
    const ctx = asContext(fakeContext({ width: 1000, height: 1000 }))
    expect(drawTree(ctx, tree, { rect }).scale).toBe(1)
    expect(drawTree(ctx, tree, { rect, fit: 'contain' }).scale).toBeGreaterThan(1)
    const big = tidyTree(data, { nodeSize: { width: 900, height: 900 } })
    expect(drawTree(ctx, big, { rect, fit: 'none' }).scale).toBe(1)
  })

  it('clips to the rect and leaves the context as it found it', () => {
    const tree = tidyTree(data, { nodeSize: { width: 60, height: 30 } })
    const ctx = fakeContext({ width: 400, height: 300 })
    drawTree(asContext(ctx), tree, { rect: { x: 5, y: 6, width: 100, height: 80 } })
    expect(ctx.saveDepth).toBe(0)
    expect(ops(ctx, 'rect')[0].args).toEqual([5, 6, 100, 80])
    expect(ops(ctx, 'clip')).toHaveLength(1)
    // A guest never clears or resizes.
    expect(ops(ctx, 'clearRect')).toHaveLength(0)
    expect(ops(ctx, 'setTransform')).toHaveLength(0)
    expect(ops(ctx, 'fillRect')).toHaveLength(0)
  })

  it('draws one box per node, one connector per child, and every label line', () => {
    const tree = tidyTree(data, { nodeSize: { width: 60, height: 40 } })
    const ctx = fakeContext({ width: 2000, height: 2000 })
    drawTree(asContext(ctx), tree)
    expect(ops(ctx, 'fill')).toHaveLength(5)
    // Elbow connectors: one moveTo and three lineTo per child.
    expect(ops(ctx, 'lineTo')).toHaveLength(4 * 3)
    expect(ops(ctx, 'fillText').map((c) => c.args[0])).toEqual(['Root', 'Alpha', 'Two', 'lines', 'Gamma', 'Leaf'])
  })

  it('supports curved and straight connectors, backgrounds and custom node painters', () => {
    const tree = tidyTree(data, { nodeSize: { width: 60, height: 40 }, direction: 'right' })
    const curved = fakeContext({ width: 2000, height: 2000 })
    drawTree(asContext(curved), tree, { style: { edgeStyle: 'curve', background: '#fff' } })
    expect(ops(curved, 'bezierCurveTo')).toHaveLength(4)
    expect(ops(curved, 'fillRect')).toHaveLength(1)

    const straight = fakeContext({ width: 2000, height: 2000 })
    const painted: string[] = []
    drawTree(asContext(straight), tree, {
      style: { edgeStyle: 'straight' },
      drawNode: (_ctx, node) => painted.push(node.data.label),
    })
    expect(ops(straight, 'lineTo')).toHaveLength(4)
    expect(ops(straight, 'fillText')).toHaveLength(0)
    expect(painted).toEqual(['Root', 'Alpha', 'Two\nlines', 'Gamma', 'Leaf'])
  })

  it('routes connectors through the gap between levels in a layered tree', () => {
    // A short parent next to a tall sibling: the connector must drop past the
    // tall sibling before it travels sideways.
    const source = {
      width: 40,
      height: 20,
      children: [
        { width: 40, height: 20, children: [{ width: 40, height: 20 }, { width: 40, height: 20 }, { width: 40, height: 20 }] },
        { width: 40, height: 100 },
      ],
    }
    const tree = tidyTree(source, { layered: true, nodeGap: 10, levelGap: 30 })
    const [, parent, tall, , , lastGrandchild] = tree.nodes
    const bandStart = tall.y + tall.height
    expect(lastGrandchild.y).toBe(bandStart + 30)
    const ctx = fakeContext({ width: 2000, height: 2000 })
    drawTree(asContext(ctx), tree, { fit: 'none' })
    const lines = ops(ctx, 'lineTo').map((c) => c.args as number[])
    const px = parent.x + parent.width / 2
    // Straight down from the short parent to where the band starts...
    expect(lines).toContainEqual([px, bandStart])
    // ...then across in the middle of the band, below the tall sibling.
    const gx = lastGrandchild.x + lastGrandchild.width / 2
    expect(lines).toContainEqual([px, bandStart + 15])
    expect(lines).toContainEqual([gx, bandStart + 15])
    expect(lines).toContainEqual([gx, lastGrandchild.y])
  })

  it('defaults the rect to the whole canvas in the caller’s units', () => {
    const tree = tidyTree(data, { nodeSize: { width: 60, height: 40 } })
    const ctx = fakeContext({ width: 800, height: 600 })
    // As if the host had already applied a 2x device-pixel-ratio scale.
    ctx.getTransform = () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 })
    drawTree(asContext(ctx), tree)
    expect(ops(ctx, 'rect')[0].args).toEqual([0, 0, 400, 300])
  })
})

describe('renderTree', () => {
  it('as a guest in a given context: measures, lays out, draws in the rect, touches nothing else', () => {
    const canvas = fakeCanvas(400, 300)
    const view = renderTree(asContext(canvas.ctx), data, { rect: { x: 100, y: 0, width: 300, height: 300 } })
    expect(view.canvas).toBe(canvas)
    expect(view.tree.nodes).toHaveLength(5)
    // Sizes come from measuring the labels with the default style.
    expect(view.tree.root.width).toBe(4 * 7 + 24)
    expect(view.tree.root.children[1].height).toBe(2 * 18 + 16)
    expect(canvas.width).toBe(300)
    expect(canvas.height).toBe(150)
    expect(canvas.listeners.size).toBe(0)
    expect(ops(canvas.ctx, 'clearRect')).toHaveLength(0)
    expect(canvas.ctx.saveDepth).toBe(0)
    expect(view.transform.x).toBeGreaterThanOrEqual(100)
  })

  it('owning a canvas element: sizes the backing store, clears, and handles clicks', () => {
    const canvas = fakeCanvas(640, 480)
    const clicked: (string | null)[] = []
    const view = renderTree(asCanvas(canvas), data, { onNodeClick: (node) => clicked.push(node?.data.label ?? null) })
    expect(canvas.width).toBe(640)
    expect(canvas.height).toBe(480)
    expect(ops(canvas.ctx, 'clearRect')[0].args).toEqual([0, 0, 640, 480])

    const root = view.tree.root
    const t = view.transform
    const click = canvas.listeners.get('click')!
    click({ offsetX: (root.x + root.width / 2) * t.scale + t.x, offsetY: (root.y + root.height / 2) * t.scale + t.y })
    click({ offsetX: 1, offsetY: 1 })
    expect(clicked).toEqual(['Root', null])

    view.destroy()
    expect(canvas.listeners.size).toBe(0)
  })

  it('given a container with a height: adds a canvas that covers it', () => {
    const container = fakeContainer(500, 400)
    const view = renderTree(asElement(container), data)
    expect(container.children).toEqual([container.canvas])
    expect(container.style.position).toBe('relative')
    expect(container.canvas.style).toMatchObject({ position: 'absolute', width: '100%', height: '100%' })
    expect(container.canvas.width).toBe(500)
    expect(container.canvas.height).toBe(400)

    view.destroy()
    expect(container.children).toEqual([])
    expect(container.style.position).toBe('')
  })

  it('leaves an already positioned container alone', () => {
    const container = fakeContainer(500, 400, 'absolute')
    renderTree(asElement(container), data)
    expect(container.style.position).toBe('')
  })

  it('given a container with no height: makes the canvas as tall as the tree needs', () => {
    const container = fakeContainer(500, 0)
    const view = renderTree(asElement(container), data, { margin: 10 })
    const expected = Math.ceil(view.tree.height + 20)
    expect(container.canvas.style.height).toBe(`${expected}px`)
    expect(container.canvas.style.position).toBeUndefined()
    expect(container.style.position).toBe('')
    expect(container.canvas.height).toBe(expected)
    expect(view.transform.scale).toBe(1)
  })

  it('update re-lays out with new data and merged options', () => {
    const canvas = fakeCanvas(640, 480)
    const view = renderTree(asCanvas(canvas), data)
    const before = view.tree
    view.update({ label: 'Solo' })
    expect(view.tree).not.toBe(before)
    expect(view.tree.nodes).toHaveLength(1)
    view.update(data, { direction: 'right' })
    expect(view.tree.direction).toBe('right')
    expect(view.tree.nodes).toHaveLength(5)
    // Options persist across updates.
    view.update()
    expect(view.tree.direction).toBe('right')
  })

  it('nodeAt maps canvas positions back through the transform', () => {
    const canvas = fakeCanvas(200, 120)
    const view = renderTree(asCanvas(canvas), data, { nodeSize: { width: 200, height: 100 } })
    expect(view.transform.scale).toBeLessThan(1)
    for (const node of view.tree.nodes) {
      const x = (node.x + node.width / 2) * view.transform.scale + view.transform.x
      const y = (node.y + node.height / 2) * view.transform.scale + view.transform.y
      expect(view.nodeAt(x, y)).toBe(node)
    }
  })
})

describe('packaging', () => {
  it('depends only on the layout file', () => {
    const sources = [...canvasSource.matchAll(/^import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1])
    expect(new Set(sources)).toEqual(new Set(['./tidy-tree.js']))
  })
})
