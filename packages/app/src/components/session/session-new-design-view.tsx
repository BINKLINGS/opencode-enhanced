import { Show, type JSX } from "solid-js"
import { Logo } from "@opencode-ai/ui/logo"
import { NEW_SESSION_CONTENT_WIDTH } from "@/pages/session/new-session-layout"

export function NewSessionDesignView(props: { children: JSX.Element; projectName?: string }) {
  return (
    <div data-component="session-new-design" class="relative size-full overflow-hidden bg-transparent">
      <Show when={props.projectName}>
        {(projectName) => (
          <div class="claude-new-session-heading absolute inset-x-0 top-[42%] flex -translate-y-1/2 flex-col items-center px-6 text-center">
            <Logo class="mb-5 w-26 text-v2-icon-icon-muted opacity-70" />
            <h1 class="text-2xl font-[530] leading-tight text-v2-text-text-base">
              What should we build in {projectName()}?
            </h1>
          </div>
        )}
      </Show>
      <div class="absolute inset-x-0 bottom-[clamp(32px,8vh,96px)] flex justify-center px-6">
        <div class={NEW_SESSION_CONTENT_WIDTH}>
          {props.children}
        </div>
      </div>
    </div>
  )
}
