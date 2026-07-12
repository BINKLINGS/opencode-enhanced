import type { JSX } from "solid-js"
import { NEW_SESSION_CONTENT_WIDTH } from "@/pages/session/new-session-layout"

export function NewSessionDesignView(props: { children: JSX.Element }) {
  return (
    <div data-component="session-new-design" class="relative size-full overflow-hidden bg-transparent">
      <div class="absolute inset-x-0 bottom-[clamp(32px,8vh,96px)] flex justify-center px-6">
        <div class={NEW_SESSION_CONTENT_WIDTH}>
          {props.children}
        </div>
      </div>
    </div>
  )
}
