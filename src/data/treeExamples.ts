import type { TreeExample, TreeNode } from '@/types'

// Helper to generate unique IDs
let idCounter = 0
function makeId(): string {
  return `n${++idCounter}`
}

function node(label: string, children: TreeNode[] = []): TreeNode {
  return { id: makeId(), label, children }
}

// Reset ID counter for consistent IDs
function resetIds() {
  idCounter = 0
}

// --- From chatgpt-tree.html ---

function orgChartDepartments(): TreeNode {
  resetIds()
  return node('Root\n(CEO)', [
    node('A: Policy &\nCompliance', [
      node('A1', [
        node('A1.a Long Label'),
        node('A1.b'),
      ]),
      node('A2', [
        node('A2.a\nnotes', [
          node('A2.a.i'),
          node('A2.a.ii'),
        ]),
      ]),
    ]),
    node('B: Engineering', [
      node('B1 Platform\n(SLOs)', [
        node('B1.a Build'),
        node('B1.b Deploy'),
        node('B1.c Observe'),
      ]),
      node('B2\nDev Experience', [
        node('B2.a IDE'),
        node('B2.b Docs'),
      ]),
    ]),
    node('C: Sales &\nMarketing', [
      node('C1 Field\nTeam'),
      node('C2 Growth', [
        node('C2.a'),
        node('C2.b'),
        node('C2.c'),
        node('C2.d'),
      ]),
    ]),
  ])
}

function orgChartMedia(): TreeNode {
  resetIds()
  return node('Scene Graph', [
    node('Group Alpha', [
      node('Leaf A'),
      node('Leaf B\nTall\nText'),
    ]),
    node('UI Layer', [
      node('Button\nPrimary', [
        node('Icon'),
        node('Label'),
      ]),
    ]),
    node('Sidebar', [
      node('Nav Item 1'),
      node('Nav Item 2'),
    ]),
  ])
}

function orgChartWide(): TreeNode {
  resetIds()
  return node('Root\ncomb + fan-out', [
    node('Deep Chain', [
      node('d1', [
        node('d2 Wide Label Here', [
          node('d3\nvery tall\nline3', [
            node('d4', [
              node('d5 end'),
            ]),
          ]),
        ]),
      ]),
    ]),
    node('Middle\nSpacer', [
      node('m1'),
      node('m2'),
    ]),
    node('Fan-out', [
      node('Child 0'),
      node('Child 1'),
      node('Child 2'),
      node('Child 3'),
      node('Child 4'),
    ]),
  ])
}

// --- From tree-drawing.html ---

function binaryTreeNumbered(): TreeNode {
  resetIds()
  return node('1', [
    node('2', [
      node('4'),
      node('5'),
    ]),
    node('3', [
      node('6'),
      node('7'),
    ]),
  ])
}

function naryTreeLetters(): TreeNode {
  resetIds()
  return node('Root', [
    node('A', [
      node('A1'),
      node('A2'),
      node('A3'),
    ]),
    node('B', [
      node('B1'),
      node('B2'),
    ]),
    node('C', [
      node('C1', [
        node('C1.1'),
        node('C1.2'),
      ]),
      node('C2'),
      node('C3'),
      node('C4'),
    ]),
  ])
}

function fileSystemTree(): TreeNode {
  resetIds()
  return node('/', [
    node('home', [
      node('user1', [
        node('documents'),
        node('pictures'),
        node('downloads', [
          node('file1.pdf'),
          node('file2.jpg'),
        ]),
      ]),
      node('user2', [
        node('projects'),
        node('music', [
          node('song1.mp3'),
          node('song2.mp3'),
          node('song3.mp3'),
        ]),
      ]),
    ]),
    node('etc', [
      node('config'),
      node('hosts'),
    ]),
    node('var', [
      node('log'),
      node('tmp'),
    ]),
  ])
}

// --- From tree_visualization.html ---

function simpleTree(): TreeNode {
  resetIds()
  return node('A', [
    node('B', [
      node('D'),
      node('E', [
        node('H'),
        node('I'),
      ]),
    ]),
    node('C', [
      node('F', [
        node('J'),
      ]),
      node('G'),
    ]),
  ])
}

function deepTree(): TreeNode {
  resetIds()
  return node('Long Root Label', [
    node('Branch B', [
      node('Depth D', [
        node('H'),
        node('Item I', [
          node('P'),
          node('Q'),
        ]),
      ]),
      node('Element E', [
        node('J'),
        node('K'),
      ]),
    ]),
    node('Category C', [
      node('Factor F', [
        node('L'),
        node('Longer Label M'),
      ]),
      node('Group G', [
        node('N'),
        node('O'),
      ]),
    ]),
  ])
}

export const treeExamples: TreeExample[] = [
  // Org chart style (fit-content)
  {
    id: 'org-chart-departments',
    name: 'Departments',
    sizingMode: 'fit-content',
    root: orgChartDepartments(),
    style: {
      node: { shape: 'rounded-rectangle' },
      edge: { style: 'org-chart' },
    },
  },
  {
    id: 'org-chart-media',
    name: 'Media',
    sizingMode: 'fit-content',
    root: orgChartMedia(),
    style: {
      node: { shape: 'rounded-rectangle' },
      edge: { style: 'curve' },
    },
  },
  {
    id: 'org-chart-wide',
    name: 'Wide and Deep',
    sizingMode: 'fit-content',
    root: orgChartWide(),
    style: {
      node: { shape: 'rounded-rectangle' },
      edge: { style: 'straight-arrow' },
    },
  },
  // CS textbook style (fixed circular nodes)
  {
    id: 'binary-tree',
    name: 'Binary Tree',
    sizingMode: 'fixed',
    nodeWidth: 40,
    nodeHeight: 40,
    root: binaryTreeNumbered(),
    style: {
      node: { shape: 'circle' },
      edge: { style: 'straight-arrow' },
    },
  },
  {
    id: 'nary-tree',
    name: 'General Tree',
    sizingMode: 'fixed',
    nodeWidth: 40,
    nodeHeight: 40,
    root: naryTreeLetters(),
    style: {
      node: { shape: 'ellipse' },
      edge: { style: 'straight-arrow' },
    },
  },
  {
    id: 'file-system',
    name: 'File System Tree',
    sizingMode: 'fixed',
    nodeWidth: 80,
    nodeHeight: 28,
    root: fileSystemTree(),
    style: {
      node: { shape: 'rectangle' },
      edge: { style: 'org-chart' },
    },
  },
  // General trees (fixed rectangles)
  {
    id: 'simple-tree',
    name: 'Simple Tree',
    sizingMode: 'fixed',
    nodeWidth: 60,
    nodeHeight: 28,
    root: simpleTree(),
    style: {
      node: { shape: 'rounded-rectangle' },
      edge: { style: 'straight-arrow' },
    },
  },
  {
    id: 'deep-tree',
    name: 'Deep Tree',
    sizingMode: 'fit-content',
    root: deepTree(),
    style: {
      node: { shape: 'rounded-rectangle' },
      edge: { style: 'org-chart' },
    },
  },
]
