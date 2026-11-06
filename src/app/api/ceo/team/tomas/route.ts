import { NextRequest, NextResponse } from 'next/server'
import { AI_MODEL_SMART, callClaude, extractJson } from '@/lib/ai'
import { classifyAiError } from '@/lib/ai-health'
import { logActivity, runAs } from '@/lib/agent-ledger'
import { lintPost } from '@/lib/compliance'
import { hashtagsFor } from '@/lib/platforms'
import { prisma } from '@/lib/prisma'
import { teamUser } from '@/lib/team-auth'

export const maxDuration = 90

const DEFAULT_CHARACTER = 'a friendly Latina woman in her mid-30s, shoulder-length dark brown wavy hair, warm brown eyes, natural light makeup, wearing a navy blazer over a white top, small gold stud earrings'

// Tomás (video): convierte un post en una tanda de prompts para Veo 3 (clips cortos con voz). No genera el video: tú lo creas en Veo.
export async function POST(req: NextRequest) {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const b = (await req.json().catch(() => ({}))) as { postId?: string }
  const post = b.postId ? await prisma.generatedPost.findFirst({ where: { id: b.postId, userId: u.userId }, include: { company: { select: { name: true } }, brandProfile: { select: { videoCharacter: true, visualStyle: true } } } }) : null
  if (!post) return NextResponse.json({ error: 'Elige un post' }, { status: 400 })
  const character = post.brandProfile.videoCharacter?.trim() || DEFAULT_CHARACTER

  const prompt = `You are Tomás, the video prompt writer for "${post.company.name}" (tax and accounting services for Latino small-business owners in the US). Turn the post below into a vertical short video (reel of about 25-35 seconds) made of consecutive clips for Google Veo 3, which generates short clips (about 8 seconds each) with synchronized voice and sound.

POST (Spanish):
"""${post.copy.slice(0, 1500)}"""
Verified facts you may use (do not invent others): ${post.facts.join(' | ') || 'none'}

CHARACTER (describe her IDENTICALLY, word for word, in EVERY clip prompt so the person looks the same): ${character}

RULES FOR THE CLIPS (3 to 5 clips):
- Each clip prompt is self-contained, written in ENGLISH, and includes: the character description verbatim; setting and lighting; one simple action; camera (e.g. medium close-up, static or slow push-in); a calm, warm, professional tone; and the exact spoken line.
- The spoken line is in SPANISH (Latin American), in quotes, maximum 18 words per clip so it fits in about 8 seconds. Say it in the prompt like: She says in Spanish, warmly: "…".
- Add to every prompt: "Vertical 9:16. No subtitles, no on-screen text, no logos, no watermarks. Natural, realistic, no distortions."
- Clip 1 is a strong hook (max 9 words spoken). The last clip invites to write us a message and ends the video.
- Spoken content: explain each acronym in plain Spanish; no promises or guarantees of savings or results ("may help", "could"); any example with numbers says its assumption; mention conditions or who does NOT qualify at least once; never invent clients, testimonials or prices.
- On-screen text and the legal line are added later in the editor, so write them separately: "onScreen" = short text (max 7 words) to overlay on that clip.

Reply ONLY with this JSON:
{"hook":"the hook line in Spanish","clips":[{"seconds":8,"dialogue":"Spanish line","onScreen":"short Spanish overlay text","prompt":"complete English Veo prompt for this clip"}],"caption":"Spanish caption to publish with the reel, ending with: Cifras de referencia; confírmalas en IRS.gov o con un profesional.","editorNotes":"2-3 short sentences in Spanish: order of the clips, overlay text, add the legal line 'Información de referencia. Confírmala en IRS.gov o con un profesional.' at the end"}`
  try {
    const text = await runAs('tomas', () => callClaude({ model: AI_MODEL_SMART, messages: [{ role: 'user', content: prompt }], maxTokens: 2500 }))
    const d = extractJson(text) as { hook?: string; clips?: { seconds?: number; dialogue?: string; onScreen?: string; prompt?: string }[]; caption?: string; editorNotes?: string } | null
    const clips = (d?.clips ?? []).filter((c) => c.prompt?.trim() && c.dialogue?.trim()).slice(0, 6).map((c, i) => ({
      n: i + 1, seconds: Math.min(10, Math.max(4, Math.round(Number(c.seconds) || 8))), dialogue: String(c.dialogue).trim(), onScreen: String(c.onScreen ?? '').trim(), prompt: String(c.prompt).trim(),
    }))
    if (!d?.hook || clips.length < 2) return NextResponse.json({ error: 'No pude armar los prompts. Intenta de nuevo.' }, { status: 502 })
    const flags = lintPost({ copy: [d.hook, ...clips.map((c) => c.dialogue), d.caption ?? ''].join('\n') }).filter((i) => i.level === 'error').map((i) => i.message)
    await logActivity('tomas', 'script', `Preparó ${clips.length} prompts de video para Veo sobre «${post.topic.slice(0, 60)}»`, { companyId: post.companyId })
    return NextResponse.json({
      hook: d.hook, clips, caption: d.caption ?? '', hashtags: hashtagsFor('instagram', post.hashtags), editorNotes: d.editorNotes ?? '',
      character, usingDefaultCharacter: !post.brandProfile.videoCharacter?.trim(), flags,
    })
  } catch (err) {
    return NextResponse.json({ error: classifyAiError(err).message }, { status: 502 })
  }
}
