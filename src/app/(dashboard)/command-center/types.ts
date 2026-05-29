// Shared client-side types for the CEO Command Center (JSON shapes from the API).

export interface CEOCompany {
  id: string
  userId: string
  name: string
  color: string
  emoji: string
  country: string[]
  strategicWeight: number
  isActive: boolean
  createdAt: string
  updatedAt: string
  pendingIdeas?: number
  pendingBlocks?: number
}

export interface MarketingIdea {
  id: string
  userId: string
  companyId: string
  title: string
  description: string | null
  type: string
  status: string
  priority: number
  convertedToTask: boolean
  scheduledDate: string | null
  doneAt: string | null
  createdAt: string
  updatedAt: string
  company?: CEOCompany
}

export interface WorkBlock {
  id: string
  userId: string
  dailyPlanId: string
  companyId: string
  title: string
  description: string | null
  startTime: string
  endTime: string
  durationHours: number
  blockType: string
  status: string
  isFixed: boolean
  rolledFromDate: string | null
  rolledToDate: string | null
  linkedIdeaId: string | null
  company?: CEOCompany
}

export interface DailyPlan {
  id: string
  userId: string
  date: string
  dayStatusId: string
  status: string
  completedAt: string | null
  workBlocks: WorkBlock[]
}

export interface DayStatus {
  id: string
  userId: string
  date: string
  status: string
  availableHours: number
  note: string | null
  dailyPlan: DailyPlan | null
}

export interface WeekDay {
  date: string
  dayStatus: DayStatus | null
  plan: DailyPlan | null
  totalHours: number
  completedHours: number
  pendingBlocks: number
  totalBlocks: number
  completedBlocks: number
}

export interface RolloverResult {
  dayStatus: DayStatus | null
  rolledBlocks: number
  nextWorkDay: string | null
}

export interface BrandProfile {
  id: string
  userId: string
  companyId: string
  tone: string
  targetAudience: string
  contentPillars: string[]
  competitors: string[] | null
  bestDays: string[] | null
  bestHours: Record<string, string> | null
  createdAt: string
  updatedAt: string
  // Extra fields returned by the API after AI analysis
  competitorInsights?: string
  recommendedFrequency?: Record<string, number>
}

export type PostPlatform = 'instagram' | 'tiktok' | 'email' | 'whatsapp'
export type PostContentType = 'reel' | 'post' | 'story' | 'caption' | 'email'
export type PostStatus = 'draft' | 'ready' | 'published'

export interface GeneratedPost {
  id: string
  userId: string
  companyId: string
  brandProfileId: string
  workBlockId: string | null
  platform: string
  contentType: string
  topic: string
  copy: string
  hashtags: string[]
  cta: string
  contentNotes: string | null
  status: string
  scheduledDate: string | null
  publishedAt: string | null
  weekNumber: number
  dayOfWeek: number
  createdAt: string
  updatedAt: string
  company?: CEOCompany
}
