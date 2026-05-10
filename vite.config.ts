import { defineConfig } from 'vite'

// GitHub Pages публикует сайт в подпапке репозитория.
// Относительный base делает сборку переносимой и убирает 404 на ассеты.
export default defineConfig({
  base: '/chess/',
})

