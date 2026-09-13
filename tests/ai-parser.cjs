const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const source = fs.readFileSync('src/App.vue', 'utf8')
const code = source.slice(source.indexOf('interface ParsedAction'), source.indexOf('async function proposeInternalToolActions')) + '\nexport { parseActions, internalToolRequest };'
const result = {}
vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: result })
for (const [input, expected] of [
  ['<kp>闭包|书籍|章节|unknown</kp>', 'create_knowledge_point'],
  ['<drawio><mxGraphModel><root/></mxGraphModel></drawio>', 'create_diagram'],
  ['<mindmap># Test\n- a</mindmap>', 'create_mindmap'],
  ['[[ACTION:mindmap_legacy|Test|# Test\n- a]]', 'create_mindmap'],
  ['<plan>{"goal":"Study","weeks":[{"week":1,"tasks":["read"]}]}</plan>', 'create_plan'],
  ['<exercise_set>{"title":"Test","questions":[{"prompt":"Q","answer":"A"}]}</exercise_set>', 'create_exercise_set'],
  ['[[ACTION:conversation|create|Test]]', 'create_conversation'],
  ['<summary>Summary</summary>', 'create_note']
]) {
  const action = result.parseActions(input)[0]
  assert.equal(result.internalToolRequest(action).action, expected)
}
console.log('AI parser: map, legacy map, plan, exercises, conversation and summary PASS')
