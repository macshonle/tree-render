import { describe, it, expect } from 'vitest'
import {
  transformNodeDSL,
  validateYamlExample,
  type YamlNodeDSL,
} from './vite-plugin-tree-examples'

describe('transformNodeDSL', () => {
  it('transforms a single root node', () => {
    const nodes: YamlNodeDSL[] = [{ node: 'Root' }]
    const result = transformNodeDSL(nodes)

    expect(result.id).toBe('n1')
    expect(result.label).toBe('Root')
    expect(result.children).toBeUndefined()
  })

  it('transforms a node with children', () => {
    const nodes: YamlNodeDSL[] = [
      {
        node: 'Parent',
        children: [{ node: 'Child 1' }, { node: 'Child 2' }],
      },
    ]
    const result = transformNodeDSL(nodes)

    expect(result.id).toBe('n1')
    expect(result.label).toBe('Parent')
    expect(result.children).toHaveLength(2)
    expect(result.children![0].id).toBe('n2')
    expect(result.children![0].label).toBe('Child 1')
    expect(result.children![1].id).toBe('n3')
    expect(result.children![1].label).toBe('Child 2')
  })

  it('transforms deeply nested nodes', () => {
    const nodes: YamlNodeDSL[] = [
      {
        node: 'Level 1',
        children: [
          {
            node: 'Level 2',
            children: [{ node: 'Level 3' }],
          },
        ],
      },
    ]
    const result = transformNodeDSL(nodes)

    expect(result.label).toBe('Level 1')
    expect(result.children![0].label).toBe('Level 2')
    expect(result.children![0].children![0].label).toBe('Level 3')
    expect(result.children![0].children![0].id).toBe('n3')
  })

  it('uses custom id prefix', () => {
    const nodes: YamlNodeDSL[] = [{ node: 'Root' }]
    const result = transformNodeDSL(nodes, 'custom_')

    expect(result.id).toBe('custom_1')
  })

  it('converts numeric node labels to strings', () => {
    const nodes: YamlNodeDSL[] = [{ node: '123' }]
    const result = transformNodeDSL(nodes)

    expect(result.label).toBe('123')
    expect(typeof result.label).toBe('string')
  })

  it('throws error for empty tree', () => {
    expect(() => transformNodeDSL([])).toThrow('Tree must have at least one root node')
  })

  it('only uses first root when multiple provided', () => {
    const nodes: YamlNodeDSL[] = [{ node: 'First' }, { node: 'Second' }]
    const result = transformNodeDSL(nodes)

    expect(result.label).toBe('First')
    expect(result.children).toBeUndefined()
  })

  it('assigns sequential IDs in depth-first order', () => {
    const nodes: YamlNodeDSL[] = [
      {
        node: 'A',
        children: [{ node: 'B', children: [{ node: 'C' }] }, { node: 'D' }],
      },
    ]
    const result = transformNodeDSL(nodes)

    // A=n1, B=n2, C=n3, D=n4
    expect(result.id).toBe('n1')
    expect(result.children![0].id).toBe('n2')
    expect(result.children![0].children![0].id).toBe('n3')
    expect(result.children![1].id).toBe('n4')
  })
})

describe('validateYamlExample', () => {
  const validExample = {
    id: 'test-tree',
    name: 'Test Tree',
    sizingMode: 'fit-content',
    tree: [{ node: 'Root' }],
  }

  it('validates a correct example', () => {
    const result = validateYamlExample(validExample, 'test.yaml')
    expect(result.id).toBe('test-tree')
    expect(result.name).toBe('Test Tree')
    expect(result.sizingMode).toBe('fit-content')
  })

  it('accepts fixed sizing mode', () => {
    const example = { ...validExample, sizingMode: 'fixed', nodeWidth: 40, nodeHeight: 40 }
    const result = validateYamlExample(example, 'test.yaml')
    expect(result.sizingMode).toBe('fixed')
  })

  it('throws error for null input', () => {
    expect(() => validateYamlExample(null, 'test.yaml')).toThrow('Expected an object at root')
  })

  it('throws error for non-object input', () => {
    expect(() => validateYamlExample('string', 'test.yaml')).toThrow('Expected an object at root')
  })

  it('throws error for missing id', () => {
    const example = { ...validExample, id: undefined }
    expect(() => validateYamlExample(example, 'test.yaml')).toThrow("Missing or invalid 'id'")
  })

  it('throws error for non-string id', () => {
    const example = { ...validExample, id: 123 }
    expect(() => validateYamlExample(example, 'test.yaml')).toThrow("Missing or invalid 'id'")
  })

  it('throws error for missing name', () => {
    const example = { ...validExample, name: undefined }
    expect(() => validateYamlExample(example, 'test.yaml')).toThrow("Missing or invalid 'name'")
  })

  it('throws error for non-string name', () => {
    const example = { ...validExample, name: ['array'] }
    expect(() => validateYamlExample(example, 'test.yaml')).toThrow("Missing or invalid 'name'")
  })

  it('throws error for invalid sizingMode', () => {
    const example = { ...validExample, sizingMode: 'auto' }
    expect(() => validateYamlExample(example, 'test.yaml')).toThrow("Invalid 'sizingMode'")
  })

  it('throws error for missing sizingMode', () => {
    const example = { ...validExample, sizingMode: undefined }
    expect(() => validateYamlExample(example, 'test.yaml')).toThrow("Invalid 'sizingMode'")
  })

  it('throws error for missing tree', () => {
    const example = { ...validExample, tree: undefined }
    expect(() => validateYamlExample(example, 'test.yaml')).toThrow("Missing or invalid 'tree'")
  })

  it('throws error for non-array tree', () => {
    const example = { ...validExample, tree: { node: 'Root' } }
    expect(() => validateYamlExample(example, 'test.yaml')).toThrow("Missing or invalid 'tree'")
  })

  it('includes file path in error messages', () => {
    const example = { ...validExample, id: undefined }
    expect(() => validateYamlExample(example, '/path/to/file.yaml')).toThrow('/path/to/file.yaml')
  })

  it('preserves optional style property', () => {
    const example = {
      ...validExample,
      style: { node: { shape: 'circle' }, edge: { style: 'curve' } },
    }
    const result = validateYamlExample(example, 'test.yaml')
    expect(result.style).toEqual({ node: { shape: 'circle' }, edge: { style: 'curve' } })
  })
})
