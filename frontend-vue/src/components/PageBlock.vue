<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    description: string
    headerOutside?: boolean
    showAuthorInfo?: boolean
    authorName?: string
    authorProject?: string
    authorEmail?: string
  }>(),
  {
    headerOutside: false,
    showAuthorInfo: false,
    authorName: 'bobo',
    authorProject: 'AI笔记工作台',
    authorEmail: '2385227304@qq.com',
  },
)
</script>

<template>
  <div class="page-shell">
    <div v-if="headerOutside" class="page-title-outside">
      <h2 class="page-block-title">{{ title }}</h2>
      <p class="page-desc">{{ description }}</p>
    </div>

    <el-card class="page-block" shadow="never">
      <div v-if="!headerOutside" class="page-block-head">
        <h2 class="page-block-title">{{ title }}</h2>
        <p class="page-desc">{{ description }}</p>
      </div>
      <div class="page-block-body" :class="{ 'page-block-body--flush': headerOutside, 'page-block-body--has-author': showAuthorInfo }">
        <slot />
      </div>
    </el-card>

    <div v-if="showAuthorInfo" class="page-author-info">
      <p><span class="author-prefix">作者：</span>{{ authorName }}</p>
      <p><span class="author-prefix">项目：</span>{{ authorProject }}</p>
      <p><span class="author-prefix">邮箱：</span>{{ authorEmail }}</p>
    </div>
  </div>
</template>
