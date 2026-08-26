import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  base: './', // 静态托管友好：相对资源路径（hash 路由无需服务端回退）
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.spec.ts'],
  },
  build: {
    // main.ts 使用顶层 await（等数据加载完成再挂路由）；
    // 界面 CSS 已依赖 color-mix()，浏览器底线本就不低于支持 TLA 的版本
    target: 'es2022',
  },
});
