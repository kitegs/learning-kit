<template>
  <el-dialog
    v-model="visible"
    title="偏好设置"
    class="lk-settings-dialog"
    width="min(960px, calc(100vw - 32px))"
    top="8vh"
    :close-on-click-modal="false"
    :close-on-press-escape="!saving"
    :show-close="!saving"
    @close="onClose"
  >
    <div class="settings-layout">
      <nav class="settings-nav" aria-label="设置分类">
        <div class="settings-brand"><span>LEARNING KIT</span><small>让工具适应你的学习方式</small></div>
        <button v-for="item in sections" :key="item.id" :data-settings-tab="item.id" :class="{ active: section === item.id }" :aria-current="section === item.id ? 'page' : undefined" @click="selectSection(item.id)"><el-icon><component :is="item.icon" /></el-icon><span>{{ item.title }}</span></button>
        <p>资料留在本机<br />云端调用由你决定</p>
      </nav>
      <div ref="settingsContent" class="settings-content">
        <header class="settings-heading"><span class="section-kicker">偏好设置 / {{ currentSection.title }}</span><h2>{{ currentSection.title }}</h2><p>{{ currentSection.description }}</p></header>
    <el-form label-width="100px" label-position="top" :disabled="saving">
      <section v-show="section === 'connection'" data-settings-panel="connection">
      <el-form-item label="服务商">
        <el-radio-group v-model="s.provider">
          <el-radio-button value="deepseek">DeepSeek</el-radio-button>
          <el-radio-button value="openai">OpenAI</el-radio-button>
          <el-radio-button value="dashscope">阿里(通义)</el-radio-button>
          <el-radio-button value="custom">自定义</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="模型">
        <el-select v-model="s.model" filterable allow-create>
          <el-option
            v-for="m in s.modelList()"
            :key="m"
            :label="m"
            :value="m"
          />
        </el-select>
        <span class="muted">可以直接输入模型名</span>
      </el-form-item>

      <el-form-item label="API Key">
        <el-input
          v-model="s.apiKeys[s.provider]"
          type="password"
          show-password
          placeholder="sk-..."
          @input="s.setConnected(false)"
        />
        <span class="muted">点击底部“保存”后生效；密钥不会显示在预览或日志中。</span>
      </el-form-item>

      <el-form-item label="Base URL" v-if="s.provider === 'custom'">
        <el-input v-model="s.customBaseUrl" placeholder="https://your-host/v1/chat/completions" />
      </el-form-item>

      <el-form-item label="连接测试">
        <el-button size="small" :loading="testing" @click="testConnection">
          {{ testing ? '正在测试…' : '测试连接' }}
        </el-button>
        <span v-if="testResult" :class="testResult.ok ? 'test-ok' : 'test-fail'">
          {{ testResult.ok ? '连接成功：' + (testResult.reply || '').slice(0, 60) : '连接失败：' + testResult.error }}
        </span>
      </el-form-item>

      <el-form-item label="测试模式">
        <el-switch v-model="s.testMode" active-text="使用本地预设回复" inactive-text="调用已配置模型" />
        <span class="muted">开启后不调用 API、不消耗 Token；可测试追问、拖拽和折叠。</span>
      </el-form-item>

      <el-form-item label="温度">
        <el-slider v-model="s.temperature" :min="0" :max="1.5" :step="0.05" show-input />
      </el-form-item>

      </section>
      <section v-show="section === 'context'" data-settings-panel="context">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="资料库保存在本机。主动调用云端 AI 时，问题、自定义指令及启用的上下文会发送给所选服务商。手动引用的选段随问题发送。"
      />
      <div class="ai-switches">
        <label><span><strong>携带最近对话</strong><small>让回答承接当前对话的最近内容</small></span><el-switch v-model="s.aiIncludeHistory" /></label>
        <label><span><strong>携带笔记上下文</strong><small>使用笔记 AI 时发送当前笔记内容</small></span><el-switch v-model="s.aiIncludeNoteContext" /></label>
        <label><span><strong>携带学习统计</strong><small>生成学习进度建议时发送卡片、图书与笔记统计</small></span><el-switch v-model="s.aiIncludeProgressContext" /></label>
        <label><span><strong>允许 AI 工具提案</strong><small>解析模型提出的本地操作；执行前仍需逐项确认</small></span><el-switch v-model="s.aiToolProposalsEnabled" /></label>
      </div>

      <section class="context-budget">
        <header><strong>上下文预算与检索</strong><el-tag size="small" effect="plain">本地筛选 · 按需发送</el-tag></header>
        <p>保留当前问题和系统规则，在预算内携带最近对话。超大的当前问题会提示调整，不会静默截断。</p>
        <el-form-item label="输入预算">
          <el-input-number v-model="s.aiInputBudget" :min="2048" :max="65536" :step="1024" :precision="0" />
          <span class="muted">估算 tokens</span>
        </el-form-item>
        <small>此值不含模型输出；请低于模型上下文上限并留出回答空间。字符估算与实际用量可能不同。</small>
        <div class="retrieval-setting"><span><strong>检索相关笔记</strong><small>仅聊天使用。开启后发送最多 4 条未删除笔记摘录；关键词匹配，不是语义检索。</small></span><el-switch v-model="s.aiRetrievalEnabled" aria-label="检索相关笔记" /></div>
      </section>

      </section>
      <section v-show="section === 'appearance'" data-settings-panel="appearance">
      <el-form-item label="界面主题">
        <div class="appearance-themes" role="group" aria-label="界面主题">
          <button v-for="item in themeCards" :key="item.id" type="button" :disabled="saving" :aria-pressed="s.theme === item.id" :data-theme-choice="item.id" :class="{ selected: s.theme === item.id }" @click="onThemeChange(item.id)"><span class="theme-swatch" :style="{ background: item.background, '--swatch-accent': item.accent }"><i></i><span><b></b><b></b><b></b></span></span><strong>{{ item.title }}</strong></button>
        </div>
        <span class="theme-help">即时预览 · 取消会恢复原主题</span>
      </el-form-item>

      <el-divider content-position="left">学习体验</el-divider>
      <el-form-item label="笔记自动保存"><el-slider v-model="s.noteAutosaveMs" :min="300" :max="5000" :step="100" show-input /><span class="muted">毫秒</span></el-form-item>
      <el-form-item label="电子书主题"><el-radio-group v-model="s.readerTheme"><el-radio-button value="paper">护眼纸张</el-radio-button><el-radio-button value="sepia">暖褐色</el-radio-button><el-radio-button value="night">夜间</el-radio-button></el-radio-group></el-form-item>
      <el-form-item label="新卡上限"><el-input-number v-model="s.reviewNewLimit" :min="5" :max="200" /><span class="muted">每次复习的新卡数量</span></el-form-item>

      </section>
      <section v-show="section === 'data'" data-settings-panel="data">
      <el-alert type="info" :closable="false" title="备份、恢复与重试保存会立即执行，不受底部“取消”影响。" class="section-notice" />
      <el-form-item label="本地备份">
        <el-button size="small" @click="createBackup">创建备份</el-button>
        <el-button size="small" type="warning" plain @click="restoreBackup">恢复备份</el-button>
        <span class="muted">恢复后会立即重载本地资料，恢复前自动保留一份安全副本</span>
      </el-form-item>
      <el-form-item label="保存状态">
        <el-tag size="small" :type="persistenceStatus.state === 'error' ? 'danger' : persistenceStatus.state === 'saving' ? 'warning' : 'success'">{{ persistenceStatusText }}</el-tag>
        <el-button size="small" :loading="retryingSave" @click="retryDatabaseSave">重试保存</el-button>
      </el-form-item>
      <el-form-item label="密钥保护"><span class="muted key-protection">API Key 使用系统安全存储加密，不以明文写入学习数据库。</span></el-form-item>

      </section>
      <section v-show="section === 'shortcuts'" data-settings-panel="shortcuts">
      <div class="shortcuts">
        <div v-for="(_, key) in s.shortcuts" :key="key" class="shortcut-row">
          <span class="sc-label">{{ shortcutLabels[key] || key }}</span>
          <el-input v-model="s.shortcuts[key]" size="small" style="width:180px" placeholder="例如 Ctrl+Shift+N" />
        </div>
        <el-button size="small" @click="resetShortcuts" style="margin-top:6px">重置为默认</el-button>
      </div>

      </section>
      <section v-show="section === 'prompt'" data-settings-panel="prompt">
      <el-form-item label="内置规则">
        <el-input
          v-model="s.systemPrompt"
          type="textarea"
          :rows="5"
          readonly
        />
      </el-form-item>
      <el-form-item label="自定义指令">
        <el-switch v-model="s.customSystemPromptEnabled" active-text="启用" inactive-text="停用" />
      </el-form-item>
      <el-input
        v-model="s.customSystemPrompt"
        type="textarea"
        :rows="8"
        :disabled="!s.customSystemPromptEnabled"
        placeholder="例如：优先用中文回答；先给提示，再给完整解法；示例尽量使用 TypeScript。"
      />
      <div class="muted small">
        自定义指令会追加到内置规则之后，不能覆盖隐私、确认和输出格式约束。项目级内置规则仍按 ./promt/system.txt → resources/promt/system.txt 加载。
      </div>
      <el-button size="small" @click="s.customSystemPrompt = ''; s.customSystemPromptEnabled = false">恢复默认提示词</el-button>
      </section>
    </el-form>
      </div>
    </div>

    <template #footer>
      <span class="settings-footer-hint">设置按需启用，保存后记住你的选择</span>
      <el-button :disabled="saving" @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Connection, Filter, EditPen, Brush, Lock, Key } from '@element-plus/icons-vue'
import { useSettingsStore, type ThemeId } from '../stores/chat'

const persistenceStatus = ref<DatabasePersistenceStatus>({ state: 'idle' })
const retryingSave = ref(false)
const persistenceStatusText = computed(() => {
  if (persistenceStatus.value.state === 'saving') return '正在安全保存…'
  if (persistenceStatus.value.state === 'error') return `保存失败：${persistenceStatus.value.message || '请检查磁盘空间或权限'}`
  if (persistenceStatus.value.state === 'saved') return '数据已安全保存'
  return '等待首次保存'
})

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
}>()
const shortcutLabels: Record<string, string> = {
  search: '全局搜索', newConv: '新建对话', newNote: '新建笔记', newNoteFolder: '新建笔记目录',
  focusNoteManager: '打开笔记管理', createNoteLink: '创建笔记链接', toggleTheme: '切换主题',
  renameNote: '重命名当前笔记', toggleNoteOutline: '打开/关闭笔记目录',
  noteHeading1: '设为一级标题', noteHeading2: '设为二级标题', noteHeading3: '设为三级标题',
  sendMessage: '发送消息', saveNote: '保存笔记', pageLeft: '上一页', pageRight: '下一页',
  pageFirst: '第一页', pageLast: '最后一页', centerPage: '纸张居中', addBookmark: '添加书签',
  fullscreen: '全屏', undo: '撤销', redo: '重做', deleteSelected: '删除选中', cancel: '取消/关闭'
}
const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const s = useSettingsStore()
type Section = 'connection' | 'context' | 'prompt' | 'appearance' | 'data' | 'shortcuts'
const section = ref<Section>('connection')
const settingsContent = ref<HTMLElement | null>(null)
const sections = [
  { id: 'connection' as Section, title: '模型与连接', description: '选择你的 AI 服务，连接一次，专注每一次提问。', icon: Connection },
  { id: 'context' as Section, title: '上下文与隐私', description: '决定 AI 可以参考哪些资料，以及每次发送多少内容。', icon: Filter },
  { id: 'prompt' as Section, title: '回答偏好', description: '用自己的指令，调整回答的语言、深度和学习方式。', icon: EditPen },
  { id: 'appearance' as Section, title: '外观与学习', description: '舒服的阅读配色，合适的学习节奏。', icon: Brush },
  { id: 'data' as Section, title: '数据安全', description: '检查保存状态，为重要的学习资料留一份备份。', icon: Lock },
  { id: 'shortcuts' as Section, title: '快捷键', description: '把高频操作交给键盘，少一次寻找，多一分专注。', icon: Key }
]
const currentSection = computed(() => sections.find(item => item.id === section.value)!)
function selectSection(id: Section) { section.value = id; settingsContent.value?.scrollTo({ top: 0 }) }
const saving = ref(false)
const themeCards: { id: ThemeId; title: string; background: string; accent: string }[] = [
  { id: 'paper', title: '护眼纸张', background: '#f5f0e4', accent: '#527d6a' },
  { id: 'sepia', title: '暖褐阅读', background: '#e8dcc5', accent: '#926235' },
  { id: 'forest', title: '森林专注', background: '#e5ece2', accent: '#477c5a' },
  { id: 'light', title: '清爽浅色', background: '#f6f6f6', accent: '#2563eb' },
  { id: 'dark', title: '深色专注', background: '#252526', accent: '#4ea1ff' }
]
const aiDraftKeys = ['customSystemPrompt', 'customSystemPromptEnabled', 'aiIncludeHistory', 'aiIncludeNoteContext', 'aiIncludeProgressContext', 'aiToolProposalsEnabled', 'aiInputBudget', 'aiRetrievalEnabled'] as const
let aiOriginal: Record<string, unknown> = {}
let saved = false

async function save() {
  if (saving.value) return
  saving.value = true
  try {
    await s.saveAll()
    saved = true
    ElMessage.success('偏好设置已保存')
    visible.value = false
    emit('saved')
  } catch (error: unknown) { ElMessage.error(error instanceof Error ? error.message : '保存失败，请重试') }
  finally { saving.value = false }
}
function resetShortcuts() {
  Object.assign(s.shortcuts, s.defaultShortcuts)
}

function onThemeChange(value: string | number | boolean | undefined) {
  if (value === 'dark' || value === 'light' || value === 'paper' || value === 'sepia' || value === 'forest') {
    s.theme = value as ThemeId
    s.applyTheme()
  }
}

const testing = ref(false)
const testResult = ref<{ ok: boolean; reply?: string; error?: string } | null>(null)
async function testConnection() {
  testing.value = true; testResult.value = null
  try {
    if (s.testMode) {
      testResult.value = { ok: true, reply: '测试模式已启用：不会请求 API。' }
      s.setConnected(false)
      testing.value = false
      return
    }
    testResult.value = await window.lk.aiTest({
      provider: s.provider,
      model: s.model,
      apiKey: s.apiKeys[s.provider] || '',
      baseUrl: s.provider === 'custom' ? s.customBaseUrl : undefined
    })
    if (testResult.value.ok) s.setConnected(true)
    else s.setConnected(false)
  } catch (err: any) {
    testResult.value = { ok: false, error: err?.message || String(err) }
    s.setConnected(false)
  }
  testing.value = false
}

async function createBackup() {
  const result = await window.lk.backupCreate()
  if (result) ElMessage.success(`备份已创建：${result.path}`)
}
async function restoreBackup() {
  await ElMessageBox.confirm('恢复会替换当前本地数据库，建议先创建备份。恢复前会在数据目录保留自动安全副本。确定继续吗？', '恢复本地备份', { type: 'warning', confirmButtonText: '选择并恢复' })
  const restored = await window.lk.backupRestore()
  if (restored) {
    ElMessage.success('备份已恢复，正在重新加载…')
    window.location.reload()
  }
}

async function refreshPersistenceStatus() {
  persistenceStatus.value = await window.lk.databaseStatus()
}

async function retryDatabaseSave() {
  retryingSave.value = true
  try {
    const saved = await window.lk.databaseRetrySave()
    await refreshPersistenceStatus()
    if (saved) ElMessage.success('本地资料已安全保存')
    else ElMessage.error(persistenceStatus.value.message || '保存失败，请检查磁盘空间或权限')
  } finally {
    retryingSave.value = false
  }
}

watch(() => props.modelValue, (open) => {
  if (open) {
    saved = false
    section.value = 'connection'
    testResult.value = null
    aiOriginal = { ...Object.fromEntries(aiDraftKeys.map((key) => [key, s[key]])), provider: s.provider, model: s.model, temperature: s.temperature, customBaseUrl: s.customBaseUrl, testMode: s.testMode, theme: s.theme, noteAutosaveMs: s.noteAutosaveMs, readerTheme: s.readerTheme, reviewNewLimit: s.reviewNewLimit, apiKeys: { ...s.apiKeys }, shortcuts: { ...s.shortcuts } }
  }
  if (open) refreshPersistenceStatus().catch((error: unknown) => {
    persistenceStatus.value = { state: 'error', message: error instanceof Error ? error.message : String(error) }
  })
}, { immediate: true })

function onClose() {
  if (!saved) { Object.assign(s, aiOriginal); s.applyTheme() }
  emit('update:modelValue', false)
}
</script>

<style scoped lang="scss">
:global(.lk-settings-dialog) { padding:0; overflow:hidden; border-radius:16px; }
:global(.lk-settings-dialog .el-dialog__header) { padding:20px 24px 16px; margin:0; border-bottom:1px solid var(--border); }
:global(.lk-settings-dialog .el-dialog__body) { padding:0; max-height:65vh; overflow-y:auto; }
:global(.lk-settings-dialog .el-dialog__footer) { display:flex; align-items:center; justify-content:flex-end; padding:16px 24px; border-top:1px solid var(--border); }
.settings-layout { display:grid; grid-template-columns:200px minmax(0,1fr); height:65vh; max-height:680px; }
.settings-nav { background:var(--bg-soft); padding:22px 12px; border-right:1px solid var(--border); display:flex; flex-direction:column; gap:6px; overflow:auto; }
.settings-brand { display:grid; gap:8px; padding:0 12px 24px; }
.settings-brand span { font-size:11px; font-weight:700; letter-spacing:.15em; color:var(--accent); }
.settings-brand small { font-size:11px; color:var(--text-dim); }
.settings-nav button { display:flex; align-items:center; gap:12px; padding:12px; border:0; border-radius:8px; background:transparent; color:var(--text-secondary); cursor:pointer; text-align:left; font:inherit; font-size:13px; }
.settings-nav button:hover { background:var(--bg-hover); }
.settings-nav button.active { color:var(--accent-text); background:var(--accent-dim); font-weight:600; }
.settings-nav p { margin:auto 12px 0; padding-top:24px; color:var(--text-dim); font-size:11px; line-height:1.8; }
.settings-content { padding:28px 32px; min-width:0; overflow-y:auto; }
.settings-heading { margin-bottom:26px; }
.section-kicker { font-size:11px; color:var(--text-dim); }
.settings-heading h2 { margin:10px 0 8px; font-size:23px; font-weight:650; letter-spacing:-.5px; color:var(--text); }
.settings-heading p { margin:0; font-size:13px; line-height:1.7; color:var(--text-secondary); }
.settings-footer-hint { flex:1; text-align:left; font-size:12px; color:var(--text-dim); }
.section-notice { margin-bottom:20px; }
.appearance-themes { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:10px; width:100%; }
.appearance-themes button { padding:6px; border:1px solid var(--border); border-radius:10px; background:var(--bg-elev); color:var(--text-secondary); cursor:pointer; min-width:0; }
.appearance-themes button.selected { border-color:var(--accent); outline:1px solid var(--accent); color:var(--accent-text); }
.appearance-themes strong { display:block; padding:8px 0 3px; font-size:11px; font-weight:500; }
.theme-swatch { height:56px; border-radius:5px; display:flex; padding:7px; gap:6px; }
.theme-swatch i { width:12px; background:var(--swatch-accent); opacity:.55; border-radius:3px; }
.theme-swatch span { flex:1; padding-top:3px; }
.theme-swatch b { display:block; height:4px; margin-bottom:6px; background:var(--swatch-accent); opacity:.3; border-radius:2px; }
.theme-swatch b:first-child { width:60%; opacity:.7; }
.theme-help { display:block; margin-top:10px; color:var(--text-dim); font-size:12px; }
@media(max-width:700px) { .settings-layout { grid-template-columns:150px minmax(0,1fr); } .settings-content { padding:20px 16px; } .settings-brand small,.settings-footer-hint { display:none; } }
.context-budget { margin:18px 0; padding:18px; border:1px solid var(--border); border-radius:12px; background:var(--bg-elev); }
.context-budget header { display:flex; justify-content:space-between; gap:12px; align-items:center; }
.context-budget p,.context-budget small { color:var(--text-dim); font-size:12px; line-height:1.6; }
.retrieval-setting { display:flex; align-items:center; gap:16px; justify-content:space-between; border-top:1px solid var(--border); margin-top:14px; padding-top:14px; }
.retrieval-setting span { display:grid; gap:4px; }
.ai-switches { display:grid; gap:8px; margin-top:12px; }
.ai-switches label { display:flex; align-items:center; justify-content:space-between; gap:18px; padding:9px 11px; border:1px solid var(--border); border-radius:8px; background:var(--bg-soft); }
.ai-switches span { display:flex; flex-direction:column; gap:2px; }
.ai-switches strong { color:var(--text); font-size:13px; }
.ai-switches small { color:var(--text-dim); line-height:1.4; }
.muted { color: var(--text-dim); font-size: 12px; margin-left: 10px; }
.small { font-size: 11px; margin-top: 6px; margin-left: 0; }
.test-ok { color: var(--success, #51cf66); font-size: 12px; margin-left: 8px; }
.test-fail { color: var(--danger, #ff6b6b); font-size: 12px; margin-left: 8px; }
.key-saved { color: var(--success, #51cf66); font-size: 11px; margin-left: 8px; }
.shortcuts { display:flex; flex-direction:column; gap:6px; }
.shortcut-row { display:flex; align-items:center; gap:12px; }
.sc-label { width:120px; font-size:13px; color:var(--text-dim); text-transform:capitalize; }
.key-protection { margin-left:0; }
</style>
