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
        />
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

      <el-form-item label="温度">
        <el-slider v-model="s.temperature" :min="0" :max="1.5" :step="0.05" show-input />
      </el-form-item>

      <el-form-item label="主题">
        <el-radio-group :model-value="s.theme" @change="(v: any) => s.setTheme(v)">
          <el-radio-button value="dark">暗色</el-radio-button>
          <el-radio-button value="light">亮色</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-divider content-position="left">快捷键</el-divider>
      <div class="shortcuts">
        <div v-for="(_, key) in s.shortcuts" :key="key" class="shortcut-row">
          <span class="sc-label">{{ key }}</span>
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
import { ElMessage } from 'element-plus'
import { useSettingsStore } from '../stores/chat'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
}>()
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

const testing = ref(false)
const testResult = ref<{ ok: boolean; reply?: string; error?: string } | null>(null)
async function testConnection() {
  testing.value = true; testResult.value = null
  try {
    testResult.value = await window.lk.aiTest({
      provider: s.provider,
      model: s.model,
      apiKey: s.apiKeys[s.provider] || '',
      baseUrl: s.provider === 'custom' ? s.customBaseUrl : undefined
    })
  } catch (err: any) {
    testResult.value = { ok: false, error: err?.message || String(err) }
  }
  testing.value = false
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
.shortcuts { display:flex; flex-direction:column; gap:6px; }
.shortcut-row { display:flex; align-items:center; gap:12px; }
.sc-label { width:120px; font-size:13px; color:var(--text-dim); text-transform:capitalize; }
</style>