export interface StrokePoint { x: number; y: number }
export interface Stroke { color: string; width: number; points: StrokePoint[] }
export interface TextBox { id: string; x: number; y: number; text: string; color: string; fontSize: number }

export interface MindNode { id: string; text: string; color: string; x: number; y: number }
export interface MindBranch extends MindNode { children: MindNode[] }

export interface InkPage {
  id: string
  type: 'ink'
  title: string
  strokes: Stroke[]
  textBoxes: TextBox[]
}

export interface MindmapPage {
  id: string
  type: 'mindmap'
  title: string
  center: MindNode
  branches: MindBranch[]
}

export type MeetingPage = InkPage | MindmapPage

let counter = 0
export function newId(prefix: string): string {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter}`
}

export function newInkPage(title = 'Página'): InkPage {
  return { id: newId('page'), type: 'ink', title, strokes: [], textBoxes: [] }
}

export function newMindmapPage(title = 'Mapa mental'): MindmapPage {
  return {
    id: newId('page'),
    type: 'mindmap',
    title,
    center: { id: newId('node'), text: 'Tema central', color: '#22d3ee', x: 500, y: 400 },
    branches: [],
  }
}

/** Plain-text dump of a mind map's labels — used as extra context for task
 * extraction, since typed labels don't need OCR/vision the way ink does. */
export function mindmapToText(page: MindmapPage): string {
  const lines = [`Tema central: ${page.center.text}`]
  for (const b of page.branches) {
    lines.push(`- ${b.text}`)
    for (const c of b.children) lines.push(`  - ${c.text}`)
  }
  return lines.join('\n')
}
