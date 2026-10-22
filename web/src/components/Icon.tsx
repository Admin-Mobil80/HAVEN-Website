// Material Symbols (loaded in index.html with only the icons below, so the font stays small).
// Decorative by default: the text next to an icon always says what it means.
export type IconName =
  | "add" | "arrow_back" | "arrow_forward" | "call" | "call_end" | "chat" | "check" | "check_circle" | "close"
  | "cottage" | "edit" | "expand_more" | "favorite" | "graphic_eq" | "history" | "home" | "lightbulb"
  | "mark_chat_unread" | "mic" | "person" | "photo_camera" | "play_arrow" | "play_circle" | "psychology"
  | "record_voice_over" | "restart_alt" | "route" | "schedule" | "send" | "shield_with_heart" | "smart_toy"
  | "smartphone" | "stop_circle" | "tablet_mac" | "terminal" | "tune" | "verified" | "verified_user"
  | "volume_up" | "waving_hand" | "wb_twilight" | "done_all" | "push_pin" | "more_vert" | "attach_file" | "lock" | "cancel" | "videocam" | "mood" | "signal_cellular_alt" | "wifi" | "battery_full";

export function Icon({ name, fill, className }: { name: IconName; fill?: boolean; className?: string }) {
  return (
    <span className={`ms${fill ? " ms--fill" : ""}${className ? ` ${className}` : ""}`} aria-hidden="true">
      {name}
    </span>
  );
}
