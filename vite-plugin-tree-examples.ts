/**
 * Vite Plugin: Tree Examples
 *
 * Transforms .tree.yaml files into TreeExample modules at build time.
 *
 * The YAML format uses a fluent notation for tree nodes:
 *
 * ```yaml
 * id: my-tree
 * name: My Tree
 * sizingMode: fixed
 * nodeWidth: 40
 * nodeHeight: 40
 * style:
 *   node: { shape: circle }
 *   edge: { style: straight-arrow }
 * tree:
 *   - node: Root
 *     children:
 *       - node: Child 1
 *       - node: Child 2
 * ```
 *
 * The plugin transforms the `tree` property into a proper `root` TreeNode
 * structure with auto-generated IDs.
 */

import type { Plugin } from 'vite'
import YAML from 'yaml'

// Types matching src/types/index.ts
interface TreeNode {
  id: string
  label: string
  children?: TreeNode[]
}

interface YamlNodeDSL {
  node: string
  children?: YamlNodeDSL[]
}

interface YamlTreeExample {
  id: string
  name: string
  sizingMode: 'fit-content' | 'fixed'
  nodeWidth?: number
  nodeHeight?: number
  style?: {
    node?: { shape?: string }
    edge?: { style?: string }
  }
  tree: YamlNodeDSL[]
}

/**
 * Transform the fluent YAML node DSL into TreeNode objects
 */
function transformNodeDSL(nodes: YamlNodeDSL[], idPrefix: string = 'n'): TreeNode {
  let idCounter = 0

  function transform(node: YamlNodeDSL): TreeNode {
    const id = `${idPrefix}${++idCounter}`
    const result: TreeNode = {
      id,
      label: String(node.node), // Ensure label is a string (handles numbers)
    }

    if (node.children && node.children.length > 0) {
      result.children = node.children.map((child) => transform(child))
    }

    return result
  }

  // The YAML tree is an array but we expect a single root
  // Take the first element as the root
  if (nodes.length === 0) {
    throw new Error('Tree must have at least one root node')
  }

  // If multiple root nodes are provided, only the first is used
  return transform(nodes[0])
}

/**
 * Validate the YAML structure
 */
function validateYamlExample(parsed: unknown, filePath: string): YamlTreeExample {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${filePath}: Expected an object at root`)
  }

  const obj = parsed as Record<string, unknown>

  if (typeof obj.id !== 'string') {
    throw new Error(`${filePath}: Missing or invalid 'id' (expected string)`)
  }

  if (typeof obj.name !== 'string') {
    throw new Error(`${filePath}: Missing or invalid 'name' (expected string)`)
  }

  if (obj.sizingMode !== 'fit-content' && obj.sizingMode !== 'fixed') {
    throw new Error(`${filePath}: Invalid 'sizingMode' (expected 'fit-content' or 'fixed')`)
  }

  if (!Array.isArray(obj.tree)) {
    throw new Error(`${filePath}: Missing or invalid 'tree' (expected array)`)
  }

  return obj as unknown as YamlTreeExample
}

export default function treeExamplesPlugin(): Plugin {
  return {
    name: 'vite-plugin-tree-examples',

    transform(code: string, id: string) {
      // Only process .tree.yaml files
      if (!id.endsWith('.tree.yaml')) {
        return null
      }

      try {
        // Parse YAML
        const parsed = YAML.parse(code)

        // Validate structure
        const yamlExample = validateYamlExample(parsed, id)

        // Transform the tree DSL into TreeNode structure
        const root = transformNodeDSL(yamlExample.tree)

        // Build the final TreeExample object
        const treeExample = {
          id: yamlExample.id,
          name: yamlExample.name,
          sizingMode: yamlExample.sizingMode,
          ...(yamlExample.nodeWidth !== undefined && { nodeWidth: yamlExample.nodeWidth }),
          ...(yamlExample.nodeHeight !== undefined && { nodeHeight: yamlExample.nodeHeight }),
          ...(yamlExample.style && { style: yamlExample.style }),
          root,
        }

        // Return as ES module
        return {
          code: `export default ${JSON.stringify(treeExample, null, 2)}`,
          map: null,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.error(`Failed to process tree example ${id}: ${message}`)
      }
    },
  }
}
