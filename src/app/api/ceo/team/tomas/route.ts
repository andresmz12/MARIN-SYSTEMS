import { NextRequest, NextResponse } from 'next/server'
import { AI_MODEL, callClaude, extractJson } from '@/lib/ai'
import { classifyAiError } from '@/lib/ai-health'
import { logActivity, runAs } from '@/lib/agent-ledger'
import { lintPost } from '@/lib/compliance'
import { prisma } from '@/lib/prisma'
import { teamUser } from '@/lib/team-auth'

export const maxDuration = 60

// Tomás (video): convierte un post ya escrito en el guion de un reel de ~30 segundos para el avatar. No genera el video.
export async function POST(req: NextRequest) {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const b = (await req.json().catch(() => ({}))) as { postId?: string }
  const post = b.postId ? await prisma.generatedPost.findFirst({ where: { id: b.postId, userId: u.userId }, include: { company: { select: { name: true } } } }) : null
  if (!post) return NextResponse.json({ error: 'Elige un post' }, { status: 400 })

  const prompt = `Eres Tomás, el agente de video de "${post.company.name}" (impuestos y contabilidad para latinos en EE.UU.). Convierte este post en el guion de un reel vertical de unos 30 segundos, hablado por un avatar.
POST:
"""${post.copy}"""
Datos del post (no inventes otros): ${post.facts.join(' | ') || 'ninguno'}

REGLAS: español latino simple; gancho en los primeros 3 segundos (máximo 9 palabras); 4 o 5 escenas cortas; la voz dice máximo 80 palabras en total; sin promesas ni garantías de ahorro; todo ejemplo con números dice su suposición; explica cada sigla; cierra invitando a escribir por mensaje y con la frase "Cifras de referencia; confírmalas en IRS.gov o con un profesional." en pantalla.
Responde ÚNICAMENTE con este JSON:
{"hook":"…","scenes":[{"onScreen":"texto corto en pantalla","voice":"lo que dice el avatar","visual":"qué se ve (en español, simple)"}],"caption":"texto para publicar con el reel","avatarNotes":"tono y gestos del avatar en una frase"}`
  try {
    const text = await runAs('tomas', () => callClaude({ model: AI_MODEL, messages: [{ role: 'user', content: prompt }], maxTokens: 1500 }))
    const d = extractJson(text) as { hook?: string; scenes?: { onScreen?: string; voice?: string; visual?: string }[]; caption?: string; avatarNotes?: string } | null
    const scenes = (d?.scenes ?? []).filter((s) => s.voice?.trim()).slice(0, 6).map((s) => ({ onScreen: String(s.onScreen ?? ''), voice: String(s.voice), visual: String(s.visual ?? '') }))
    if (!d?.hook || scenes.length < 2) return NextResponse.json({ error: 'No pude armar el guion. Intenta de nuevo.' }, { status: 502 })
    const script = [d.hook, ...scenes.map((s) => s.voice), d.caption ?? ''].join('\n')
    const flags = lintPost({ copy: script }).filter((i) => i.level === 'error').map((i) => i.message)
    await logActivity('tomas', 'script', `Escribió el guion de un reel sobre «${post.topic.slice(0, 60)}»`, { companyId: post.companyId })
    return NextResponse.json({ hook: d.hook, scenes, caption: d.caption ?? '', avatarNotes: d.avatarNotes ?? '', flags })
  } catch (err) {
    return NextResponse.json({ error: classifyAiError(err).message }, { status: 502 })
  }
}
