import { SaxesParser } from 'saxes'

/** Intentionally limited, offline-only mxGraph XML. Never render unvalidated AI markup. */
export function validateDiagram(xml: string): { nodes: number; edges: number } {
  if (!xml.trim() || xml.length > 200_000) throw new Error('图表 XML 为空或超过 200000 字符')
  const attributes: Record<string, string[]> = {
    mxfile: ['host', 'modified', 'agent', 'version', 'type'], diagram: ['id', 'name'],
    mxGraphModel: ['dx', 'dy', 'grid', 'gridSize', 'guides', 'tooltips', 'connect', 'arrows', 'fold', 'page', 'pageScale', 'pageWidth', 'pageHeight', 'math', 'shadow'],
    root: [], mxCell: ['id', 'value', 'style', 'vertex', 'edge', 'parent', 'source', 'target', 'connectable', 'visible', 'collapsed'],
    mxGeometry: ['x', 'y', 'width', 'height', 'as', 'relative'], mxPoint: ['x', 'y', 'as'], Array: ['as']
  }
  const parents: Record<string, string[]> = { mxfile: [], diagram: ['mxfile'], mxGraphModel: ['diagram'], root: ['mxGraphModel'], mxCell: ['root'], mxGeometry: ['mxCell'], mxPoint: ['mxGeometry', 'Array'], Array: ['mxGeometry'] }
  const safeStyles = new Set('rounded whiteSpace html fillColor strokeColor fontColor fontSize fontStyle align verticalAlign shape ellipse rhombus edgeStyle endArrow startArrow endFill startFill strokeWidth dashed dashPattern perimeter jettySize orthogonalLoop curved labelBackgroundColor spacing spacingTop spacingBottom spacingLeft spacingRight'.split(' '))
  const cells = new Map<string, Record<string, string>>()
  const stack: string[] = []
  let models = 0, roots = 0, pages = 0, nodes = 0, edges = 0
  let currentCell = ''
  const geometries = new Set<string>()
  const parser = new SaxesParser({ xmlns: false })
  parser.on('doctype', () => { throw new Error('不允许图表 DTD') })
  parser.on('processinginstruction', () => { throw new Error('不允许图表处理指令') })
  parser.on('text', value => { if (value.trim()) throw new Error('仅支持未压缩的图表 XML') })
  parser.on('cdata', () => { throw new Error('不允许图表 CDATA') })
  parser.on('opentag', tag => {
    const name = tag.name, attrs = tag.attributes
    if (!Object.hasOwn(attributes, name) || stack.length > 32) throw new Error('不支持的图表节点或嵌套过深')
    if (stack.length ? !parents[name].includes(stack.at(-1)!) : !['mxfile', 'mxGraphModel'].includes(name)) throw new Error('图表 XML 层次无效')
    for (const [key, value] of Object.entries(attrs)) {
      if (!attributes[name].includes(key)) throw new Error(`不支持的图表属性：${key}`)
      if (/[<&]/.test(value) || /(?:https?:|file:|data:|javascript:|\/\/)/i.test(value)) throw new Error('图表不允许 HTML、链接或外部资源')
      if (['x', 'y', 'width', 'height'].includes(key) && (!Number.isFinite(Number(value)) || Math.abs(Number(value)) > 100_000 || (['width', 'height'].includes(key) && Number(value) <= 0))) throw new Error('图表坐标或尺寸无效')
    }
    if (name === 'mxGraphModel') models++
    if (name === 'diagram') pages++
    if (name === 'root') roots++
    if (name === 'mxGeometry') {
      if (geometries.has(currentCell) || attrs.as !== 'geometry') throw new Error('图表节点 geometry 无效或重复')
      geometries.add(currentCell)
    }
    if (name === 'mxCell') {
      if (!attrs.id || cells.has(attrs.id) || cells.size >= 1000) throw new Error('图表 ID 缺失、重复或节点过多')
      if (attrs.vertex === '1' && attrs.edge === '1') throw new Error('图表节点不能同时为连线')
      for (const style of (attrs.style || '').split(';').filter(Boolean)) {
        const [key, value = ''] = style.split('=')
        if (!safeStyles.has(key) || !/^[\w#., -]*$/.test(value) || (key === 'shape' && !['rectangle', 'ellipse', 'rhombus', 'hexagon', 'cylinder', 'parallelogram', 'actor', 'cloud'].includes(value))) throw new Error(`不支持的图表样式：${key}`)
      }
      cells.set(attrs.id, attrs)
      currentCell = attrs.id
      if (attrs.vertex === '1') nodes++
      if (attrs.edge === '1') edges++
    }
    stack.push(name)
  })
  parser.on('closetag', () => { if (stack.pop() === 'mxCell') currentCell = '' })
  parser.write(xml).close()
  if (models !== 1 || roots !== 1 || pages > 1 || !nodes || !cells.has('0') || cells.get('1')?.parent !== '0') throw new Error('图表需要单页模型、根层和至少一个节点')
  for (const [id, cell] of cells) {
    if ((cell.vertex === '1' || cell.edge === '1') && !geometries.has(id)) throw new Error('图表节点缺少 geometry')
    if (id !== '0' && (!cell.parent || !cells.has(cell.parent))) throw new Error('图表父节点不存在')
    if (id === '0' && cell.parent) throw new Error('图表根节点不能有父节点')
    const seen = new Set([id]); let parent: string | undefined = cell.parent
    while (parent) { if (seen.has(parent)) throw new Error('图表父节点存在循环'); seen.add(parent); parent = cells.get(parent)?.parent }
    if (cell.edge === '1' && (!cells.get(cell.source)?.vertex || !cells.get(cell.target)?.vertex)) throw new Error('图表连线端点不存在')
  }
  return { nodes, edges }
}
