/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module 'vuetify/styles' {
  const styles: string
  export default styles
}

declare module '@fontsource-variable/ibm-plex-sans'

// Tree example YAML files are transformed by vite-plugin-tree-examples
declare module '*.tree.yaml' {
  import type { TreeExample } from '@/types'
  const example: TreeExample
  export default example
}
