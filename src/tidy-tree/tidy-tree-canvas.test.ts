import { describe, it, expect } from 'vitest'
import { drawTree, measureLabel, renderTree, tidyTree } from './tidy-tree'
import type { TreeRect } from './tidy-tree'

// The tests run without a DOM. These stand-ins implement just enough of the
// canvas and element interfaces to record what the renderer does to them.

interface DrawingState {
  font: string
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  textAlign: string
  textBaseline: string
  globalAlpha: number
}

interface Call {
  op: string
  args: unknown[]
  /** The drawing state the call was made with. */
  state: DrawingState
}

function fakeContext(canvas: { width: number; height: number }) {
  const calls: Call[] = []
  const saved: DrawingState[] = []
  let font = '10px sans-serif'
  const state = (): DrawingState => ({
    font,
    fillStyle: ctx.fillStyle,
    strokeStyle: ctx.strokeStyle,
    lineWidth: ctx.lineWidth,
    textAlign: ctx.textAlign,
    textBaseline: ctx.textBaseline,
    globalAlpha: ctx.globalAlpha,
  })
  const record =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args, state: state() })
    }
  const ctx = {
    canvas,
    calls,
    get saveDepth() {
      return saved.length
    },
    get font() {
      return font
    },
    set font(value: string) {
      font = value
      calls.push({ op: 'font', args: [value], state: state() })
    },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: 'miter',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    save() {
      saved.push(state())
      calls.push({ op: 'save', args: [], state: state() })
    },
    restore() {
      const back = saved.pop()
      if (back) {
        font = back.font
        ctx.fillStyle = back.fillStyle
        ctx.strokeStyle = back.strokeStyle
        ctx.lineWidth = back.lineWidth
        ctx.textAlign = back.textAlign
        ctx.textBaseline = back.textBaseline
        ctx.globalAlpha = back.globalAlpha
      }
      calls.push({ op: 'restore', args: [], state: state() })
    },
    // 7px per character, or 14px in a font with "wide" in its name.
    measureText: (text: string) => ({ width: text.length * (font.includes('wide') ? 14 : 7) }),
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

describe('drawTree: per-node styles', () => {
  interface Status {
    label: string
    status?: 'ok' | 'down'
    children?: Status[]
  }
  const statusData: Status = {
    label: 'Root',
    children: [{ label: 'Up', status: 'ok' }, { label: 'Down', status: 'down' }, { label: 'Plain' }],
  }
  const tree = tidyTree(statusData, { nodeSize: { width: 60, height: 40 } })
  const [root, up, down, plain] = tree.nodes

  /** The fill and border each box was painted with, and the colour and font of each label. */
  function looks(ctx: FakeContext) {
    const fills = ops(ctx, 'fill').map((c) => c.state.fillStyle)
    const strokes = ops(ctx, 'stroke')
      .slice(1) // the first stroke is the connectors
      .map((c) => `${c.state.strokeStyle} ${c.state.lineWidth}`)
    const texts = Object.fromEntries(ops(ctx, 'fillText').map((c) => [c.args[0], `${c.state.fillStyle} ${c.state.font}`]))
    return { fills, strokes, texts }
  }

  it('applies nodeStyle to the nodes it returns something for, and only those', () => {
    const ctx = fakeContext({ width: 2000, height: 2000 })
    drawTree(asContext(ctx), tree, {
      style: { nodeFill: 'white', nodeStroke: 'grey', textColor: 'black', font: '12px base' },
      nodeStyle: (d) =>
        d.status === 'down'
          ? { nodeFill: 'pink', nodeStroke: 'red', nodeStrokeWidth: 3, textColor: 'darkred', font: 'bold 12px base' }
          : d.status === 'ok'
            ? { nodeFill: 'palegreen' }
            : undefined,
    })
    const { fills, strokes, texts } = looks(ctx)
    // Breadth-first: Root, Up, Down, Plain.
    expect(fills).toEqual(['white', 'palegreen', 'pink', 'white'])
    expect(strokes).toEqual(['grey 1.5', 'grey 1.5', 'red 3', 'grey 1.5'])
    expect(texts).toEqual({
      Root: 'black 12px base',
      Up: 'black 12px base',
      Down: 'darkred bold 12px base',
      Plain: 'black 12px base',
    })
  })

  it('sets the font only when it changes from one node to the next', () => {
    const ctx = fakeContext({ width: 2000, height: 2000 })
    drawTree(asContext(ctx), tree, {
      style: { font: '12px base' },
      nodeStyle: (d) => (d.status === 'down' ? { font: 'bold 12px base' } : null),
    })
    expect(ops(ctx, 'font').map((c) => c.args[0])).toEqual(['12px base', 'bold 12px base', '12px base'])
  })

  it('ignores keys set to undefined, in style and in nodeStyle', () => {
    const ctx = fakeContext({ width: 2000, height: 2000 })
    drawTree(asContext(ctx), tree, {
      style: { nodeFill: undefined, textColor: 'navy' },
      nodeStyle: () => ({ nodeFill: undefined, nodeStroke: undefined }),
    })
    const { fills, strokes, texts } = looks(ctx)
    expect(fills).toEqual(['#ffffff', '#ffffff', '#ffffff', '#ffffff'])
    expect(strokes).toEqual(['#475569 1.5', '#475569 1.5', '#475569 1.5', '#475569 1.5'])
    expect(texts.Root).toMatch(/^navy /)
  })

  it('never lets a node style change the connectors or the background', () => {
    const ctx = fakeContext({ width: 2000, height: 2000 })
    drawTree(asContext(ctx), tree, {
      style: { edgeColor: 'silver', edgeWidth: 2 },
      // Not allowed by the types; a JavaScript caller could still pass them.
      nodeStyle: () => ({ edgeColor: 'red', edgeWidth: 9, background: 'red' }) as object,
    })
    const connectors = ops(ctx, 'stroke')[0]
    expect(`${connectors.state.strokeStyle} ${connectors.state.lineWidth}`).toBe('silver 2')
    expect(ops(ctx, 'fillRect')).toHaveLength(0)
  })

  it('draws the hovered and the selected node in the looks the style gives those states', () => {
    const ctx = fakeContext({ width: 2000, height: 2000 })
    drawTree(asContext(ctx), tree, {
      style: { nodeFill: 'white', nodeStroke: 'grey', hover: { nodeFill: 'azure' } },
      hovered: up,
      selected: down,
    })
    const { fills, strokes } = looks(ctx)
    expect(fills).toEqual(['white', 'azure', 'white', 'white'])
    // The selected look is built in: a heavier blue border.
    expect(strokes).toEqual(['grey 1.5', 'grey 1.5', '#2563eb 3', 'grey 1.5'])
  })

  it('has no hover look unless one is given, and no selected look when it is set to null', () => {
    const ctx = fakeContext({ width: 2000, height: 2000 })
    drawTree(asContext(ctx), tree, { style: { selected: null }, hovered: up, selected: down })
    const { fills, strokes } = looks(ctx)
    expect(new Set(fills)).toEqual(new Set(['#ffffff']))
    expect(new Set(strokes)).toEqual(new Set(['#475569 1.5']))
  })

  it('tells nodeStyle each node’s state, and puts the state looks on top of what it returns', () => {
    const ctx = fakeContext({ width: 2000, height: 2000 })
    const told: Record<string, string> = {}
    drawTree(asContext(ctx), tree, {
      style: { hover: { nodeFill: 'azure' }, selected: { nodeFill: 'lavender', nodeStroke: 'blue' } },
      nodeStyle(d, state) {
        told[d.label] = `${state.hovered} ${state.selected}`
        return { nodeFill: state.selected ? 'gold' : 'white', nodeStroke: 'grey', textColor: state.hovered ? 'red' : 'black' }
      },
      hovered: plain,
      selected: plain,
    })
    expect(told).toEqual({ Root: 'false false', Up: 'false false', Down: 'false false', Plain: 'true true' })
    const { fills, strokes, texts } = looks(ctx)
    // Plain is hovered and selected. Its fill is hover's, which goes on over
    // selected's lavender and nodeStyle's gold; its border is selected's, over
    // nodeStyle's grey; its text colour is nodeStyle's own.
    expect(fills).toEqual(['white', 'white', 'white', 'azure'])
    expect(strokes[3]).toBe('blue 1.5')
    expect(texts.Plain).toMatch(/^red /)
    expect(texts.Root).toMatch(/^black /)
    expect(root.data.label).toBe('Root')
  })
})

describe('drawTree: per-connector styles', () => {
  const tree = tidyTree(data, { nodeSize: { width: 60, height: 40 } })
  const [, alpha, two, gamma, leaf] = tree.nodes

  it('strokes connectors with a style of their own separately, after the shared ones', () => {
    const ctx = fakeContext({ width: 2000, height: 2000 })
    drawTree(asContext(ctx), tree, {
      style: { edgeColor: 'silver', edgeWidth: 1, nodeStrokeWidth: 0 },
      linkStyle: (node) =>
        node === two ? { edgeColor: 'red', edgeWidth: 4 } : node === leaf ? { edgeStyle: 'curve' } : undefined,
    })
    // No node borders, so every stroke is a connector.
    const strokes = ops(ctx, 'stroke').map((c) => `${c.state.strokeStyle} ${c.state.lineWidth}`)
    expect(strokes).toEqual(['silver 1', 'red 4', 'silver 1'])
    // Two elbows in the shared path, one more for the red connector, and a curve.
    expect(ops(ctx, 'lineTo')).toHaveLength(3 * 3)
    expect(ops(ctx, 'bezierCurveTo')).toHaveLength(1)
  })

  it('keeps a connector in the shared path when its style comes to the same thing', () => {
    const ctx = fakeContext({ width: 2000, height: 2000 })
    drawTree(asContext(ctx), tree, {
      style: { edgeColor: 'silver', nodeStrokeWidth: 0 },
      linkStyle: (node) => (node === alpha ? { edgeColor: 'silver', edgeWidth: undefined } : null),
    })
    expect(ops(ctx, 'stroke')).toHaveLength(1)
  })

  it('tells linkStyle the state of the node the connector leads to', () => {
    const ctx = fakeContext({ width: 2000, height: 2000 })
    const told: string[] = []
    drawTree(asContext(ctx), tree, {
      // No borders at all, the selected node's included, so every stroke is a connector.
      style: { nodeStrokeWidth: 0, selected: null },
      linkStyle(node, state) {
        told.push(`${node.data.label.replace('\n', ' ')} ${state.hovered} ${state.selected}`)
        return state.hovered || state.selected ? { edgeColor: 'blue' } : undefined
      },
      hovered: gamma,
      selected: leaf,
    })
    expect(told).toEqual(['Alpha false false', 'Two lines false false', 'Gamma true false', 'Leaf false true'])
    expect(ops(ctx, 'stroke').map((c) => c.state.strokeStyle)).toEqual(['#94a3b8', 'blue', 'blue'])
  })
})

describe('drawTree: custom painters', () => {
  const tree = tidyTree(data, { nodeSize: { width: 60, height: 40 } })

  it('hands the painter the built-in one, to use for some nodes, all, or none', () => {
    const ctx = fakeContext({ width: 2000, height: 2000 })
    const custom: string[] = []
    drawTree(asContext(ctx), tree, {
      drawNode(_ctx, node, _style, { paint }) {
        if (node.children.length === 0) return paint()
        custom.push(node.data.label)
      },
    })
    expect(custom).toEqual(['Root', 'Two\nlines'])
    // The three leaves got the built-in box and label.
    expect(ops(ctx, 'fill')).toHaveLength(3)
    expect(ops(ctx, 'fillText').map((c) => c.args[0])).toEqual(['Alpha', 'Gamma', 'Leaf'])
  })

  it('lets the painter restyle the built-in look for one call, and draw on top of it', () => {
    const ctx = fakeContext({ width: 2000, height: 2000 })
    const order: string[] = []
    drawTree(asContext(ctx), tree, {
      style: { nodeFill: 'white' },
      drawNode(c, node, style, { paint }) {
        paint(node.data.label === 'Alpha' ? { nodeFill: 'gold', textColor: 'brown' } : undefined)
        order.push(`${node.data.label}: ${style.nodeFill}`)
        c.fillRect(node.x, node.y, 4, 4) // a badge
      },
    })
    expect(ops(ctx, 'fill').map((c) => c.state.fillStyle)).toEqual(['white', 'gold', 'white', 'white', 'white'])
    const alpha = ops(ctx, 'fillText').find((c) => c.args[0] === 'Alpha')!
    expect(alpha.state.fillStyle).toBe('brown')
    // The style argument is the node's own style before the one-off change.
    expect(order[1]).toBe('Alpha: white')
    // Each badge comes after its own box and label, and before the next node.
    const sequence = ctx.calls.filter((c) => c.op === 'fill' || c.op === 'fillRect').map((c) => c.op)
    expect(sequence).toEqual(Array(5).fill(['fill', 'fillRect']).flat())
  })

  it('passes each node its own style, state and the scale', () => {
    const big = tidyTree(data, { nodeSize: { width: 600, height: 400 } })
    const [, , , gamma, leaf] = big.nodes
    const ctx = fakeContext({ width: 1000, height: 1000 })
    const seen: string[] = []
    const scales = new Set<number>()
    const t = drawTree(asContext(ctx), big, {
      style: { nodeFill: 'white', hover: { nodeFill: 'azure' }, selected: null },
      nodeStyle: (d) => (d.label === 'Gamma' ? { nodeFill: 'teal' } : undefined),
      hovered: leaf,
      selected: gamma,
      drawNode(_ctx, node, style, drawing) {
        seen.push(`${node.data.label.replace('\n', ' ')}: ${style.nodeFill} ${drawing.hovered} ${drawing.selected}`)
        scales.add(drawing.scale)
        drawing.paint()
      },
    })
    expect(seen).toEqual([
      'Root: white false false',
      'Alpha: white false false',
      'Two lines: white false false',
      'Gamma: teal false true',
      'Leaf: azure true false',
    ])
    expect(ops(ctx, 'fill').map((c) => c.state.fillStyle)).toEqual(['white', 'white', 'white', 'teal', 'azure'])
    expect(t.scale).toBeLessThan(1)
    expect([...scales]).toEqual([t.scale])
  })

  /** A painter that leaves the context in a mess and reports the state it was called with. */
  function messyPainter(arrivedWith: string[], paintFor = 'Leaf') {
    return (
      c: CanvasRenderingContext2D,
      node: { data: Labelled },
      _style: unknown,
      drawing: { paint: () => void }
    ): void => {
      arrivedWith.push(`${c.font} ${c.textAlign} ${c.textBaseline} ${c.globalAlpha}`)
      c.globalAlpha = 0.25
      c.font = '40px other'
      c.textAlign = 'left'
      c.textBaseline = 'top'
      if (node.data.label === paintFor) drawing.paint()
    }
  }

  it('by default undoes whatever a painter changes before the next node is drawn', () => {
    const ctx = fakeContext({ width: 2000, height: 2000 })
    const arrivedWith: string[] = []
    drawTree(asContext(ctx), tree, { style: { font: '12px base' }, drawNode: messyPainter(arrivedWith) })
    // Every call starts from the same state, whatever the one before it did.
    expect(arrivedWith).toHaveLength(5)
    expect(new Set(arrivedWith)).toEqual(new Set(['12px base center middle 1']))
    // The built-in look sets the text state it needs rather than trusting it.
    const leaf = ops(ctx, 'fillText').find((c) => c.args[0] === 'Leaf')!
    expect(leaf.state).toMatchObject({ font: '12px base', textAlign: 'center', textBaseline: 'middle' })
    // One save for the drawing as a whole and one for each node.
    expect(ops(ctx, 'save')).toHaveLength(1 + 5)
    expect(ctx.saveDepth).toBe(0)
  })

  it('with restoreContext off carries a painter’s changes on, except the text state every painter is promised', () => {
    const ctx = fakeContext({ width: 2000, height: 2000 })
    const arrivedWith: string[] = []
    drawTree(asContext(ctx), tree, {
      style: { font: '12px base' },
      restoreContext: false,
      drawNode: messyPainter(arrivedWith),
    })
    expect(arrivedWith[0]).toBe('12px base center middle 1')
    // The alpha set by the first painter is still there; font and alignment are not.
    expect(new Set(arrivedWith.slice(1))).toEqual(new Set(['12px base center middle 0.25']))
    expect(ops(ctx, 'save')).toHaveLength(1)
    // And the drawing as a whole still leaves the context as it found it.
    expect(ctx.saveDepth).toBe(0)
    expect(ctx.globalAlpha).toBe(1)
  })

  it('with clipNodes confines each painter to the node’s outline, border included', () => {
    const ctx = fakeContext({ width: 2000, height: 2000 })
    drawTree(asContext(ctx), tree, {
      style: { nodeStrokeWidth: 2, nodeRadius: 4 },
      nodeStyle: (d) => (d.label === 'Gamma' ? { nodeStrokeWidth: 0, nodeRadius: 0 } : undefined),
      clipNodes: true,
      // Clipping needs the context saved and restored, whatever this says.
      restoreContext: false,
      drawNode: () => {},
    })
    // The first clip is the drawing area; then one per node.
    const clips = ctx.calls.map((c, i) => (c.op === 'clip' ? i : -1)).filter((i) => i >= 0)
    expect(clips).toHaveLength(1 + 5)
    expect(ops(ctx, 'save')).toHaveLength(1 + 5)
    tree.nodes.forEach((node, n) => {
      // The outline path starts just before its clip: moveTo, four arcs, closePath.
      const path = ctx.calls.slice(clips[n + 1] - 6, clips[n + 1])
      expect(path.map((c) => c.op)).toEqual(['moveTo', 'arcTo', 'arcTo', 'arcTo', 'arcTo', 'closePath'])
      const plain = node.data.label === 'Gamma'
      const half = plain ? 0 : 1
      const radius = plain ? 0 : 4 + 1
      expect(path[0].args).toEqual([node.x - half + radius, node.y - half])
      // The first arc turns the top-right corner of the outline.
      expect((path[1].args as number[]).slice(0, 2)).toEqual([node.x + node.width + half, node.y - half])
      // The second, the bottom-right.
      expect((path[2].args as number[]).slice(0, 2)).toEqual([node.x + node.width + half, node.y + node.height + half])
    })
  })

  it('does not clip unless asked to', () => {
    const ctx = fakeContext({ width: 2000, height: 2000 })
    drawTree(asContext(ctx), tree, { drawNode: () => {} })
    expect(ops(ctx, 'clip')).toHaveLength(1)
  })
})

describe('renderTree: sizing', () => {
  it('measures each label with its own node style', () => {
    const canvas = fakeCanvas(640, 480)
    const view = renderTree(asCanvas(canvas), data, {
      nodeStyle: (d) => (d.label === 'Alpha' ? { paddingX: 30, paddingY: 20, lineHeight: 40, font: 'bold 20px wide' } : undefined),
    })
    const [root, alpha, , gamma] = view.tree.nodes
    // The stand-in context makes characters 14px in the wide font, 7px otherwise.
    expect([alpha.width, alpha.height]).toEqual([5 * 14 + 60, 40 + 40])
    expect([root.width, root.height]).toEqual([4 * 7 + 24, 18 + 16])
    // Measured after Alpha: its font must not carry over.
    expect([gamma.width, gamma.height]).toEqual([5 * 7 + 24, 18 + 16])
  })

  it('measures in the resting state, so that hovering and selecting move nothing', () => {
    const canvas = fakeCanvas(640, 480)
    const states: string[] = []
    const view = renderTree(asCanvas(canvas), data, {
      nodeStyle(_d, state) {
        states.push(`${state.hovered} ${state.selected}`)
        return state.hovered || state.selected ? { paddingX: 50 } : undefined
      },
    })
    const sizes = () => view.tree.nodes.map((n) => `${n.width}x${n.height}`)
    const before = sizes()
    states.length = 0
    view.select(view.tree.root)
    view.hover(view.tree.root)
    view.update()
    expect(sizes()).toEqual(before)
    // It was told about the state when drawing...
    expect(states).toContain('true true')
    // ...and the sizes are still those of unpadded labels.
    expect(view.tree.root.width).toBe(4 * 7 + 24)
  })

  it('gives a nodeSize function a way to measure the label, other text, and other styles', () => {
    const canvas = fakeCanvas(640, 480)
    const view = renderTree(asCanvas(canvas), data, {
      nodeStyle: (d) => (d.label === 'Alpha' ? { paddingX: 20 } : undefined),
      nodeSize(d, measure) {
        if (d.label === 'Root') {
          // The label, plus room for an icon beside it.
          const box = measure()
          return { width: box.width + 30, height: box.height }
        }
        if (d.label === 'Alpha') return measure()
        if (d.label === 'Gamma') return measure('a much longer caption')
        if (d.label === 'Leaf') return measure(undefined, { paddingX: 0, paddingY: 0, font: '9px wide' })
        return { width: 10, height: 10 }
      },
    })
    const [root, alpha, two, gamma, leaf] = view.tree.nodes
    expect([root.width, root.height]).toEqual([4 * 7 + 24 + 30, 18 + 16])
    // In the node's own style.
    expect(alpha.width).toBe(5 * 7 + 40)
    expect([two.width, two.height]).toEqual([10, 10])
    expect(gamma.width).toBe(21 * 7 + 24)
    expect([leaf.width, leaf.height]).toEqual([4 * 14, 18])
  })

  it('hands out measurements that are the caller’s to change', () => {
    const canvas = fakeCanvas(640, 480)
    const view = renderTree(asCanvas(canvas), { label: 'Same', children: [{ label: 'Same' }] }, {
      nodeSize(_d, measure) {
        const box = measure()
        box.width += 100
        return box
      },
    })
    // Both nodes have the same label; the second must not see the first's addition twice.
    expect(view.tree.nodes.map((n) => n.width)).toEqual([4 * 7 + 24 + 100, 4 * 7 + 24 + 100])
  })
})

describe('renderTree: hover and selection', () => {
  /** A mouse event at the middle of a node, or at a given point. */
  function at(view: { transform: { scale: number; x: number; y: number } }, node: { x: number; y: number; width: number; height: number } | null) {
    if (!node) return { offsetX: 1, offsetY: 1 }
    const t = view.transform
    return { offsetX: (node.x + node.width / 2) * t.scale + t.x, offsetY: (node.y + node.height / 2) * t.scale + t.y }
  }
  const draws = (canvas: ReturnType<typeof fakeCanvas>) => ops(canvas.ctx, 'clearRect').length

  it('follows the pointer over a canvas it owns and reports each change once', () => {
    const canvas = fakeCanvas(640, 480)
    const reported: (string | null)[] = []
    const view = renderTree(asCanvas(canvas), data, {
      style: { hover: { nodeFill: 'azure' } },
      onNodeHover: (node) => reported.push(node?.data.label ?? null),
    })
    const move = canvas.listeners.get('mousemove')!
    const leave = canvas.listeners.get('mouseleave')!
    const [root, alpha] = view.tree.nodes
    expect(view.hovered).toBeNull()

    move(at(view, root))
    expect(view.hovered).toBe(root)
    move(at(view, root)) // still on it: nothing new
    move(at(view, alpha))
    expect(view.hovered).toBe(alpha)
    move(at(view, null))
    expect(view.hovered).toBeNull()
    move(at(view, alpha))
    leave({})
    expect(view.hovered).toBeNull()
    expect(reported).toEqual(['Root', 'Alpha', null, 'Alpha', null])

    // Drawn once to begin with and once for each change.
    expect(draws(canvas)).toBe(1 + 5)
    // The last node hovered was drawn in the hover look while it was hovered.
    const fills = ops(canvas.ctx, 'fill').map((c) => c.state.fillStyle)
    expect(fills.filter((f) => f === 'azure')).toHaveLength(3)
  })

  it('does not redraw for hover when nothing drawn depends on it', () => {
    const canvas = fakeCanvas(640, 480)
    const reported: (string | null)[] = []
    const view = renderTree(asCanvas(canvas), data, { onNodeHover: (node) => reported.push(node?.data.label ?? null) })
    canvas.listeners.get('mousemove')!(at(view, view.tree.root))
    expect(view.hovered).toBe(view.tree.root)
    expect(reported).toEqual(['Root'])
    expect(draws(canvas)).toBe(1)
  })

  it('shows a pointer cursor over nodes that a click does something to, and only then', () => {
    const plain = fakeCanvas(640, 480)
    const plainView = renderTree(asCanvas(plain), data)
    plain.listeners.get('mousemove')!(at(plainView, plainView.tree.root))
    expect(plain.style.cursor || '').toBe('')

    const clickable = fakeCanvas(640, 480)
    clickable.style.cursor = 'crosshair'
    const view = renderTree(asCanvas(clickable), data, { onNodeClick: () => {} })
    const move = clickable.listeners.get('mousemove')!
    move(at(view, view.tree.root))
    expect(clickable.style.cursor).toBe('pointer')
    move(at(view, null))
    expect(clickable.style.cursor).toBe('crosshair')
    move(at(view, view.tree.root))
    view.destroy()
    expect(clickable.style.cursor).toBe('crosshair')
    expect(clickable.listeners.size).toBe(0)
  })

  it('selects on click when selectable, clears on a click elsewhere, and draws the selected look', () => {
    const canvas = fakeCanvas(640, 480)
    const selections: (string | null)[] = []
    const clicks: (string | null)[] = []
    const view = renderTree(asCanvas(canvas), data, {
      selectable: true,
      onNodeSelect: (node) => selections.push(node?.data.label ?? null),
      onNodeClick: (node) => clicks.push(node?.data.label ?? null),
    })
    const click = canvas.listeners.get('click')!
    const [root, alpha] = view.tree.nodes

    click(at(view, alpha))
    expect(view.selected).toBe(alpha)
    click(at(view, alpha)) // again: still selected, nothing new to report
    click(at(view, root))
    expect(view.selected).toBe(root)
    click(at(view, null))
    expect(view.selected).toBeNull()
    expect(selections).toEqual(['Alpha', 'Root', null])
    // Every click is still reported as a click.
    expect(clicks).toEqual(['Alpha', 'Alpha', 'Root', null])
    // One draw to begin with and one per change of selection.
    expect(draws(canvas)).toBe(1 + 3)
    expect(ops(canvas.ctx, 'stroke').filter((c) => c.state.strokeStyle === '#2563eb')).toHaveLength(2)
  })

  it('calls the handlers before it redraws, so that what they set is drawn', () => {
    const canvas = fakeCanvas(640, 480)
    let chosen: string | null = null
    let under: string | null = null
    const view = renderTree(asCanvas(canvas), data, {
      selectable: true,
      style: { selected: null },
      onNodeSelect: (node) => (chosen = node?.data.label ?? null),
      onNodeHover: (node) => (under = node?.data.label ?? null),
      nodeStyle: (d) => ({ nodeFill: d.label === chosen ? 'gold' : d.label === under ? 'azure' : 'white' }),
    })
    const [, alpha, , gamma] = view.tree.nodes
    canvas.ctx.calls.length = 0
    canvas.listeners.get('click')!(at(view, alpha))
    expect(ops(canvas.ctx, 'fill').map((c) => c.state.fillStyle)).toEqual(['white', 'gold', 'white', 'white', 'white'])
    canvas.ctx.calls.length = 0
    canvas.listeners.get('mousemove')!(at(view, gamma))
    expect(ops(canvas.ctx, 'fill').map((c) => c.state.fillStyle)).toEqual(['white', 'gold', 'white', 'azure', 'white'])
  })

  it('leaves clicks alone when not selectable', () => {
    const canvas = fakeCanvas(640, 480)
    const view = renderTree(asCanvas(canvas), data, { onNodeSelect: () => expect.unreachable() })
    canvas.listeners.get('click')!(at(view, view.tree.root))
    expect(view.selected).toBeNull()
    expect(draws(canvas)).toBe(1)
  })

  it('can be told the hovered and selected nodes directly', () => {
    const canvas = fakeCanvas(640, 480)
    const view = renderTree(asCanvas(canvas), data, { onNodeSelect: () => expect.unreachable() })
    const [root, alpha] = view.tree.nodes
    expect(view.select(alpha)).toBe(true)
    expect(view.select(alpha)).toBe(false)
    expect(view.selected).toBe(alpha)
    expect(view.hover(root)).toBe(true)
    expect(view.hover(root)).toBe(false)
    expect(view.hovered).toBe(root)
    // Selecting redraws; hovering does not here, as no hover look is set.
    expect(draws(canvas)).toBe(1 + 1)
    expect(view.select(null)).toBe(true)
    expect(view.selected).toBeNull()
  })

  it('as a guest listens to nothing and draws only when told, in the state it was given', () => {
    const canvas = fakeCanvas(400, 300)
    const view = renderTree(asContext(canvas.ctx), data, { style: { hover: { nodeFill: 'azure' } }, selectable: true })
    expect(canvas.listeners.size).toBe(0)
    const [root, alpha] = view.tree.nodes
    const before = canvas.ctx.calls.length
    expect(view.hover(alpha)).toBe(true)
    expect(view.select(root)).toBe(true)
    // Nothing drawn, and the host's cursor left alone.
    expect(canvas.ctx.calls.length).toBe(before)
    expect(canvas.style.cursor).toBeUndefined()

    canvas.ctx.calls.length = 0
    view.draw()
    expect(ops(canvas.ctx, 'fill').map((c) => c.state.fillStyle)).toEqual(['#ffffff', 'azure', '#ffffff', '#ffffff', '#ffffff'])
    expect(ops(canvas.ctx, 'stroke')[1].state.strokeStyle).toBe('#2563eb')
  })

  it('keeps hover and selection on the same data across an update, and drops them when it is gone', () => {
    const canvas = fakeCanvas(640, 480)
    const view = renderTree(asCanvas(canvas), data)
    const [, alpha, two] = view.tree.nodes
    view.select(two)
    view.hover(alpha)

    view.update(undefined, { direction: 'right' })
    expect(view.selected).not.toBe(two)
    expect(view.selected?.data).toBe(two.data)
    expect(view.hovered?.data).toBe(alpha.data)

    view.update({ label: 'Something else' })
    expect(view.selected).toBeNull()
    expect(view.hovered).toBeNull()
  })

  it('redraws with a changed nodeStyle without laying out again', () => {
    const canvas = fakeCanvas(640, 480)
    let hot: string | null = null
    const view = renderTree(asCanvas(canvas), data, {
      nodeStyle: (d) => (d.label === hot ? { nodeFill: 'yellow' } : undefined),
    })
    const tree = view.tree
    hot = 'Gamma'
    canvas.ctx.calls.length = 0
    view.draw()
    expect(view.tree).toBe(tree)
    const fills = ops(canvas.ctx, 'fill').map((c) => c.state.fillStyle)
    expect(fills).toEqual(['#ffffff', '#ffffff', '#ffffff', 'yellow', '#ffffff'])
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

