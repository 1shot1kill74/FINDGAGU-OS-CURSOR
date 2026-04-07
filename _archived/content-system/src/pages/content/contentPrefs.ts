type StoredPrefs = Record<string, unknown>

function readPrefsObject(key: string): StoredPrefs {
  if (typeof window === 'undefined') return {}
  const raw = window.localStorage.getItem(key)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as StoredPrefs) : {}
  } catch {
    return {}
  }
}

function writePrefsObject(key: string, value: StoredPrefs) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

const CONTENT_QUEUE_PREFS_KEY = 'content-queue-prefs'
const CONTENT_DISTRIBUTION_PREFS_KEY = 'content-distribution-prefs'
const CONTENT_AUTOMATION_PREFS_KEY = 'content-automation-prefs'
const CONTENT_TEMPLATE_PREFS_KEY = 'content-template-prefs'
const CONTENT_DETAIL_PREFS_PREFIX = 'content-detail-prefs:'

export function readContentQueuePrefs() {
  const prefs = readPrefsObject(CONTENT_QUEUE_PREFS_KEY)
  return {
    query: typeof prefs.query === 'string' ? prefs.query : '',
  }
}

export function writeContentQueuePrefs(query: string) {
  writePrefsObject(CONTENT_QUEUE_PREFS_KEY, { query })
}

export function readContentDistributionPrefs() {
  const prefs = readPrefsObject(CONTENT_DISTRIBUTION_PREFS_KEY)
  return {
    query: typeof prefs.query === 'string' ? prefs.query : '',
  }
}

export function writeContentDistributionPrefs(query: string) {
  writePrefsObject(CONTENT_DISTRIBUTION_PREFS_KEY, { query })
}

export function readContentAutomationPrefs() {
  const prefs = readPrefsObject(CONTENT_AUTOMATION_PREFS_KEY)
  return {
    query: typeof prefs.query === 'string' ? prefs.query : '',
    selectedJobId: typeof prefs.selectedJobId === 'string' ? prefs.selectedJobId : '',
  }
}

export function writeContentAutomationPrefs(query: string, selectedJobId: string) {
  writePrefsObject(CONTENT_AUTOMATION_PREFS_KEY, { query, selectedJobId })
}

export function readContentTemplatePrefs() {
  const prefs = readPrefsObject(CONTENT_TEMPLATE_PREFS_KEY)
  return {
    query: typeof prefs.query === 'string' ? prefs.query : '',
    selectedId: typeof prefs.selectedId === 'string' ? prefs.selectedId : '',
  }
}

export function writeContentTemplatePrefs(query: string, selectedId: string) {
  writePrefsObject(CONTENT_TEMPLATE_PREFS_KEY, { query, selectedId })
}

export function readContentDetailPrefs(contentId: string) {
  const prefs = readPrefsObject(`${CONTENT_DETAIL_PREFS_PREFIX}${contentId}`)
  return {
    activeTab: typeof prefs.activeTab === 'string' ? prefs.activeTab : 'basic',
    selectedChannel: typeof prefs.selectedChannel === 'string' ? prefs.selectedChannel : '',
  }
}

export function writeContentDetailPrefs(contentId: string, activeTab: string, selectedChannel: string) {
  writePrefsObject(`${CONTENT_DETAIL_PREFS_PREFIX}${contentId}`, { activeTab, selectedChannel })
}
