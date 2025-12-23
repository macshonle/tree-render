import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import App from './App.vue'
import './styles/main.scss'

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'system',
    themes: {
      light: {
        dark: false,
        colors: {
          background: '#f5f5f5',
          surface: '#e0e0e0',
          'surface-variant': '#d0d0d0',
          primary: '#616161',
          secondary: '#9e9e9e',
          accent: '#757575',
        }
      },
      dark: {
        dark: true,
        colors: {
          background: '#1a1a1a',
          surface: '#2d2d2d',
          'surface-variant': '#3d3d3d',
          primary: '#9e9e9e',
          secondary: '#757575',
          accent: '#bdbdbd',
        }
      },
      system: {
        dark: window.matchMedia('(prefers-color-scheme: dark)').matches,
        colors: window.matchMedia('(prefers-color-scheme: dark)').matches
          ? {
              background: '#1a1a1a',
              surface: '#2d2d2d',
              'surface-variant': '#3d3d3d',
              primary: '#9e9e9e',
              secondary: '#757575',
              accent: '#bdbdbd',
            }
          : {
              background: '#f5f5f5',
              surface: '#e0e0e0',
              'surface-variant': '#d0d0d0',
              primary: '#616161',
              secondary: '#9e9e9e',
              accent: '#757575',
            }
      }
    }
  }
})

const app = createApp(App)
app.use(vuetify)
app.mount('#app')
