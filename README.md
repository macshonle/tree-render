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

There is nothing to install and nothing else to copy. The file has no imports, no stylesheet and no assets.

`dist-lib/` is build output and is not checked in. To produce it, run `pnpm install` once and then `pnpm build:lib` (or `make lib`). That compiles the same source to `tidy-tree.js`, about 33 kB before minifying, and writes `tidy-tree.d.ts` beside it. The `.d.ts` is optional: it gives editors the types.

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

| Option | Default | What it does |
| :--- | :--- | :--- |
| `direction` | `'down'` | Which way the tree grows: `'down'`, `'up'`, `'right'` or `'left'`. |
| `nodeGap` | `16` | Minimum space between neighbouring nodes across the tree. |
| `levelGap` | `40` | Space between a parent and its children. |
| `layered` | `false` | `true` lines every depth up on a common line. `false` puts children directly below their own parent, which is more compact when heights vary. |
| `symmetric` | `true` | Exact left/right symmetry, at the cost of a second layout pass. |
| `spacing` | none | `(a, b) => gap` for two nodes that face each other, in place of `nodeGap`. For example, tighter gaps between sibling leaves. |
| `children` | `d => d.children` | Child accessor. The input must be a tree, with no cycles. |
| `label` | see above | Text for a node. |
| `nodeSize` | measured from the label | One size, or a function of the data. |
| `style` | see below | Fonts, colours, padding and connector shape. |
| `fit` | `'scale-down'` | `'scale-down'` shrinks the tree to fit but never enlarges it. `'contain'` also enlarges it. `'none'` draws at 1:1. |
| `margin` | `16` | Space kept free inside the drawing area. |
| `rect` | the whole canvas | Where to draw. |
| `drawNode` | none | Your own node painter. See [Custom nodes](#custom-nodes). |
| `onNodeClick` | none | `(node, event) => …`, with `node` null for empty space. Only when it owns the canvas. |
| `autoResize` | `true` | Redraw on resize. Only when it owns the canvas. |
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

```js
renderTree(canvas, data, {
  style: { nodeFill: '#1e293b', nodeStroke: '#64748b', textColor: '#f8fafc', edgeStyle: 'curve' },
})
```

Labels are left out when the tree is scaled so small that they would be unreadable.

### Custom nodes

`drawNode(ctx, node, style)` replaces the built-in box and label. It is called in layout coordinates, so draw at `node.x`, `node.y` with `node.width` × `node.height`. Connectors are still drawn for you, to the middle of each box's sides.

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

Inside it you can draw anything a canvas can, driven by `node.data`: images, icons, several fonts, a different colour for each node. Its limits:

- It is all or nothing. Once set it paints every node, and the built-in painter is not available to call for the ones you would have left alone.
- The `style` option is one style for the whole tree. A per-node colour or font means a `drawNode`.
- You supply the size, through `nodeSize`, whenever the box should be anything other than its label plus padding.
- Nothing is clipped to the box, and the context is not saved and restored around each call. Undo any transform, clip or alpha you set.
- It is not told about hover or selection. Keep that state yourself, read it in `drawNode`, and call `view.draw()` when it changes.
- Connectors cannot be customised per edge.

A canvas cannot hold HTML. For nodes that are real elements, such as links, inputs or rich text, use the [layout on its own](#layout-only) and position your elements from it.

## The view

`renderTree` returns a handle:

| Member | What it is |
| :--- | :--- |
| `update(data?, options?)` | Lay out and draw again, with new data, changed options, or both. |
| `draw()` | Draw again without laying out. |
| `nodeAt(x, y)` | The node at a canvas position such as `event.offsetX`, `event.offsetY`, or null. |
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
| `drawTree(ctx, tree, options)` | Paints a layout you already have. Returns the transform it used. |
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
| `src/tidy-tree/demo.html` | A demo of it in plain JavaScript: all three kinds of target, and a 400-node tree. |
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
