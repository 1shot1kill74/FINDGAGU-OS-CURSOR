#!/usr/bin/env npx tsx
import 'dotenv/config'

import { randomUUID } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { basename, extname, join, resolve } from 'path'

import pLimit from 'p-limit'
import { createClient } from '@supabase/supabase-js'

const HOME = process.env.HOME || process.env.USERPROFILE || ''
const STAGING_ROOT = resolve(HOME, 'findgagu-os-data', 'staging')
const CHAT_MEDIA_BUCKET = 'chat-media'
const IMPORT_SENDER_ID = 'google_chat_import'
const IMPORT_SOURCE = 'google_chat_takeout_import'
const UPLOAD_CONCURRENCY = 4

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

interface RawAttachedFile {
  original_name?: string
  export_name?: string
}

interface RawMessage {
  creator?: {
    email?: string
    user_type?: string
  }
  created_date?: string
  updated_date?: string
  text?: string
  attached_files?: RawAttachedFile[]
  topic_id?: string
  message_id?: string
}

interface RawMessagesFile {
  messages?: RawMessage[]
}

interface GroupInfo {
  name?: string
}

interface ParsedArgs {
  spaceId: string
  takeoutFolder: string | null
  consultationId: string | null
}

interface PreparedInsertRow {
  consultation_id: string
  sender_id: string
  content: string
  message_type: 'TEXT' | 'FILE'
  file_url: string | null
  file_name: string | null
  created_at: string
  is_visible: boolean
  metadata: Json
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2)
  let spaceId = ''
  let takeoutFolder: string | null = null
  let consultationId: string | null = null

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--space-id' && args[i + 1]) {
      spaceId = args[++i] ?? ''
    } else if (arg?.startsWith('--space-id=')) {
      spaceId = arg.split('=')[1] ?? ''
    } else if (arg === '--takeout' && args[i + 1]) {
      takeoutFolder = args[++i] ?? null
    } else if (arg?.startsWith('--takeout=')) {
      takeoutFolder = arg.split('=')[1] ?? null
    } else if (arg === '--consultation-id' && args[i + 1]) {
      consultationId = args[++i] ?? null
    } else if (arg?.startsWith('--consultation-id=')) {
      consultationId = arg.split('=')[1] ?? null
    }
  }

  if (!spaceId) {
    console.error('사용: npx tsx scripts/importGoogleChatSpaceHistory.ts --space-id AAAA... [--takeout "Takeout 3"] [--consultation-id uuid]')
    process.exit(1)
  }

  return { spaceId, takeoutFolder, consultationId }
}

function getSupabaseEnv() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim()

  if (!url || !key) {
    console.error('Supabase 환경변수가 없습니다. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY(또는 VITE_SUPABASE_ANON_KEY)를 설정하세요.')
    process.exit(1)
  }

  return { url, key }
}

function getTakeoutCandidates(takeoutFolder: string | null): string[] {
  if (takeoutFolder) return [takeoutFolder]
  return ['Takeout', 'Takeout 2', 'Takeout 3', 'Takeout 4', 'Takeout 5', 'Takeout 6', 'Takeout 7', 'Takeout 8', 'Takeout 9']
}

function resolveSpaceFolder(spaceId: string, takeoutFolder: string | null): string {
  for (const folder of getTakeoutCandidates(takeoutFolder)) {
    const candidate = join(STAGING_ROOT, folder, 'Google Chat', 'Groups', `Space ${spaceId}`)
    if (existsSync(candidate)) return candidate
  }

  console.error(`스페이스 폴더를 찾지 못했습니다: ${spaceId}`)
  process.exit(1)
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T
  } catch {
    return fallback
  }
}

function parseGoogleChatDate(raw: string | undefined): string {
  if (!raw) return new Date().toISOString()

  const normalized = raw.replace(/\s+/g, ' ').trim()
  const m = normalized.match(
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일.*?\s+(AM|PM)\s*(\d{1,2})시\s*(\d{1,2})분\s*(\d{1,2})초\s*UTC/i
  )

  if (!m) {
    const fallback = new Date(normalized)
    return Number.isNaN(fallback.getTime()) ? new Date().toISOString() : fallback.toISOString()
  }

  const [, year, month, day, meridiem, rawHour, minute, second] = m
  let hour = Number(rawHour)
  if (meridiem.toUpperCase() === 'AM') {
    if (hour === 12) hour = 0
  } else if (hour < 12) {
    hour += 12
  }

  return new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    hour,
    Number(minute),
    Number(second)
  )).toISOString()
}

function normalizeText(text: string | undefined): string {
  return String(text ?? '').replace(/\r\n/g, '\n').trim()
}

function sanitizeFileName(fileName: string): string {
  const base = basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_')
  return base || `file_${Date.now()}`
}

function getMimeType(fileName: string): string {
  const ext = extname(fileName).toLowerCase()
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
  }
  return map[ext] ?? 'application/octet-stream'
}

async function resolveOrCreateConsultation(
  supabase: ReturnType<typeof createClient>,
  spaceId: string,
  groupName: string,
  forcedConsultationId: string | null
): Promise<string> {
  const spaceName = `spaces/${spaceId}`
  const googleChatUrl = `https://mail.google.com/chat/u/0/#chat/space/${spaceId}`

  if (forcedConsultationId) {
    const { data, error } = await supabase
      .from('consultations')
      .select('id, metadata')
      .eq('id', forcedConsultationId)
      .single()

    if (error || !data) {
      throw new Error(`consultation_id를 찾을 수 없습니다: ${forcedConsultationId}`)
    }

    const metadata = typeof data.metadata === 'object' && data.metadata !== null
      ? data.metadata as Record<string, Json>
      : {}

    await supabase
      .from('consultations')
      .update({
        channel_chat_id: spaceName,
        metadata: {
          ...metadata,
          google_chat_url: googleChatUrl,
          space_id: spaceId,
          import_source: IMPORT_SOURCE,
        },
      })
      .eq('id', forcedConsultationId)

    return forcedConsultationId
  }

  const { data: existingRows, error: existingError } = await supabase
    .from('consultations')
    .select('id, metadata')
    .or(`channel_chat_id.eq.${spaceName},channel_chat_id.eq.${spaceId}`)
    .limit(1)

  if (existingError) {
    throw existingError
  }

  const existing = existingRows?.[0]
  if (existing?.id) {
    const metadata = typeof existing.metadata === 'object' && existing.metadata !== null
      ? existing.metadata as Record<string, Json>
      : {}

    await supabase
      .from('consultations')
      .update({
        channel_chat_id: spaceName,
        metadata: {
          ...metadata,
          google_chat_url: googleChatUrl,
          space_id: spaceId,
          import_source: IMPORT_SOURCE,
        },
      })
      .eq('id', existing.id)

    return existing.id
  }

  const { data: inserted, error: insertError } = await supabase
    .from('consultations')
    .insert({
      company_name: groupName || `Google Chat ${spaceId}`,
      manager_name: groupName || `Google Chat ${spaceId}`,
      contact: '',
      status: '접수',
      is_visible: true,
      is_test: false,
      channel_chat_id: spaceName,
      metadata: {
        google_chat_url: googleChatUrl,
        space_id: spaceId,
        import_source: IMPORT_SOURCE,
      },
    })
    .select('id')
    .single()

  if (insertError || !inserted?.id) {
    throw insertError ?? new Error('consultation 생성 실패')
  }

  return inserted.id
}

async function clearPreviousImport(
  supabase: ReturnType<typeof createClient>,
  consultationId: string
): Promise<void> {
  const { data, error } = await supabase
    .from('consultation_messages')
    .select('id, file_url')
    .eq('consultation_id', consultationId)
    .eq('sender_id', IMPORT_SENDER_ID)

  if (error) throw error

  if (!data?.length) return

  const storagePaths = data
    .map((row) => row.file_url)
    .filter((path): path is string => Boolean(path) && !String(path).startsWith('http'))

  const ids = data.map((row) => row.id)

  const { error: deleteErr } = await supabase
    .from('consultation_messages')
    .delete()
    .in('id', ids)

  if (deleteErr) throw deleteErr

  for (let i = 0; i < storagePaths.length; i += 100) {
    const chunk = storagePaths.slice(i, i + 100)
    await supabase.storage.from(CHAT_MEDIA_BUCKET).remove(chunk)
  }
}

async function main() {
  const { spaceId, takeoutFolder, consultationId: forcedConsultationId } = parseArgs()
  const { url, key } = getSupabaseEnv()
  const supabase = createClient(url, key)

  const spaceFolder = resolveSpaceFolder(spaceId, takeoutFolder)
  const groupInfo = readJsonFile<GroupInfo>(join(spaceFolder, 'group_info.json'), {})
  const rawMessages = readJsonFile<RawMessagesFile>(join(spaceFolder, 'messages.json'), { messages: [] })
  const messages = Array.isArray(rawMessages.messages) ? rawMessages.messages : []

  if (messages.length === 0) {
    console.error('messages.json 안에 가져올 메시지가 없습니다.')
    process.exit(1)
  }

  const consultationId = await resolveOrCreateConsultation(
    supabase,
    spaceId,
    groupInfo.name?.trim() || `Google Chat ${spaceId}`,
    forcedConsultationId
  )

  await clearPreviousImport(supabase, consultationId)

  const limit = pLimit(UPLOAD_CONCURRENCY)
  const preparedPromises: Array<Promise<PreparedInsertRow[]>> = []

  messages.forEach((message, messageIndex) => {
    preparedPromises.push(limit(async () => {
      const rows: PreparedInsertRow[] = []
      const createdAtIso = parseGoogleChatDate(message.created_date ?? message.updated_date)
      const createdAtMs = new Date(createdAtIso).getTime()
      const authorEmail = message.creator?.email?.trim() || 'unknown'
      const baseMetadata: Record<string, Json> = {
        source: IMPORT_SOURCE,
        space_id: spaceId,
        topic_id: message.topic_id ?? null,
        message_id: message.message_id ?? null,
        author_email: authorEmail,
        author_type: message.creator?.user_type ?? null,
        original_created_date: message.created_date ?? null,
        original_updated_date: message.updated_date ?? null,
      }

      const text = normalizeText(message.text)
      if (text) {
        rows.push({
          consultation_id: consultationId,
          sender_id: IMPORT_SENDER_ID,
          content: `[${authorEmail}] ${text}`,
          message_type: 'TEXT',
          file_url: null,
          file_name: null,
          created_at: new Date(createdAtMs).toISOString(),
          is_visible: true,
          metadata: {
            ...baseMetadata,
            import_order: messageIndex,
            kind: 'text',
          },
        })
      }

      const attachedFiles = Array.isArray(message.attached_files) ? message.attached_files : []
      for (let fileIndex = 0; fileIndex < attachedFiles.length; fileIndex++) {
        const file = attachedFiles[fileIndex]!
        const originalName = (file.original_name || file.export_name || 'attachment').trim()
        const exportName = (file.export_name || file.original_name || 'attachment').trim()
        const localPath = join(spaceFolder, exportName)
        const rowTime = new Date(createdAtMs + (text ? fileIndex + 1 : fileIndex)).toISOString()

        let fileUrl: string | null = null
        let missing = false
        let uploadError: string | null = null

        if (existsSync(localPath)) {
          const storagePath = `${consultationId}/google-chat/${spaceId}/${randomUUID()}_${sanitizeFileName(originalName)}`
          const { error: storageError } = await supabase.storage
            .from(CHAT_MEDIA_BUCKET)
            .upload(storagePath, readFileSync(localPath), {
              contentType: getMimeType(originalName),
              upsert: false,
            })

          if (storageError) {
            uploadError = storageError.message
          } else {
            fileUrl = storagePath
          }
        } else {
          missing = true
        }

        rows.push({
          consultation_id: consultationId,
          sender_id: IMPORT_SENDER_ID,
          content: originalName,
          message_type: 'FILE',
          file_url: fileUrl,
          file_name: originalName,
          created_at: rowTime,
          is_visible: true,
          metadata: {
            ...baseMetadata,
            import_order: messageIndex,
            kind: 'file',
            export_name: exportName,
            local_path: localPath,
            file_missing: missing,
            upload_error: uploadError,
          },
        })
      }

      return rows
    }))
  })

  const preparedRows = (await Promise.all(preparedPromises))
    .flat()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  if (preparedRows.length === 0) {
    console.error('삽입할 행이 없습니다.')
    process.exit(1)
  }

  for (let i = 0; i < preparedRows.length; i += 200) {
    const chunk = preparedRows.slice(i, i + 200)
    const { error } = await supabase.from('consultation_messages').insert(chunk)
    if (error) throw error
    console.log(`insert ${Math.min(i + chunk.length, preparedRows.length)}/${preparedRows.length}`)
  }

  const firstCreatedAt = preparedRows[0]?.created_at ?? null
  const lastCreatedAt = preparedRows[preparedRows.length - 1]?.created_at ?? null

  const { data: consultationRow } = await supabase
    .from('consultations')
    .select('metadata')
    .eq('id', consultationId)
    .single()

  const currentMetadata = typeof consultationRow?.metadata === 'object' && consultationRow.metadata !== null
    ? consultationRow.metadata as Record<string, Json>
    : {}

  await supabase
    .from('consultations')
    .update({
      metadata: {
        ...currentMetadata,
        google_chat_url: `https://mail.google.com/chat/u/0/#chat/space/${spaceId}`,
        space_id: spaceId,
        import_source: IMPORT_SOURCE,
        imported_message_count: preparedRows.length,
        imported_at: new Date().toISOString(),
        first_imported_message_at: firstCreatedAt,
        last_imported_message_at: lastCreatedAt,
      },
    })
    .eq('id', consultationId)

  const textCount = preparedRows.filter((row) => row.message_type === 'TEXT').length
  const fileCount = preparedRows.filter((row) => row.message_type === 'FILE').length
  const missingCount = preparedRows.filter((row) => {
    const meta = row.metadata
    return Boolean(meta && typeof meta === 'object' && !Array.isArray(meta) && meta.file_missing === true)
  }).length
  const failedUploadCount = preparedRows.filter((row) => {
    const meta = row.metadata
    return Boolean(meta && typeof meta === 'object' && !Array.isArray(meta) && typeof meta.upload_error === 'string' && meta.upload_error)
  }).length

  console.log('--- import complete ---')
  console.log(`consultation_id: ${consultationId}`)
  console.log(`space_id: ${spaceId}`)
  console.log(`group_name: ${groupInfo.name ?? ''}`)
  console.log(`messages inserted: ${preparedRows.length}`)
  console.log(`text rows: ${textCount}`)
  console.log(`file rows: ${fileCount}`)
  console.log(`missing files: ${missingCount}`)
  console.log(`failed uploads: ${failedUploadCount}`)
  console.log(`range: ${firstCreatedAt ?? '-'} -> ${lastCreatedAt ?? '-'}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
