<template>
  <el-dialog
    v-model="visible"
    title="生成学习方案"
    width="640px"
    :close-on-click-modal="false"
  >
    <el-alert
      type="info"
      :closable="false"
      title="AI 会按你给的学科/主题，生成一份循序渐进的学习方案（lesson 大纲 + 推荐资料 + 复习节奏）"
      style="margin-bottom: 14px;"
    />

    <el-form label-position="top">
      <el-form-item label="学习主题">
        <el-input
          v-model="topic"
          placeholder="例如：操作系统、考研英语阅读、傅里叶变换、Vue3 源码…"
          autofocus
        />
      </el-form-item>

      <el-form-item label="当前水平 / 已掌握">
        <el-input
          v-model="background"
          type="textarea"
          :rows="2"
          placeholder="例如：学过 C 语言、看过操作系统网课；英语四级 480；数学到微积分为止"
        />
      </el-form-item>

      <el-form-item label="目标">
        <el-input
          v-model="goal"
          type="textarea"
          :rows="2"
          placeholder="例如：12 月考研；写一个简易 shell；能读懂源码"
        />
      </el-form-item>

      <el-form-item label="每天可用时间">
        <el-radio-group v-model="daily">
          <el-radio-button value="0.5">≤0.5h</el-radio-button>
          <el-radio-button value="1">~1h</el-radio-button>
          <el-radio-button value="2">~2h</el-radio-button>
          <el-radio-button value="3">≥3h</el-radio-button>
        </el-radio-group>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :disabled="!topic.trim()" @click="generate">生成并发送</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'created', planText: string): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})

const topic = ref('')
const background = ref('')
const goal = ref('')
const daily = ref('1')

function generate() {
  if (!topic.value.trim()) return
  const prompt = `请为下面的主题生成一份循序渐进的私人学习方案。

【主题】${topic.value.trim()}
【我的背景】${background.value.trim() || '（请先问我一两个问题）'}
【我的目标】${goal.value.trim() || '（请在方案末尾反问以便明确）'}
【每天可用时间】${daily.value} 小时

请按以下结构输出（Markdown）：

## 1. 现状校准
用 1-2 个问题反问我，确认我的 zpd（最近发展区）。

## 2. 学习方案：${topic.value.trim()}
按时间或阶段给出一个**带编号的 lesson 列表**（约 8-15 节），每节包含：
- 课时序号 + 标题
- 一句话目标（学完后我能做到什么）
- 前置（依赖哪一节）
- 推荐主资源（只列一个最高质量、高可信度的源；不确定就注明）
- 估时（按我的每天时间折算）

## 3. 推荐参考文档
列出我后续复习应常翻的 cheat sheet / 词汇表 / 公式表。

## 4. 复习节奏
基于艾宾浩斯曲线，给出每节的关键回顾节点（1d / 2d / 4d / 7d / 15d）的建议。

## 5. 下一步
告诉我先从哪一节开始，以及我该先回答你哪几个问题。`
  emit('created', prompt)
  topic.value = ''
  background.value = ''
  goal.value = ''
  visible.value = false
}
</script>