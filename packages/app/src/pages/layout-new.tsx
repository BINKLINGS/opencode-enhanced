import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, Suspense, type ParentProps } from "solid-js"
import { useLocation, useNavigate } from "@solidjs/router"
import { DebugBar } from "@/components/debug-bar"
import { HelpButton, TabsInfoPopup } from "@/components/help-button"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useServer } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { usePlatform } from "@/context/platform"
import { useServerSync } from "@/context/server-sync"
import { tabKey, useTabs } from "@/context/tabs"
import { useDirectoryPicker } from "@/components/directory-picker"
import { setNavigate } from "@/utils/notification-click"
import { setV2Toast, ToastRegion } from "@/utils/toast"
import { useSettingsCommand } from "@/components/settings-dialog"
import { getFilename } from "@opencode-ai/core/util/path"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { sortedRootSessions } from "./layout/helpers"
import { decode64 } from "@/utils/base64"
import { pathKey } from "@/utils/path-key"
import { sessionTitle } from "@/utils/session-title"

export default function NewLayout(props: ParentProps) {
  const navigate = useNavigate()
  const language = useLanguage()
  setNavigate(navigate)
  useSettingsCommand()

  createEffect(() => setV2Toast(true))

  return (
    <div
      class="claude-window relative flex-1 min-h-0 min-w-0 flex flex-col select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text"
      style={{
        "padding-top": "env(safe-area-inset-top, 0px)",
        "padding-bottom": "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div class="claude-layout flex-1 min-h-0 min-w-0 flex overflow-hidden">
        <ClaudeSidebar />
        <main class="claude-main flex-1 min-h-0 min-w-0 overflow-x-hidden flex flex-col items-start contain-strict">
          <Suspense>{props.children}</Suspense>
        </main>
      </div>
      {import.meta.env.DEV && <DebugBar inline />}
      <TabsInfoPopup />
      <HelpButton />
      <ToastRegion v2 />
    </div>
  )
}

function ClaudeSidebar() {
  const layout = useLayout()
  const sync = useServerSync()
  const location = useLocation()
  const navigate = useNavigate()
  const language = useLanguage()
  const command = useCommand()
  const server = useServer()
  const sdk = useServerSDK()
  const platform = usePlatform()
  const tabs = useTabs()
  const pickDirectory = useDirectoryPicker()
  const [pinned, setPinned] = createSignal(true)
  const [hovered, setHovered] = createSignal(false)
  const [projectMenu, setProjectMenu] = createSignal(false)
  const [searchOpen, setSearchOpen] = createSignal(false)
  const [searchQuery, setSearchQuery] = createSignal("")
  const [now, setNow] = createSignal(Date.now())
  const [deleteTarget, setDeleteTarget] = createSignal<
    | { type: "project"; worktree: string; label: string }
    | { type: "session"; id: string; label: string }
  >()

  onMount(() => {
    const stored = localStorage.getItem("opencode-claude-sidebar")
    if (stored !== null) setPinned(stored === "pinned")
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    onCleanup(() => window.clearInterval(timer))
  })

  createEffect(() => {
    localStorage.setItem("opencode-claude-sidebar", pinned() ? "pinned" : "floating")
  })

  const visible = createMemo(() => pinned() || hovered())

  const directory = createMemo(() => {
    const route = location.pathname.split("/")
    const draft =
      location.pathname === "/new-session"
        ? tabs.store.find((item) => item.type === "draft" && item.draftID === location.query.draftId)
        : undefined
    if (draft?.type === "draft") return draft.directory
    const isServerSession = route[1] === "server" && route[3] === "session"
    const routeDir = isServerSession ? undefined : route[1]
    const sessionID = isServerSession ? route[4] : route[3]
    const tab = tabs.store.find((item) => item.type === "session" && item.sessionId === sessionID)
    if (tab?.type === "session") {
      const tabDirectory = tabs.info[tabKey(tab)]?.directory
      if (tabDirectory) return tabDirectory
    }
    if (routeDir) {
      const decoded = decode64(routeDir)
      if (decoded) return decoded
    }
    const session = sessionID ? sync().session.get(sessionID) : undefined
    if (session?.directory) return session.directory
    return layout.home.selection().directory ?? layout.projects.list()[0]?.worktree
  })
  const project = createMemo(() => {
    const dir = directory()
    if (!dir) return
    const key = pathKey(dir)
    return layout.projects.list().find(
      (item) => pathKey(item.worktree) === key || item.sandboxes?.some((sandbox) => pathKey(sandbox) === key),
    )
  })
  const sessions = createMemo(() => {
    const dir = directory()
    if (!dir) return []
    const [store] = sync().child(dir, { bootstrap: false })
    return sortedRootSessions(store, now())
  })
  const visibleSessions = createMemo(() => {
    const query = searchQuery().trim().toLowerCase()
    if (!query) return sessions()
    return sessions().filter((session) => (sessionTitle(session.title) ?? "").toLowerCase().includes(query))
  })
  const currentSession = createMemo(() => {
    const route = location.pathname.split("/")
    return route[1] === "server" && route[3] === "session" ? route[4] : route[3]
  })

  createEffect(() => {
    const dir = directory()
    if (!dir) return
    void sync().project.loadSessions(dir)
  })

  const goToSession = (id: string) => {
    const tab = tabs.addSessionTab({ server: server.key, sessionId: id })
    tabs.select(tab)
  }

  const newSession = () => {
    const dir = directory()
    if (!dir) return
    tabs.newDraft({ server: server.key, directory: dir })
  }

  const addProject = () => {
    const current = server.current
    if (!current) return
    const onSelect = (value: string | string[] | null) => {
      const directories = value ? (Array.isArray(value) ? value : [value]) : []
      const first = directories[0]
      if (!first) return
      directories.forEach((item) => layout.projects.open(item))
      layout.home.setSelection({ server: server.key, directory: first })
      setProjectMenu(false)
      navigate("/")
    }
    if (platform.platform === "desktop") {
      void platform.openDirectoryPickerDialog({ title: "Add project", multiple: true }).then(onSelect)
      return
    }
    pickDirectory({ server: current, title: "Add project", multiple: true, onSelect })
  }

  const selectProject = (worktree: string) => {
    layout.projects.open(worktree)
    layout.home.setSelection({ server: server.key, directory: worktree })
    setProjectMenu(false)
    navigate("/")
  }

  const removeProject = (worktree: string) => {
    setDeleteTarget({ type: "project", worktree, label: getFilename(worktree) })
  }

  const deleteSession = (id: string) => {
    const session = sync().session.get(id)
    if (!session) return
    setDeleteTarget({ type: "session", id, label: sessionTitle(session.title) || "this session" })
  }

  const confirmDelete = async () => {
    const target = deleteTarget()
    if (!target) return
    if (target.type === "project") {
      layout.projects.close(target.worktree)
      if (pathKey(directory() ?? "") === pathKey(target.worktree)) {
        layout.home.setSelection({ server: server.key })
        navigate("/")
      }
      setProjectMenu(false)
      setDeleteTarget()
      return
    }
    const result = await sdk()
      .client.session.delete({ sessionID: target.id })
      .then((response) => response.data)
      .catch(() => false)
    if (!result) return
    tabs.removeSessionTab({ server: server.key, sessionId: target.id })
    if (currentSession() === target.id) navigate("/")
    setDeleteTarget()
  }

  const projectName = createMemo(() => {
    const item = project()
    const dir = directory()
    return item?.name || (item ? getFilename(item.worktree) : dir ? getFilename(dir) : "Project")
  })

  return (
    <div class="claude-sidebar-rail relative shrink-0 min-h-0" classList={{ "claude-sidebar-pinned": pinned() }}>
      <div class="claude-sidebar-hotzone" onMouseEnter={() => setHovered(true)} />
      <aside
        class="claude-sidebar absolute inset-y-0 left-0 z-40 flex min-h-0 flex-col"
        classList={{ "claude-sidebar-visible": visible(), "claude-sidebar-pinned": pinned() }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          if (!pinned() && !projectMenu()) setHovered(false)
        }}
      >
      <div class="claude-sidebar-header flex shrink-0 items-center justify-between gap-2">
        <button
          type="button"
          class="claude-project-switcher flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => setProjectMenu((value) => !value)}
        >
          <span class="claude-project-mark flex size-7 shrink-0 items-center justify-center rounded-md">
            <Icon name="folder-add-left" size="small" />
          </span>
          <span class="min-w-0 truncate text-13-medium">{projectName()}</span>
          <Icon name="chevron-down" size="small" class="shrink-0 text-v2-icon-icon-muted" />
        </button>
        <IconButtonV2
          icon={<Icon name={pinned() ? "chevron-left" : "chevron-right"} size="small" />}
          variant="ghost-muted"
          size="small"
          class="claude-sidebar-toggle shrink-0"
          onClick={() => setPinned((value) => !value)}
          aria-label={pinned() ? "Unpin sidebar" : "Pin sidebar"}
        />
      </div>

      <Show when={visible() && projectMenu()}>
        <div class="claude-project-menu absolute left-3 right-3 top-[52px] z-30 flex flex-col gap-1 rounded-lg p-1">
          <For each={layout.projects.list()}>
            {(item) => (
              <div class="claude-project-menu-row flex items-center gap-1">
              <button
                type="button"
                class="claude-project-menu-item flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left"
                onClick={() => selectProject(item.worktree)}
              >
                <Icon name="folder" size="small" />
                <span class="min-w-0 flex-1 truncate">{item.name || getFilename(item.worktree)}</span>
              </button>
              <IconButtonV2
                icon={<Icon name="trash" size="small" />}
                variant="ghost-muted"
                size="small"
                class="claude-project-remove shrink-0"
                onClick={() => removeProject(item.worktree)}
                aria-label={`Remove ${item.name || getFilename(item.worktree)}`}
              />
              </div>
            )}
          </For>
          <button type="button" class="claude-project-menu-item flex items-center gap-2 rounded-md px-2 text-left" onClick={addProject}>
            <Icon name="folder-add-left" size="small" />
            <span>Add project</span>
          </button>
        </div>
      </Show>

      <div class="claude-sidebar-body flex min-h-0 flex-1 flex-col">
          <div class="claude-sidebar-actions flex shrink-0 flex-col gap-1 px-3 pb-4">
            <button type="button" class="claude-sidebar-action" onClick={newSession}>
              <Icon name="plus-small" size="small" />
              <span>{language.t("command.session.new")}</span>
            </button>
            <button type="button" class="claude-sidebar-action" onClick={() => setSearchOpen((value) => !value)}>
              <Icon name="magnifying-glass" size="small" />
              <span>Search sessions</span>
            </button>
          </div>

          <Show when={searchOpen()}>
            <div class="claude-session-search mx-3 mb-3 flex items-center gap-2 rounded-md px-2">
              <Icon name="magnifying-glass" size="small" />
              <input
                class="min-w-0 flex-1 bg-transparent text-12-regular outline-none"
                value={searchQuery()}
                onInput={(event) => setSearchQuery(event.currentTarget.value)}
                placeholder="Search sessions"
                autofocus
              />
            </div>
          </Show>

          <div class="claude-sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3">
            <div class="claude-sidebar-section-label">Recent sessions</div>
            <Show
              when={visibleSessions().length > 0}
              fallback={<div class="claude-sidebar-empty">No sessions yet</div>}
            >
              <nav class="flex flex-col gap-1">
                <For each={visibleSessions()}>
                  {(session) => (
                    <div class="claude-session-row group flex min-w-0 items-center gap-1">
                    <button
                      type="button"
                      class="claude-session-item flex min-w-0 flex-1 items-center gap-2 text-left"
                      classList={{ "claude-session-item-active": currentSession() === session.id }}
                      onClick={() => goToSession(session.id)}
                    >
                      <span class="claude-session-dot shrink-0" />
                      <span class="min-w-0 flex-1 truncate">{sessionTitle(session.title)}</span>
                      <Show when={sync().session.data.session_working(session.id)}>
                        <span class="claude-session-working shrink-0" />
                      </Show>
                    </button>
                    <IconButtonV2
                      icon={<Icon name="trash" size="small" />}
                      variant="ghost-muted"
                      size="small"
                      class="claude-session-remove shrink-0"
                      onClick={() => deleteSession(session.id)}
                      aria-label={`Delete ${sessionTitle(session.title) || "session"}`}
                    />
                    </div>
                  )}
                </For>
              </nav>
            </Show>
          </div>

          <div class="claude-sidebar-footer shrink-0 px-3 pt-4">
            <button type="button" class="claude-sidebar-action" onClick={() => command.trigger("settings.open")}>
              <Icon name="settings-gear" size="small" />
              <span>Settings</span>
            </button>
            <button type="button" class="claude-sidebar-action" onClick={() => navigate("/")}>
              <Icon name="folder-add-left" size="small" />
              <span>Projects</span>
            </button>
          </div>
      </div>
      </aside>
      <Show when={deleteTarget()}>
        {(target) => (
          <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-6">
            <div role="dialog" aria-modal="true" class="w-full max-w-sm rounded-xl border border-v2-border-border-base bg-[rgb(38_36_38)] p-5 shadow-[0_20px_48px_rgb(0_0_0_/_35%)]">
              <h2 class="text-16-medium text-v2-text-text-base">Delete {target().type}?</h2>
              <p class="mt-2 text-13-regular text-v2-text-text-muted">
                <Show when={target().type === "project"} fallback={`Delete ${target().label}? This cannot be undone.`}>
                  Remove {target().label} from your project list?
                </Show>
              </p>
              <div class="mt-5 flex justify-end gap-2">
                <button type="button" class="rounded-md px-3 py-2 text-13-medium text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover" onClick={() => setDeleteTarget()}>
                  Cancel
                </button>
                <button type="button" class="rounded-md bg-v2-state-bg-danger px-3 py-2 text-13-medium text-v2-state-fg-danger" onClick={() => void confirmDelete()}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
