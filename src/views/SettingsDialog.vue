<template>
  <el-dialog
    v-model="visible"
    title="设置 · API 与模型"
    width="640px"
    @close="onClose"
  >
    <el-form label-width="100px" label-position="left">
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
          @blur="onKeyBlur"
          @change="onKeyBlur"
        />
        <span v-if="s.apiKeys[s.provider]" class="key-saved">saved</span>
      </el-form-item>

      <el-form-item label="Base URL" v-if="s.provider === 'custom'">
        <el-input v-model="s.customBaseUrl" placeholder="https://your-host/v1/chat/completions" />
      </el-form-item>

      <el-form-item label="连接测试">
        <el-button size="small" :loading="testing" @click="testConnection">
          {{ testing ? 'Testing...' : 'Test Connection' }}
        </el-button>
        <span v-if="testResult" :class="testResult.ok ? 'test-ok' : 'test-fail'">
          {{ testResult.ok ? 'OK: ' + (testResult.reply || '').slice(0, 60) : 'FAIL: ' + testResult.error }}
        </span>
      </el-form-item>

      <el-form-item label="测试模式">
        <el-switch v-model="s.testMode" active-text="使用本地预设回复" inactive-text="调用已配置模型" />
        <span class="muted">开启后不调用 API、不消耗 Token；可测试追问、拖拽和折叠。</span>
      </el-form-item>

      <el-form-item label="温度">
        <el-slider v-model="s.temperature" :min="0" :max="1.5" :step="0.05" show-input />
      </el-form-item>

      <el-form-item label="界面主题">
        <el-radio-group :model-value="s.theme" @change="onThemeChange">
          <el-radio-button value="paper">护眼纸张</el-radio-button>
          <el-radio-button value="sepia">暖褐阅读</el-radio-button>
          <el-radio-button value="forest">森林专注</el-radio-button>
          <el-radio-button value="light">清爽浅色</el-radio-button>
          <el-radio-button value="dark">深色专注</el-radio-button>
        </el-radio-group>
        <span class="muted">左侧画笔按钮可快速切换</span>
      </el-form-item>

      <el-divider content-position="left">学习体验</el-divider>
      <el-form-item label="笔记自动保存"><el-slider v-model="s.noteAutosaveMs" :min="300" :max="5000" :step="100" show-input /><span class="muted">毫秒</span></el-form-item>
      <el-form-item label="电子书主题"><el-radio-group v-model="s.readerTheme"><el-radio-button value="paper">护眼纸张</el-radio-button><el-radio-button value="sepia">暖褐色</el-radio-button><el-radio-button value="night">夜间</el-radio-button></el-radio-group></el-form-item>
      <el-form-item label="新卡上限"><el-input-number v-model="s.reviewNewLimit" :min="5" :max="200" /><span class="muted">每次复习的新卡数量</span></el-form-item>

      <el-divider content-position="left">数据保护</el-divider>
      <el-form-item label="本地备份">
        <el-button size="small" @click="createBackup">创建备份</el-button>
        <el-button size="small" type="warning" plain @click="restoreBackup">恢复备份</el-button>
        <span class="muted">恢复后会立即重载本地资料，恢复前自动保留一份安全副本</span>
      </el-form-item>
      <el-form-item label="密钥保护"><span class="muted key-protection">API Key 使用系统安全存储加密，不以明文写入学习数据库。</span></el-form-item>

      <el-divider content-position="left">快捷键</el-divider>
      <div class="shortcuts">
        <div v-for="(_, key) in s.shortcuts" :key="key" class="shortcut-row">
          <span class="sc-label">{{ shortcutLabels[key] || key }}</span>
          <el-input v-model="s.shortcuts[key]" size="small" style="width:180px" placeholder="eg Ctrl+Shift+N" />
        </div>
        <el-button size="small" @click="resetShortcuts" style="margin-top:6px">重置为默认</el-button>
      </div>

      <el-divider content-position="left">系统提示词</el-divider>
      <el-input
        v-model="s.systemPrompt"
        type="textarea"
        :rows="8"
        placeholder="默认即私人学习助手提示词；可在项目 promt/system.txt 放入自定义版本"
      />
      <div class="muted small">
        提示词文件路径(优先级): ./promt/system.txt → resources/promt/system.txt
      </div>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSettingsStore, type ThemeId } from '../stores/chat'

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

async function save() {
  await s.saveAll()
  ElMessage.success('已保存')
  visible.value = false
  emit('saved')
}
function resetShortcuts() {
  Object.assign(s.shortcuts, s.defaultShortcuts)
}

function onThemeChange(value: string | number | boolean | undefined) {
  if (value === 'dark' || value === 'light' || value === 'paper' || value === 'sepia' || value === 'forest') {
    s.setTheme(value as ThemeId)
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

async function onKeyBlur() {
  await s.saveApiKey()
  s.setConnected(false)
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

function onClose() {
  emit('update:modelValue', false)
}
</script>

<style scoped lang="scss">
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
