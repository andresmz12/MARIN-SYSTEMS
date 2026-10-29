'use client'

import { useState } from 'react'
import type { GeneratedPost } from '../types'
import { PLATFORM_CONFIG } from '../utils'
import { composePostText } from '@/lib/platforms'

interface Props {
  /** Texto actual (puede venir editado, sin guardar). */
  copy: string
  post: GeneratedPost
  platforms: string[]
  brand: string
}

function imgSrc(url?: string | null): string | null {
  if (!url) return null
  try { return new URL(url).pathname } catch { return url }
}

// Vista previa aproximada de cómo se verá el post en cada red (no es idéntica, pero sirve para revisar).
export function PostPreview({ copy, post, platforms, brand }: Props) {
  const shown = platforms.filter((p) => ['instagram', 'facebook', 'linkedin', 'twitter'].includes(p))
  const [tab, setTab] = useState(shown[0] ?? 'instagram')
  const src = imgSrc(post.imageUrl)
  const text = composePostText(tab, copy, post.hashtags)
  const avatar = (
    <span className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 text-black text-xs font-bold flex items-center justify-center shrink-0">
      {brand.slice(0, 2).toUpperCase()}
    </span>
  )
  const image = src
    ? <img src={src} alt="" className="w-full object-cover" style={{ aspectRatio: tab === 'instagram' ? '4 / 5' : 'auto' }} />
    : <div className="w-full bg-zinc-800 text-zinc-500 text-xs flex items-center justify-center" style={{ aspectRatio: '4 / 5' }}>Aún sin imagen</div>

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {shown.map((p) => (
          <button
            key={p}
            onClick={() => setTab(p)}
            className={`text-xs px-2.5 py-1 rounded-full border ${tab === p ? 'bg-indigo-500/20 text-indigo-200 border-indigo-500/50' : 'text-zinc-400 border-zinc-700'}`}
          >
            {PLATFORM_CONFIG[p]?.emoji} {PLATFORM_CONFIG[p]?.label ?? p}
          </button>
        ))}
      </div>

      <div className="mx-auto w-full max-w-[340px] rounded-lg bg-white text-zinc-900 overflow-hidden text-[13px] leading-snug shadow-lg">
        {tab === 'instagram' && (
          <>
            <div className="flex items-center gap-2 px-3 py-2">{avatar}<b className="text-[13px]">{brand}</b></div>
            {image}
            <div className="px-3 py-2 space-y-1">
              <div className="text-base tracking-wide">♡ 💬 ✈️</div>
              <p className="whitespace-pre-wrap line-clamp-6"><b>{brand}</b> {text}</p>
            </div>
          </>
        )}
        {tab === 'facebook' && (
          <>
            <div className="flex items-center gap-2 px-3 py-2">{avatar}<div><b className="block">{brand}</b><span className="text-[11px] text-zinc-500">Ahora · 🌎</span></div></div>
            <p className="px-3 pb-2 whitespace-pre-wrap">{text}</p>
            {image}
            <div className="px-3 py-2 text-zinc-500 text-xs border-t">👍 Me gusta · 💬 Comentar · ↗ Compartir</div>
          </>
        )}
        {tab === 'linkedin' && (
          <>
            <div className="flex items-center gap-2 px-3 py-2">{avatar}<div><b className="block">{brand}</b><span className="text-[11px] text-zinc-500">Ahora · 🌎</span></div></div>
            <p className="px-3 pb-2 whitespace-pre-wrap">{text}</p>
            {image}
            <div className="px-3 py-2 text-zinc-500 text-xs border-t">👍 Recomendar · 💬 Comentar · 🔁 Compartir</div>
          </>
        )}
        {tab === 'twitter' && (
          <div className="flex gap-2 px-3 py-3">
            {avatar}
            <div className="space-y-1.5 min-w-0">
              <b>{brand}</b>
              <p className="whitespace-pre-wrap">{text}</p>
              {src && <img src={src} alt="" className="w-full rounded-lg" />}
            </div>
          </div>
        )}
      </div>
      <p className="text-[11px] text-zinc-500 text-center">Vista aproximada: cada red puede recortar el texto largo con “ver más”.</p>
    </div>
  )
}
