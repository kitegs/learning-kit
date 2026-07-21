import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElIcons from '@element-plus/icons-vue'
import App from './App.vue'
import './styles/global.scss'

const app = createApp(App)
app.use(createPinia())
app.use(ElementPlus)
for (const [k, v] of Object.entries(ElIcons)) app.component(k, v as any)
app.mount('#app')