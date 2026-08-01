# 流内折叠组方案

新建 `conversation_folds` 表并为 messages 增加 `fold_id`。折叠组持有对话、标题、排序和开关状态；轮次归属通过其所有消息的 `fold_id` 记录。轮次移动 IPC 接受可选 `targetFoldId`，递归移动轮次分支并同步所属对话与折叠组。
