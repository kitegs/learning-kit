# 第二、三阶段技术方案

## 调度层

新增 `card_scheduling` 表保存卡片级算法与 FSRS 序列化状态。`cards` 表仍是统一查询与兼容层：FSRS 写回其 due/reps/lapses/interval，历史卡片没有调度记录时继续走原 SM-2 路径。

## 专业笔记层

双页笔记 JSON 增加 `leftObjects/rightObjects`。每个对象保存工具、颜色、宽度和归一化到 canvas 的坐标；渲染时用 perfect-freehand 将压感点转为轮廓。旧 `leftInk/rightInk` 保留为底图，保证不破坏已有用户笔记。

## 版本层

版本快照仍由主进程保存。渲染端用 `diffWordsWithSpace` 与 `Intl.Segmenter('zh-CN')` 展示新增、删除与未改变片段，回滚保持既有确认步骤。
