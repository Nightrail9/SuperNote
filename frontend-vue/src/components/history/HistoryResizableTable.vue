<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

type TableColumn = {
  key: string
  label: string
  minWidth?: number
  flex?: number
  freeze?: 'right'
  align?: 'left' | 'center' | 'right'
}

const props = withDefaults(
  defineProps<{
    rows: Record<string, any>[]
    columns: TableColumn[]
    loading?: boolean
    emptyText?: string
    rowKey?: string
  }>(),
  {
    loading: false,
    emptyText: '暂无数据',
    rowKey: 'id',
  },
)

const containerRef = ref<HTMLDivElement | null>(null)
const columnWidths = ref<number[]>([])

let resizeObserver: ResizeObserver | null = null
let activeHandleIndex = -1
let dragStartX = 0
let dragLeftWidth = 0
let dragRightWidth = 0

const MIN_COLUMN_WIDTH = 120

const minWidths = computed(() => props.columns.map((column) => Math.max(column.minWidth ?? MIN_COLUMN_WIDTH, MIN_COLUMN_WIDTH)))
const totalMinWidth = computed(() => minWidths.value.reduce((sum, width) => sum + width, 0))

const gridTemplateColumns = computed(() => {
  if (columnWidths.value.length !== props.columns.length) return ''
  return columnWidths.value.map((width) => `${Math.round(width)}px`).join(' ')
})

const tableMinWidth = computed(() => Math.max(Math.round(totalMinWidth.value), 1))

function getColumnFlex(column: TableColumn) {
  return Math.max(column.flex ?? 1, 0.2)
}

function normalizeWidths(widths: number[], targetTotal: number, mins: number[]) {
  const normalized = widths.map((width, index) => Math.max(width, mins[index] ?? MIN_COLUMN_WIDTH))
  const currentTotal = normalized.reduce((sum, width) => sum + width, 0)
  const diff = targetTotal - currentTotal

  if (Math.abs(diff) < 0.5) {
    return normalized
  }

  const adjustableIndexes = normalized
    .map((width, index) => ({ width, index }))
    .filter(({ width, index }) => diff > 0 || width > (mins[index] ?? MIN_COLUMN_WIDTH))
    .map(({ index }) => index)

  if (!adjustableIndexes.length) {
    return normalized
  }

  const step = diff / adjustableIndexes.length
  for (const index of adjustableIndexes) {
    const nextWidth = normalized[index] ?? MIN_COLUMN_WIDTH
    normalized[index] = Math.max((mins[index] ?? MIN_COLUMN_WIDTH), nextWidth + step)
  }

  return normalized
}

function calculateInitialWidths(containerWidth: number) {
  const mins = minWidths.value
  const flexValues = props.columns.map((column) => getColumnFlex(column))
  const totalFlex = flexValues.reduce((sum, value) => sum + value, 0) || 1
  const expectedTotal = Math.max(containerWidth, totalMinWidth.value)

  const baseWidths = props.columns.map((_, index) => {
    const flex = flexValues[index] ?? 1
    return Math.max(mins[index] ?? MIN_COLUMN_WIDTH, (expectedTotal * flex) / totalFlex)
  })
  return normalizeWidths(baseWidths, expectedTotal, mins)
}

function scaleWidths(previous: number[], containerWidth: number) {
  const mins = minWidths.value
  const targetTotal = Math.max(containerWidth, totalMinWidth.value)
  const previousTotal = previous.reduce((sum, width) => sum + width, 0)

  if (previousTotal <= 0) {
    return calculateInitialWidths(containerWidth)
  }

  const ratio = targetTotal / previousTotal
  const scaled = previous.map((width) => width * ratio)
  return normalizeWidths(scaled, targetTotal, mins)
}

function syncWidths(forceReset = false) {
  const container = containerRef.value
  if (!container || !props.columns.length) {
    columnWidths.value = []
    return
  }

  const containerWidth = Math.max(container.clientWidth, 1)
  if (forceReset || columnWidths.value.length !== props.columns.length) {
    columnWidths.value = calculateInitialWidths(containerWidth)
    return
  }

  columnWidths.value = scaleWidths(columnWidths.value, containerWidth)
}

function endResize() {
  activeHandleIndex = -1
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', endResize)
  window.removeEventListener('pointercancel', endResize)
  document.body.classList.remove('history-table-resizing')
}

function onPointerMove(event: PointerEvent) {
  if (activeHandleIndex < 0 || !columnWidths.value.length) return

  const leftMin = minWidths.value[activeHandleIndex] ?? MIN_COLUMN_WIDTH
  const rightMin = minWidths.value[activeHandleIndex + 1] ?? MIN_COLUMN_WIDTH
  const totalPair = dragLeftWidth + dragRightWidth
  const delta = event.clientX - dragStartX

  const nextLeft = Math.min(Math.max(dragLeftWidth + delta, leftMin), totalPair - rightMin)
  const nextRight = totalPair - nextLeft

  if (nextRight < rightMin) return

  const next = [...columnWidths.value]
  next[activeHandleIndex] = nextLeft
  next[activeHandleIndex + 1] = nextRight
  columnWidths.value = next
}

function startResize(event: PointerEvent, handleIndex: number) {
  if (handleIndex < 0 || handleIndex >= props.columns.length - 1) return
  if (!columnWidths.value.length) return

  activeHandleIndex = handleIndex
  dragStartX = event.clientX
  dragLeftWidth = columnWidths.value[handleIndex] ?? 0
  dragRightWidth = columnWidths.value[handleIndex + 1] ?? 0

  document.body.classList.add('history-table-resizing')
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', endResize)
  window.addEventListener('pointercancel', endResize)
}

function rowIdentity(row: Record<string, any>, rowIndex: number) {
  const value = row[props.rowKey]
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }
  return `${rowIndex}`
}

function cellValue(row: Record<string, any>, key: string) {
  const value = row[key]
  if (value === null || value === undefined) {
    return ''
  }
  return String(value)
}

watch(
  () => props.columns,
  () => {
    syncWidths(true)
  },
  { deep: true },
)

onMounted(() => {
  syncWidths(true)
  resizeObserver = new ResizeObserver(() => {
    syncWidths(false)
  })
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }
})

onBeforeUnmount(() => {
  endResize()
  resizeObserver?.disconnect()
})
</script>

<template>
  <div ref="containerRef" v-loading="loading" class="history-table-v2-wrap">
    <div class="history-table-v2" :style="{ minWidth: `${tableMinWidth}px` }">
      <div class="history-table-v2-header" :style="{ gridTemplateColumns }">
        <div
          v-for="(column, columnIndex) in columns"
          :key="column.key"
          class="history-table-v2-cell history-table-v2-head-cell"
          :class="[
            column.freeze === 'right' ? 'history-table-v2-cell--freeze-right' : '',
            column.align === 'center' ? 'history-table-v2-cell--center' : '',
            column.align === 'right' ? 'history-table-v2-cell--right' : '',
          ]"
        >
          <span class="history-table-v2-head-text">{{ column.label }}</span>
          <button
            v-if="columnIndex < columns.length - 1"
            type="button"
            class="history-table-v2-resize-handle"
            :aria-label="`调整${column.label}列宽`"
            @pointerdown.prevent="startResize($event, columnIndex)"
          />
        </div>
      </div>

      <div v-if="rows.length" class="history-table-v2-body">
        <div v-for="(row, rowIndex) in rows" :key="rowIdentity(row, rowIndex)" class="history-table-v2-row" :style="{ gridTemplateColumns }">
          <div
            v-for="column in columns"
            :key="column.key"
            class="history-table-v2-cell history-table-v2-body-cell"
            :class="[
              column.freeze === 'right' ? 'history-table-v2-cell--freeze-right' : '',
              column.align === 'center' ? 'history-table-v2-cell--center' : '',
              column.align === 'right' ? 'history-table-v2-cell--right' : '',
            ]"
          >
            <slot :name="`cell-${column.key}`" :row="row" :index="rowIndex">
              <span class="history-table-v2-plain-text">{{ cellValue(row, column.key) }}</span>
            </slot>
          </div>
        </div>
      </div>

      <div v-else-if="!loading" class="history-table-v2-empty">
        <el-empty :description="emptyText" :image-size="92" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-table-v2-wrap {
  width: 100%;
  min-height: 0;
  overflow: auto;
  border: 1px solid #e5d8c5;
  border-radius: 16px;
  background: linear-gradient(180deg, #fffcf7 0%, #fff9f2 100%);
}

.history-table-v2 {
  width: 100%;
}

.history-table-v2-header,
.history-table-v2-row {
  display: grid;
}

.history-table-v2-head-cell,
.history-table-v2-body-cell {
  position: relative;
}

.history-table-v2-cell {
  min-width: 0;
  padding: 12px 14px;
  border-right: 1px solid #ecdfcf;
}

.history-table-v2-head-cell {
  background: #f7ecdf;
  color: #524637;
  font-weight: 600;
  letter-spacing: 0.01em;
  border-bottom: 1px solid #e7d9c5;
}

.history-table-v2-head-text {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-table-v2-resize-handle {
  position: absolute;
  top: 0;
  right: -4px;
  width: 8px;
  height: 100%;
  border: 0;
  background: transparent;
  cursor: col-resize;
  z-index: 3;
}

.history-table-v2-resize-handle::before {
  content: '';
  position: absolute;
  top: 24%;
  bottom: 24%;
  left: 3px;
  width: 2px;
  border-radius: 999px;
  background: rgba(109, 89, 57, 0);
  transition: background-color 120ms ease;
}

.history-table-v2-head-cell:hover .history-table-v2-resize-handle::before {
  background: rgba(109, 89, 57, 0.34);
}

.history-table-v2-row {
  border-bottom: 1px solid #f0e4d5;
}

.history-table-v2-row:nth-child(2n) .history-table-v2-body-cell {
  background: #fffaf4;
}

.history-table-v2-row:nth-child(2n + 1) .history-table-v2-body-cell {
  background: #fffdf9;
}

.history-table-v2-row:hover .history-table-v2-body-cell {
  background: #fdf1e3;
}

.history-table-v2-cell:last-child {
  border-right: 0;
}

.history-table-v2-cell--freeze-right {
  position: sticky;
  right: 0;
  z-index: 2;
  box-shadow: -8px 0 12px -12px rgba(68, 44, 15, 0.58);
}

.history-table-v2-head-cell.history-table-v2-cell--freeze-right {
  z-index: 4;
  background: #f5e7d4;
}

.history-table-v2-body-cell.history-table-v2-cell--freeze-right {
  background: #fff7ec;
}

.history-table-v2-cell--center {
  text-align: center;
}

.history-table-v2-cell--right {
  text-align: right;
}

.history-table-v2-plain-text {
  display: block;
  color: #3b3126;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-table-v2-empty {
  padding: 28px 8px;
  background: #fffdf9;
}

@media (max-width: 960px) {
  .history-table-v2-wrap {
    border-radius: 12px;
  }

  .history-table-v2-cell {
    padding: 10px 12px;
  }
}
</style>
