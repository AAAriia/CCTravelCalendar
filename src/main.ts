import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import App from './App.vue';
import PlannerView from './views/PlannerView.vue';
import BudgetPage from './views/BudgetPage.vue';
import { usePlannerStore } from './stores/planner';
import './styles/base.css';

const app = createApp(App);
app.use(createPinia());

// 数据先于路由加载：'/' 需要依据 lastPlanId 重定向（口径 §9 读取时机）
const store = usePlannerStore();
await store.init();

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: () => `/plan/${store.currentPlanId}` },
    { path: '/plan/:planId', name: 'plan', component: PlannerView },
    { path: '/plan/:planId/budget', name: 'budget', component: BudgetPage },
    { path: '/plan/:planId/map', name: 'map', component: () => import('./views/MapView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

app.use(router);
app.mount('#app');
