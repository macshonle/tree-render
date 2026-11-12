# tidy-tree

Tidy layout for general trees whose nodes have different widths and heights.
Framework-free TypeScript that you can copy into another project.

| File | What it is | Depends on |
| :--- | :--- | :--- |
| `tidy-tree.ts` | The layout. Positions only: no DOM, no canvas. | nothing |
| `tidy-tree-canvas.ts` | Optional Canvas 2D renderer: measure labels, lay out, draw. | `tidy-tree.ts` |

Take just the first file if you draw with SVG, DOM elements, WebGL or your own
canvas code. Take both for a one-call canvas tree.

For projects without a TypeScript toolchain, `pnpm build:lib` (or `make lib`)
compiles both to plain ES modules with type declarations in `dist-lib/`. The
output runs unmodified in a browser `<script type="module">` and in Node.

`demo.html` shows everything below working in plain JavaScript. Run `pnpm dev`
and open `/src/tidy-tree/demo.html`.

## Layout only

```ts
import { tidyTree, linkTo } from './tidy-tree'

const tree = tidyTree(root, {
  children: (d) => d.children,                       // default
  nodeSize: (d) => ({ width: d.w, height: d.h }),    // or one fixed { width, height }
  nodeGap: 16,                                       // between neighbours
  levelGap: 40,                                      // between parent and children
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

Options:

| Option | Default | |
| :--- | :--- | :--- |
| `children` | `d => d.children` | Child accessor. The input must be a tree (no cycles). |
| `nodeSize` | `d.width` × `d.height`, else 80 × 40 | One size, or a function of the data. |
| `nodeGap` | `16` | Minimum space between neighbouring nodes across the tree. |
| `levelGap` | `40` | Space between a parent and its children. |
| `spacing` | — | `(a, b) => gap` override for two nodes that face each other, e.g. tighter gaps between sibling leaves. |
| `direction` | `'down'` | `'down'`, `'up'`, `'right'` or `'left'`. |
| `layered` | `false` | `true` lines every depth up on a common line. `false` puts children directly below their own parent, which is more compact when heights vary. |
| `symmetric` | `true` | Exact left/right symmetry, at the cost of a second pass. |

`nodeAt(tree, x, y)` returns the node under a point, for clicks and hovers.

## Canvas

```ts
import { renderTree } from './tidy-tree-canvas'

// 1. Hand it an element. It creates and manages a canvas inside it.
//    If the element has a height the canvas covers it; if not, the canvas
//    takes the height the tree needs.
const view = renderTree(document.getElementById('panel'), data)

// 2. Hand it a canvas element to take over.
renderTree(canvas, data, { direction: 'right', style: { edgeStyle: 'curve' } })

// 3. Hand it a 2D context to draw as a guest inside part of your own canvas.
//    It never resizes or clears the canvas, clips to `rect`, and restores
//    the context state.
renderTree(ctx, data, { rect: { x: 120, y: 8, width: 400, height: 260 } })
```

In the first two cases it sizes the backing store for the device pixel ratio
and redraws when the element resizes. In all three, node sizes come from
measuring `label(data)` (default: `data.label`, `name`, `title` or `id`;
`\n` breaks lines) unless you pass `nodeSize`.

The returned view has `update(data?, options?)`, `draw()`, `nodeAt(x, y)`
(canvas coordinates, e.g. `event.offsetX/Y`), `tree`, `transform` and
`destroy()`. Rendering options on top of the layout options: `label`,
`style` (font, colours, padding, `edgeStyle: 'elbow' | 'curve' | 'straight'`,
`background`), `rect`, `margin`, `fit: 'scale-down' | 'contain' | 'none'`,
`drawNode` (custom node painter), `onNodeClick`, `autoResize`, `height`.

If you already have a layout, `drawTree(ctx, tree, options)` paints it and
`measureLabel(ctx, text, style)` sizes a label.

## What the layout guarantees

- No two nodes overlap. Nodes that come within `levelGap` of each other along
  the depth axis are kept at least `nodeGap` apart across it.
- The strip of `levelGap` in front of each row of children is clear of every
  other subtree, so connectors routed through it never cross a foreign node.
  The canvas renderer routes all three connector styles that way.
- A parent is centred over the span from its first child's leading edge to
  its last child's trailing edge.
- Children keep their order, and identical subtrees are drawn identically.
- With `symmetric`, mirroring the tree mirrors the drawing.
- Zero, negative, `NaN` and infinite sizes are treated as zero rather than
  corrupting the result.

## Algorithm

The core is van der Ploeg's non-layered tidy tree algorithm ("Drawing
Non-layered Tidy Trees in Linear Time", 2014), the variable-node-size
successor to Reingold–Tilford, Walker and Buchheim et al. It runs in O(n)
time and memory. This implementation stores the tree in flat typed arrays in
breadth-first order and does not recurse, so depth is limited only by memory.

Symmetry comes from running the same pass on the mirrored tree and averaging
the two results. Every condition a valid layout must meet is a linear
constraint, so the average of two valid layouts is valid, and it is no wider
than the mean of the two.

Rough timings on a laptop: 10,000 nodes in 2 ms, 100,000 in 20 ms, 1,000,000
in 350 ms (about 40% of that with `symmetric: false`).

## Tests

`tidy-tree.test.ts` checks the guarantees above by brute force over all pairs
of nodes on a few thousand random trees, with a checker that shares no code
with the implementation, and covers symmetry, directions, layering, hostile
input, a 200,000-node chain and linear scaling.
