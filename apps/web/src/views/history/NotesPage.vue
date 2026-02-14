<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Delete, Download, Edit, View } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../../api/modules'
import PageBlock from '../../components/PageBlock.vue'
import HistoryResizableTable from '../../components/history/HistoryResizableTable.vue'
import type { Note } from '../../types/domain'
import { formatDateTime } from '../../utils/datetime'
import { buildMarkdownName, downloadMarkdownFile } from '../../utils/markdown'
import { buildPageKeywordQuery, resolveRowIndexById } from '../../utils/list'
import { HISTORY_FIXED_BODY_ROWS, HISTORY_PAGE_SIZE, NOTE_TABLE_COLUMNS, resolveSourceLabel } from './table-config'

const MarkdownPreview = defineAsyncComponent(() => import('../../components/markdown/MarkdownPreview.vue'))
const MarkdownEditor = defineAsyncComponent(() => import('../../components/markdown/MarkdownEditor.vue'))

const route = useRoute()
const router = useRouter()
const FIXED_PAGE_SIZE = HISTORY_PAGE_SIZE

const loading = ref(false)
const items = ref<Note[]>([])
const total = ref(0)
const searchInput = ref('')

const previewOpen = ref(false)
const editingOpen = ref(false)
const activePreviewNote = ref<Note | null>(null)
const activePreviewIndex = ref(-1)
const previewLoading = ref(false)
const activeEditNoteId = ref<string | null>(null)
const activeEditIndex = ref(-1)
const editLoading = ref(false)
const editTitle = ref('')
const editMarkdown = ref('')
const saveLoading = ref(false)

const canPreviewPrev = computed(() => activePreviewIndex.value > 0)
const canPreviewNext = computed(() => activePreviewIndex.value >= 0 && activePreviewIndex.value < items.value.length - 1)
const canEditPrev = computed(() => activeEditIndex.value > 0)
const canEditNext = computed(() => activeEditIndex.value >= 0 && activeEditIndex.value < items.value.length - 1)

const page = computed(() => {
  const value = Number(route.query.page)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1
})
const pageSize = computed(() => FIXED_PAGE_SIZE)
const keyword = computed(() => (typeof route.query.keyword === 'string' ? route.query.keyword : ''))

const tableColumns = NOTE_TABLE_COLUMNS

function updateQuery(patch: { page?: number; pageSize?: number; keyword?: string }) {
  const next = buildPageKeywordQuery(route.query as Record<string, unknown>, { page: page.value, keyword: keyword.value }, patch)
  void router.replace({ query: next })
}

function handlePageChange(nextPage: number) {
  updateQuery({ page: nextPage })
}

async function loadNotes() {
  loading.value = true
  try {
    const response = await api.listNotes({ page: page.value, pageSize: pageSize.value, keyword: keyword.value || undefined })
    items.value = response.data.items
    total.value = response.data.total
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '加载笔记失败')
  } finally {
    loading.value = false
  }
}

async function loadPreviewByIndex(index: number) {
  const target = items.value[index]
  if (!target) return

  previewLoading.value = true
  try {
    const detail = await api.getNote(target.id)
    activePreviewNote.value = detail.data
    activePreviewIndex.value = index
    previewOpen.value = true
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '获取详情失败')
  } finally {
    previewLoading.value = false
  }
}

async function openPreview(index: number, id: string) {
  const resolvedIndex = resolveRowIndexById(items.value, index, id)
  if (resolvedIndex < 0) return
  await loadPreviewByIndex(resolvedIndex)
}

async function previewPrev() {
  if (!canPreviewPrev.value) return
  await loadPreviewByIndex(activePreviewIndex.value - 1)
}

async function previewNext() {
  if (!canPreviewNext.value) return
  await loadPreviewByIndex(activePreviewIndex.value + 1)
}

function closePreview() {
  previewOpen.value = false
  activePreviewIndex.value = -1
  activePreviewNote.value = null
}

async function loadEditByIndex(index: number) {
  const target = items.value[index]
  if (!target) return

  editLoading.value = true
  try {
    const detail = await api.getNote(target.id)
    activeEditNoteId.value = detail.data.id
    activeEditIndex.value = index
    editTitle.value = detail.data.title
    editMarkdown.value = detail.data.contentMd
    editingOpen.value = true
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '获取详情失败')
  } finally {
    editLoading.value = false
  }
}

async function openEdit(index: number, id: string) {
  const resolvedIndex = resolveRowIndexById(items.value, index, id)
  if (resolvedIndex < 0) return
  await loadEditByIndex(resolvedIndex)
}

async function editPrev() {
  if (!canEditPrev.value || saveLoading.value) return
  await loadEditByIndex(activeEditIndex.value - 1)
}

async function editNext() {
  if (!canEditNext.value || saveLoading.value) return
  await loadEditByIndex(activeEditIndex.value + 1)
}

function closeEdit() {
  editingOpen.value = false
  activeEditNoteId.value = null
  activeEditIndex.value = -1
  editTitle.value = ''
  editMarkdown.value = ''
}

async function downloadNoteMarkdown(id: string) {
  try {
    const detail = await api.getNote(id)
    downloadMarkdownFile(detail.data.contentMd ?? '', buildMarkdownName(detail.data.title))
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '下载失败')
  }
}

async function removeNote(id: string) {
  try {
    await ElMessageBox.confirm('确认删除该笔记？', '删除确认', { type: 'warning' })
    await api.deleteNote(id)
    ElMessage.success('笔记已删除')
    await loadNotes()
  } catch {
    return
  }
}

async function saveEdit() {
  if (!activeEditNoteId.value) return
  saveLoading.value = true
  try {
    await api.updateNote(activeEditNoteId.value, {
      title: editTitle.value.trim() || undefined,
      contentMd: editMarkdown.value,
    })
    editingOpen.value = false
    ElMessage.success('笔记已更新')
    await loadNotes()
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '更新失败')
  } finally {
    saveLoading.value = false
  }
}

onMounted(() => {
  searchInput.value = keyword.value
  void loadNotes()
})
</script>

<template>
  <PageBlock title="历史笔记" description="支持查询、预览、编辑、下载和删除" header-outside show-author-info>
    <div class="page-toolbar">
      <el-space>
        <el-text tag="strong">搜索笔记</el-text>
        <el-input v-model="searchInput" class="search-input" placeholder="搜索标题或关键词..." @keyup.enter="updateQuery({ page: 1, keyword: searchInput })" />
        <el-button @click="updateQuery({ page: 1, keyword: searchInput })">搜索</el-button>
      </el-space>
      <el-button @click="updateQuery({ page: 1, keyword: '' })">重置</el-button>
    </div>

    <div class="panel-stats">
      <el-tag type="info" effect="dark">总笔记 {{ total }}</el-tag>
      <el-tag effect="plain">第 {{ page }} 页 / 每页 {{ pageSize }} 条</el-tag>
      <el-tag v-if="keyword" type="warning" effect="plain">关键词：{{ keyword }}</el-tag>
    </div>

    <div class="history-table-wrap">
      <HistoryResizableTable
        :rows="items"
        :columns="tableColumns"
        :loading="loading"
        :fixed-body-rows="HISTORY_FIXED_BODY_ROWS"
        empty-text="暂无历史笔记"
      >
        <template #cell-title="{ row }">
          <el-text>{{ row.title || '未命名笔记' }}</el-text>
        </template>
        <template #cell-source="{ row }">
          <el-tag>{{ resolveSourceLabel(row.sourceUrl || '') }}</el-tag>
        </template>
        <template #cell-updatedAt="{ row }">
          <el-text>{{ formatDateTime(row.updatedAt) }}</el-text>
        </template>
        <template #cell-actions="{ row, index }">
          <div class="table-actions">
            <el-button :icon="View" link @click="openPreview(index, row.id)" />
            <el-button :icon="Edit" link @click="openEdit(index, row.id)" />
            <el-button :icon="Download" link @click="downloadNoteMarkdown(row.id)" />
            <el-button :icon="Delete" link type="danger" @click="removeNote(row.id)" />
          </div>
        </template>
      </HistoryResizableTable>
    </div>

    <div class="page-toolbar toolbar-end">
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next, total"
        @current-change="handlePageChange"
      />
    </div>

    <el-dialog
      v-model="previewOpen"
      :title="activePreviewNote?.title || '笔记预览'"
      width="72%"
      align-center
      append-to-body
      class="history-preview-dialog"
      :z-index="3000"
      :close-on-click-modal="false"
      @closed="closePreview"
    >
      <el-card shadow="never" class="history-preview-card">
        <div class="history-preview-toolbar">
          <el-text type="info" class="history-preview-counter">第 {{ activePreviewIndex + 1 }} / {{ items.length }} 条</el-text>
          <div class="history-preview-nav">
            <el-button :disabled="!canPreviewPrev || previewLoading" @click="previewPrev">上一条</el-button>
            <el-button type="primary" :disabled="!canPreviewNext || previewLoading" @click="previewNext">下一条</el-button>
          </div>
        </div>
        <el-text type="info" class="history-preview-source">来源：{{ resolveSourceLabel(activePreviewNote?.sourceUrl || '') }}</el-text>
        <div v-loading="previewLoading" class="history-preview-body">
          <MarkdownPreview v-if="previewOpen || previewLoading" :source="activePreviewNote?.contentMd || ''" />
        </div>
      </el-card>
    </el-dialog>

    <el-dialog
      v-model="editingOpen"
      title="编辑笔记"
      width="72%"
      align-center
      append-to-body
      class="history-preview-dialog history-edit-dialog"
      :z-index="3100"
      :close-on-click-modal="false"
      @closed="closeEdit"
    >
      <div class="history-preview-toolbar">
        <el-text type="info" class="history-preview-counter">第 {{ activeEditIndex + 1 }} / {{ items.length }} 条</el-text>
        <div class="history-preview-nav">
          <el-button :disabled="!canEditPrev || editLoading || saveLoading" @click="editPrev">上一条</el-button>
          <el-button type="primary" :disabled="!canEditNext || editLoading || saveLoading" @click="editNext">下一条</el-button>
        </div>
      </div>
      <el-space v-loading="editLoading" direction="vertical" class="full-width-stack">
        <el-input v-model="editTitle" placeholder="笔记标题" />
        <MarkdownEditor v-if="editingOpen || editLoading" :value="editMarkdown" :height="460" @change="(next) => (editMarkdown = next)" />
      </el-space>
      <template #footer>
        <el-button @click="closeEdit">取消</el-button>
        <el-button type="primary" :loading="saveLoading" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>
  </PageBlock>
</template>

<style scoped>
.history-preview-card {
  border-radius: 12px;
}

.history-preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.history-preview-nav {
  display: flex;
  gap: 8px;
}

.history-preview-source {
  display: block;
  margin-bottom: 10px;
}

.history-preview-body {
  min-height: 460px;
  max-height: 62vh;
  overflow: auto;
}
</style>
