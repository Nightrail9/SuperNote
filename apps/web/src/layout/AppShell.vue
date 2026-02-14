<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { appMenu } from '../router'

const route = useRoute()

const selectedKey = computed(() => {
  if (route.path.startsWith('/create/bilibili/generate')) return '/create/bilibili'
  if (route.path.startsWith('/create/web/generate')) return '/create/web'
  if (route.path.startsWith('/create/generate')) return '/create/bilibili'
  return route.path
})
const openedMenus = computed(() => {
  if (route.path.startsWith('/history')) return ['history']
  if (route.path.startsWith('/settings')) return ['settings']
  return ['create']
})
</script>

<template>
  <el-container class="app-layout">
    <el-aside class="app-sider" width="264px">
      <div class="brand-block">
        <h1 class="brand-title">SuperNote</h1>
        <p class="brand-subtitle">AI笔记工作台</p>
        <p class="brand-subtitle aux">Timeline Craft Workspace</p>
        <div class="brand-chip">Paper Studio</div>
      </div>
      <el-menu :default-openeds="openedMenus" :default-active="selectedKey" class="app-menu" router>
        <template v-for="item in appMenu" :key="item.key">
          <el-sub-menu v-if="item.children" :index="item.key">
            <template #title>
              <el-icon><component :is="item.icon" /></el-icon>
              <span>{{ item.label }}</span>
            </template>
            <el-menu-item v-for="child in item.children" :key="child.key" :index="child.path">
              <el-icon><component :is="child.icon" /></el-icon>
              <span>{{ child.label }}</span>
            </el-menu-item>
          </el-sub-menu>
          <el-menu-item v-else :index="item.path">
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </el-menu-item>
        </template>
      </el-menu>
    </el-aside>

    <el-main class="app-content">
      <div class="app-content-inner">
        <div class="app-route-frame">
          <router-view v-slot="{ Component, route: currentRoute }">
            <transition name="route-fade" mode="out-in">
              <component :is="Component" :key="currentRoute.fullPath.split('#')[0]" />
            </transition>
          </router-view>
        </div>
      </div>
    </el-main>
  </el-container>
</template>
