import './assets/styles.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router/main.ts'
import { initializeClients } from './services/apiClients'

import App from './App.vue'

const app = createApp(App)

app.use(createPinia())
app.use(router)

initializeClients()

app.mount('#app')
