# tree-render

Tidy tree drawings on a canvas you supply, from one TypeScript file with no dependencies.

[`src/tidy-tree/tidy-tree.ts`](src/tidy-tree/tidy-tree.ts) lays out a tree whose nodes can all be different sizes and draws it with the Canvas 2D API. It depends on no framework: you hand it a canvas and your data, so it can be called from a plain page script or from inside any framework's component.

```js
import { renderTree } from './tidy-tree'

renderTree(document.querySelector('canvas'), {
  label: 'Operations',
  children: [
    { label: 'Ingest', children: [{ label: 'Kafka' }, { label: 'Webhooks' }] },
    { label: 'Storage' },
    { label: 'Reporting' },
  ],
})
```

The rest of the repository is a playground app for trying the layout out. See [This repository](#this-repository).

## What to copy

One file.

| Your project | Copy |
| :--- | :--- |
| TypeScript, or a bundler that compiles it (Vite, esbuild, webpack with a TypeScript loader) | `src/tidy-tree/tidy-tree.ts` |
| Plain JavaScript | `dist-lib/tidy-tree.js` |

There is nothing to install and nothing else to copy. The file has no imports, no stylesheet and no assets. It includes its own [license](#license) notice, so it can be copied alone.

`dist-lib/` is build output and is not checked in. To produce it, run `pnpm install` once and then `pnpm build:lib` (or `make lib`). That compiles the same source to `tidy-tree.js`, about 42 kB before minifying, and writes `tidy-tree.d.ts` beside it. The `.d.ts` is optional: it gives editors the types.

The JavaScript file is a standard ES module targeting ES2020. Load it from a module script, or with a dynamic import from an ordinary one:

```html
<canvas id="tree" style="width: 100%; height: 320px"></canvas>

<script type="module">
  import { renderTree } from './tidy-tree.js'
  renderTree(document.getElementById('tree'), data)
</script>
```

```js
import('./tidy-tree.js').then(({ renderTree }) => renderTree(canvas, data))
```

A TypeScript project needs the `DOM` library, which browser projects have by default.

## Drawing on a canvas

`renderTree(target, data, options)` measures the labels, lays the tree out and draws it. What it does to the canvas depends on what you hand it.

### A canvas element

```js
const view = renderTree(canvas, data)
```

It takes the canvas over:

- It sizes the backing store to the canvas's CSS size times the device pixel ratio, so lines and text stay sharp on high-density screens.
- It clears the canvas before each draw.
- It redraws when the canvas changes size. Pass `autoResize: false` to turn that off.
- It reports clicks through `onNodeClick`.

Give the canvas its size in CSS. The tree is centred, and scaled down if it is too big to fit.

### Part of a canvas you already draw on

```js
const ctx = canvas.getContext('2d')
// ... your own drawing ...
const view = renderTree(ctx, data, { rect: { x: 120, y: 8, width: 400, height: 260 } })
```

Given a 2D context instead of a canvas, it is a guest:

- It never resizes or clears the canvas.
- It draws only inside `rect`, which defaults to the whole canvas.
- It leaves the context's transform, clip and styles as it found them.
- It adds no listeners and watches nothing.

`rect` is in the context's current coordinates. If you have scaled the context by the device pixel ratio, that means CSS pixels.

Because it watches nothing, you tell it when to act:

| When | Call |
| :--- | :--- |
| You have repainted the canvas | `view.draw()` |
| The rectangle or the data changed | `view.update(data, { rect })` |
| You need the node under a click | `view.nodeAt(event.offsetX, event.offsetY)` |
| The pointer moved | `view.hover(node)`, then repaint if it returns true |
| A node was chosen | `view.select(node)`, then repaint if it returns true |

Set `style.background` to have it fill the rectangle first.

### An element, if you have no canvas yet

```js
const view = renderTree(document.getElementById('panel'), data)
```

It creates a canvas inside the element and then behaves as it does for a canvas of yours. Use an empty element kept for this purpose.

- If the element has a height, the canvas covers it. The element is given `position: relative` if it was `static`.
- If the element has no height, the canvas takes the height the tree needs.
- `height: 'fill'` or `height: 'auto'` picks one of those regardless.

`view.destroy()` removes the canvas and puts the element's `position` back.

## Your data

Any tree of objects works. By default:

- A node's children are `data.children`.
- Its label is `data.label`, `data.name`, `data.title` or `data.id`, whichever comes first. A `\n` in a label starts a new line.
- Its box is sized to fit the label.

Each of those can be replaced:

```js
renderTree(canvas, org, {
  children: (person) => person.reports,
  label: (person) => `${person.name}\n${person.role}`,
})
```

Pass `nodeSize` to skip measuring: either one `{ width, height }` for every node or a function of the data.

## Options

Layout:

| Option | Default | What it does |
| :--- | :--- | :--- |
| `direction` | `'down'` | Which way the tree grows: `'down'`, `'up'`, `'right'` or `'left'`. |
| `nodeGap` | `16` | Minimum space between neighbouring nodes across the tree. |
| `levelGap` | `40` | Space between a parent and its children. |
| `layered` | `false` | `true` lines every depth up on a common line. `false` puts children directly below their own parent, which is more compact when heights vary. |
| `symmetric` | `true` | Exact left/right symmetry, at the cost of a second layout pass. |
| `spacing` | none | `(a, b) => gap` for two nodes that face each other, in place of `nodeGap`. For example, tighter gaps between sibling leaves. |
| `children` | `d => d.children` | Child accessor. The input must be a tree, with no cycles. |
| `nodeSize` | measured from the label | One size, or a function of the data. See [Sizing a node](#sizing-a-node). |

Appearance:

| Option | Default | What it does |
| :--- | :--- | :--- |
| `label` | see above | Text for a node. |
| `style` | see below | Fonts, colours, padding and connector shape for the whole tree. |
| `nodeStyle` | none | Style for one node. See [Styling individual nodes](#styling-individual-nodes). |
| `linkStyle` | none | Style for one connector. See [Connectors](#connectors). |
| `drawNode` | none | Your own node painter. See [Custom nodes](#custom-nodes). |
| `restoreContext` | `true` | Save and restore the context around each `drawNode` call. |
| `clipNodes` | `false` | Confine each `drawNode` call to its node's outline. |
| `fit` | `'scale-down'` | `'scale-down'` shrinks the tree to fit but never enlarges it. `'contain'` also enlarges it. `'none'` draws at 1:1. |
| `margin` | `16` | Space kept free inside the drawing area. |
| `rect` | the whole canvas | Where to draw. |

Interaction and sizing of the canvas, which apply only when it owns the canvas:

| Option | Default | What it does |
| :--- | :--- | :--- |
| `onNodeClick` | none | `(node, event) => …`, with `node` null for empty space. |
| `onNodeHover` | none | `(node, event) => …` when the node under the pointer changes. |
| `selectable` | `false` | A click selects the node under it. |
| `onNodeSelect` | none | `(node, event) => …` when a click changes the selection. |
| `autoResize` | `true` | Redraw on resize. |
| `height` | by the element | `'fill'` or `'auto'`. Only for an element target. |

### Style

`style` overrides any of these:

| Key | Default |
| :--- | :--- |
| `font` | `'13px system-ui, -apple-system, "Segoe UI", sans-serif'` |
| `lineHeight` | `18` |
| `paddingX`, `paddingY` | `12`, `8` |
| `textColor` | `'#0f172a'` |
| `nodeFill`, `nodeStroke` | `'#ffffff'`, `'#475569'` |
| `nodeStrokeWidth`, `nodeRadius` | `1.5`, `6` |
| `edgeStyle` | `'elbow'`; also `'curve'` and `'straight'` |
| `edgeColor`, `edgeWidth` | `'#94a3b8'`, `1.5` |
| `background` | `null`, which leaves what is already there |
| `hover` | `null`: no change. Node keys to apply to the node under the pointer. |
| `selected` | `{ nodeStroke: '#2563eb', nodeStrokeWidth: 3 }`. Node keys to apply to the selected node. |

```js
renderTree(canvas, data, {
  style: { nodeFill: '#1e293b', nodeStroke: '#64748b', textColor: '#f8fafc', edgeStyle: 'curve' },
})
```

Labels are left out when the tree is scaled so small that they would be unreadable.

## What goes in a node

The sections below go from the least work to the most: restyle a node, use the built-in hover and selection, restyle a connector, paint nodes yourself, and choose their size.

### Styling individual nodes

`nodeStyle(data, state)` returns the style keys that differ for one node, or nothing to leave it like the rest.

```js
renderTree(canvas, data, {
  nodeStyle: (d) =>
    d.status === 'down' ? { nodeFill: '#fef2f2', nodeStroke: '#dc2626', textColor: '#991b1b' } : undefined,
})
```

It can set the node keys: `font`, `lineHeight`, `paddingX`, `paddingY`, `textColor`, `nodeFill`, `nodeStroke`, `nodeStrokeWidth` and `nodeRadius`.

It is called on every draw, so it can follow anything you keep track of. Change what it returns and call `view.draw()`. A change of `font`, `lineHeight` or padding changes the size of the node, so that needs `view.update()` instead.

### Hover and selection

For a canvas it owns, the view tracks two states itself:

| State | How it is set | Built-in look |
| :--- | :--- | :--- |
| hovered | The pointer is over the node. | None until you set `style.hover`. |
| selected | With `selectable: true`, a click on the node. A click on empty space clears it. | A heavier blue border. Change it with `style.selected`, or set that to `null`. |

```js
const view = renderTree(canvas, data, {
  selectable: true,
  style: { hover: { nodeFill: '#e0f2fe' } },
  onNodeSelect: (node) => showDetails(node ? node.data : null),
})
```

Both states reach everything that decides how things look:

- `nodeStyle(data, state)` and `linkStyle(node, state)` get `state.hovered` and `state.selected`.
- `drawNode` gets `hovered` and `selected` in its last argument.
- `style.selected` and then `style.hover` are applied on top of what `nodeStyle` returns.

Around those:

- `view.hovered` and `view.selected` are the nodes, or null.
- `view.select(node)` and `view.hover(node)` set them from your own code. They return whether anything changed, and do not call the handlers.
- `onNodeHover` and `onNodeSelect` run before the redraw, so anything they set is in the picture.
- The cursor becomes a pointer over a node when a click would do something: with `onNodeClick` or `selectable`.
- Sizes are measured with neither state set, so hovering and selecting never move anything.
- After `update`, both states stay with the same data object. If that object is no longer in the tree, the state is cleared.

As a guest in your canvas it listens to nothing, so pass the pointer on:

```js
canvas.addEventListener('mousemove', (event) => {
  if (view.hover(view.nodeAt(event.offsetX, event.offsetY))) repaintMyCanvas()
})
```

### Connectors

`linkStyle(node, state)` styles the connector that leads to `node` from its parent. It can return `edgeColor`, `edgeWidth` and `edgeStyle`. Connectors with a style of their own are drawn over the others.

This highlights the path from the root to the selected node:

```js
let path = new Set()

renderTree(canvas, data, {
  selectable: true,
  onNodeSelect(node) {
    path = new Set()
    for (let n = node; n; n = n.parent) path.add(n.data)
  },
  linkStyle: (node) => (path.has(node.data) ? { edgeColor: '#2563eb', edgeWidth: 3 } : undefined),
})
```

Connectors always attach to the middle of a box's sides.

### Custom nodes

`drawNode(ctx, node, style, drawing)` is called for every node in place of the built-in painter. It is called in layout coordinates, so the node's box is at `node.x`, `node.y` and is `node.width` × `node.height`. Inside it you can draw anything a canvas can, driven by `node.data`.

`drawing` holds what else a painter needs:

| Member | What it is |
| :--- | :--- |
| `paint()` | Draws the built-in box and label for this node. `paint({ nodeFill: '#fde68a' })` changes those keys for this call only. |
| `hovered`, `selected` | The node's state. |
| `scale` | How much the tree is scaled on the canvas; 1 is full size. |

Call `paint()` and then draw on top to add to the standard look:

```js
renderTree(canvas, data, {
  drawNode(ctx, node, style, { paint }) {
    paint()
    if (!node.data.alerts) return
    ctx.beginPath()
    ctx.arc(node.x + node.width, node.y, 8, 0, Math.PI * 2)
    ctx.fillStyle = '#dc2626'
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(String(node.data.alerts), node.x + node.width, node.y)
  },
})
```

Or call it only for the nodes you have nothing special for:

```js
drawNode(ctx, node, style, { paint }) {
  if (!node.data.photo) return paint()
  ctx.drawImage(node.data.photo, node.x, node.y, node.width, node.height)
}
```

Leave it out to replace the look entirely.

What a painter can rely on:

- `style` is the node's own style: the tree's, with `nodeStyle` and the hover and selected looks applied.
- The context arrives with the node's font, centred text and a middle baseline.

Two flags decide how far a painter is fenced in:

| Flag | Default | Effect |
| :--- | :--- | :--- |
| `restoreContext` | `true` | The context is saved before each call and restored after, so nothing a painter changes reaches the next node. Turn it off for a painter that cleans up after itself, or to carry state from node to node on purpose. |
| `clipNodes` | `false` | Each call is clipped to the node's outline: its box with rounded corners, border included. Off by default so that a badge or a shadow can extend past the box. Clipping always saves and restores. |

### Sizing a node

A node is as big as its label plus padding unless `nodeSize` says otherwise. Give one `{ width, height }` for every node, or a function of the data.

The function also gets `measure`, which returns the box the label needs in that node's style. Use it for a box that is the label and something more:

```js
renderTree(canvas, tasks, {
  nodeSize(task, measure) {
    const box = measure()
    return { width: Math.max(box.width, 80), height: box.height + 10 }
  },
  drawNode(ctx, node, style, { paint }) {
    paint()
    // A progress bar under the label.
    ctx.fillStyle = '#22c55e'
    ctx.fillRect(node.x + 6, node.y + node.height - 10, (node.width - 12) * node.data.done, 4)
  },
})
```

`measure('other text')` measures that text instead, and `measure(undefined, { font: … })` measures with those style keys changed.

A fixed size suits painters that ignore the label:

```js
renderTree(canvas, data, {
  nodeSize: { width: 48, height: 48 },
  drawNode(ctx, node) {
    ctx.beginPath()
    ctx.arc(node.x + 24, node.y + 24, 24, 0, Math.PI * 2)
    ctx.fillStyle = node.data.colour
    ctx.fill()
  },
})
```

### HTML in a node

A canvas cannot hold HTML, so links, inputs and rich text have to be real elements placed over or instead of the canvas. `view.tree.nodes` gives each node's box and `view.transform` maps it to canvas pixels, which is enough to position your own elements. To skip the canvas altogether, use the [layout on its own](#layout-only).

## The view

`renderTree` returns a handle:

| Member | What it is |
| :--- | :--- |
| `update(data?, options?)` | Lay out and draw again, with new data, changed options, or both. |
| `draw()` | Draw again without laying out. |
| `nodeAt(x, y)` | The node at a canvas position such as `event.offsetX`, `event.offsetY`, or null. |
| `hovered`, `selected` | The node under the pointer and the selected node, or null. |
| `hover(node)`, `select(node)` | Set them yourself. Each returns whether anything changed, and redraws if it owns the canvas. |
| `tree` | The current layout: `tree.nodes`, `tree.width`, `tree.height`. |
| `transform` | `{ scale, x, y }` from the last draw: canvas = layout × `scale` + (`x`, `y`). |
| `canvas` | The canvas being drawn on. |
| `destroy()` | Stop listening and observing, and remove the canvas if it created one. |

`update` merges options key by key, so pass a complete `style` object when you change one.

## Layout only

The first half of the file is the layout on its own. It never touches the DOM, so it also runs in Node. Use it to draw with SVG, DOM elements, WebGL or your own canvas code.

```js
import { tidyTree, linkTo } from './tidy-tree'

const tree = tidyTree(root, {
  nodeSize: (d) => ({ width: d.w, height: d.h }),
  nodeGap: 16,
  levelGap: 40,
})

tree.width, tree.height            // size of the drawing; boxes span (0,0)–(width,height)
for (const node of tree.nodes) {   // breadth-first, root first
  node.x, node.y                   // top-left corner
  node.width, node.height
  node.data                        // your original object
  node.parent, node.children, node.depth
  linkTo(node, tree.direction)     // { x1, y1, x2, y2 } connector endpoints, null for the root
}
```

It takes the layout options from the table above. Without `nodeSize`, a node's size is `data.width` × `data.height`, or 80 × 40 if those are missing.

Three more functions work with a layout:

| Function | What it does |
| :--- | :--- |
| `nodeAt(tree, x, y)` | The node under a point in layout coordinates, for clicks and hovers. |
| `drawTree(ctx, tree, options)` | Paints a layout you already have, with the appearance options above plus `hovered` and `selected` nodes. Returns the transform it used. |
| `measureLabel(ctx, text, style)` | The box a label needs, using the context's current font. |

## What the layout guarantees

- No two nodes overlap. Nodes that come within `levelGap` of each other along the depth axis are kept at least `nodeGap` apart across it.
- The strip of `levelGap` in front of each row of children is clear of every other subtree, so connectors routed through it never cross a foreign node. The built-in connectors are all routed that way.
- A parent is centred over the span from its first child's leading edge to its last child's trailing edge.
- Children keep their order, and identical subtrees are drawn identically.
- With `symmetric`, mirroring the tree mirrors the drawing.
- Zero, negative, `NaN` and infinite sizes are treated as zero rather than corrupting the result.

## How it works

The core is van der Ploeg's algorithm from "Drawing Non-layered Tidy Trees in Linear Time" (2014), the successor to Reingold–Tilford, Walker and Buchheim et al. for nodes of different sizes. It runs in time and memory proportional to the number of nodes. This implementation keeps the tree in flat typed arrays in breadth-first order and does not recurse, so depth is limited only by memory.

Symmetry comes from running the same pass on the mirrored tree and averaging the two results. Every condition a valid layout must meet is a linear constraint, so the average of two valid layouts is valid.

Rough layout timings on a laptop: 10,000 nodes in 2 ms, 100,000 in 20 ms, 1,000,000 in 350 ms. With `symmetric: false` it takes about 40% of that.

## This repository

Besides the drop-in file, the repository holds a playground: a Vue 3 app for trying layouts, node shapes and connector styles on example trees. You do not need any of it to use `tidy-tree.ts`.

| Path | What it is |
| :--- | :--- |
| `src/tidy-tree/tidy-tree.ts` | The drop-in file. |
| `src/tidy-tree/demo.html` | A demo of it in plain JavaScript: all three kinds of target, node styles, hover and selection, a custom painter, and a 400-node tree. |
| `src/tidy-tree/*.test.ts` | Its tests. |
| everything else under `src/` | The playground app. [docs/vue-tutorial.md](docs/vue-tutorial.md) walks through its code. |

| Command | What it does |
| :--- | :--- |
| `pnpm install` | Install the development tools. |
| `pnpm dev` | Serve the playground. The demo is at `/src/tidy-tree/demo.html` on the same address. |
| `pnpm build:lib` | Compile the drop-in file to `dist-lib/tidy-tree.js` and `tidy-tree.d.ts`. |
| `pnpm test` | Run the tests. |
| `pnpm build` | Type-check and build the playground. |
| `pnpm lint` | Lint. |

The layout tests check the guarantees above by brute force over every pair of nodes on a few thousand random trees, with a checker that shares no code with the implementation. They also cover symmetry, every direction, layering, hostile input, a 200,000-node chain and linear scaling. The canvas tests run against stand-in canvas objects and check what each kind of target does and does not touch.

## License

[MIT License](LICENSE). Copyright (c) 2025-2026 Macneil Shonle.

The drop-in file ends with the full notice, so a copy of that one file meets the terms without anything else.
