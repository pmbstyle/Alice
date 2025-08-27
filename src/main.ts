import './assets/styles.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router/main.ts'
import { initializeClients } from './services/apiClients'

import App from './App.vue'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// Initialize clients and then mount the app
initializeClients().then(() => {
  console.log('All clients initialized, mounting app')
  app.mount('#app')
}).catch((error) => {
  console.error('Failed to initialize clients, mounting app anyway:', error)
  app.mount('#app')
})
