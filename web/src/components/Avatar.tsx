import { useEffect, useState } from "react";

// Stylised, clearly illustrated fallback companion (used when the photo avatar is off or fails). Five mouth shapes
// follow Polly viseme timings; the AI badge is part of the component so it can never be hidden. The look follows the
// pronouns of the person the companion stands in for: "she" and "he" get feminine and masculine styling, "they" (and
// the neutral Haven companion) a neither-way look.

export type Mouth = "rest" | "closed" | "narrow" | "open" | "round";
export type AvatarState = "idle" | "listening" | "thinking" | "speaking";
export type AvatarLook = "she" | "he" | "they";

const MOUTHS: Record<Mouth, string> = {
  rest: "M128 214 Q150 226 172 214 Q150 220 128 214 Z",
  closed: "M130 216 Q150 219 170 216 Q150 221 130 216 Z",
  narrow: "M132 212 Q150 222 168 212 Q150 228 132 212 Z",
  open: "M134 208 Q150 214 166 208 Q164 236 150 238 Q136 236 134 208 Z",
  round: "M140 208 Q150 204 160 208 Q166 222 150 230 Q134 222 140 208 Z",
};

// back hair is drawn behind the face, the fringe over it
const HAIR: Record<AvatarLook, { back: string; fringe: string }> = {
  she: {
    back: "M70 170 Q62 70 150 58 Q238 70 230 170 Q236 250 210 290 L90 290 Q64 250 70 170 Z",
    fringe: "M88 150 Q96 86 150 84 Q206 86 214 150 Q196 112 150 108 Q112 110 88 150 Z",
  },
  he: {
    back: "M82 172 Q74 80 150 70 Q226 80 218 172 Q212 128 150 120 Q88 128 82 172 Z",
    fringe: "M90 146 Q90 90 150 86 Q210 90 210 146 Q204 118 176 112 Q146 106 122 116 Q100 126 90 146 Z",
  },
  they: {
    back: "M72 172 Q64 70 150 60 Q236 70 228 172 Q232 216 210 232 L90 232 Q68 216 72 172 Z",
    fringe: "M88 152 Q94 88 150 86 Q208 88 212 152 Q200 118 164 110 Q120 106 88 152 Z",
  },
};

export function Avatar({ mouth, state, badge, dim, look = "they" }: { mouth: Mouth; state: AvatarState; badge: string; dim?: boolean; look?: AvatarLook }) {
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 140);
        loop();
      }, 2600 + Math.random() * 2400);
    };
    loop();
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`avatar avatar--${state}${dim ? " avatar--dim" : ""}`}>
      <svg viewBox="0 0 300 330" role="img" aria-label={`${badge}: an illustrated AI companion`}>
        <defs>
          <radialGradient id="bg" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="var(--avatar-glow)" />
            <stop offset="100%" stopColor="var(--avatar-bg)" />
          </radialGradient>
        </defs>
        <circle cx="150" cy="160" r="148" fill="url(#bg)" />
        {/* hair, back */}
        <path d={HAIR[look].back} fill="var(--hair)" />
        {/* neck and top: a round-neck jumper, over a shirt collar for "he" */}
        <path d="M128 240 L172 240 L176 276 L124 276 Z" fill="var(--skin-shade)" />
        <path d="M70 330 Q76 278 122 266 Q150 286 178 266 Q224 278 230 330 Z" fill="var(--top)" />
        {look === "he" ? (
          <>
            <path d="M126 262 L150 284 L136 298 L116 272 Z" fill="var(--collar)" />
            <path d="M174 262 L150 284 L164 298 L184 272 Z" fill="var(--collar)" />
          </>
        ) : (
          <path d="M122 266 Q150 286 178 266" fill="none" stroke="var(--top-trim)" strokeWidth="5" strokeLinecap="round" />
        )}
        {/* face */}
        <ellipse cx="150" cy="168" rx={look === "he" ? 64 : 62} ry="76" fill="var(--skin)" />
        {/* ears, with small studs for "she" */}
        <ellipse cx="88" cy="176" rx="9" ry="15" fill="var(--skin-shade)" />
        <ellipse cx="212" cy="176" rx="9" ry="15" fill="var(--skin-shade)" />
        {look === "she" && (
          <>
            <circle cx="88" cy="194" r="4" fill="var(--gold)" />
            <circle cx="212" cy="194" r="4" fill="var(--gold)" />
          </>
        )}
        {/* hair, fringe */}
        <path d={HAIR[look].fringe} fill="var(--hair)" />
        {/* brows */}
        {look === "he" ? (
          <>
            <path d="M110 146 Q124 140 139 144" stroke="var(--hair)" strokeWidth="6" fill="none" strokeLinecap="round" />
            <path d="M161 144 Q176 140 190 146" stroke="var(--hair)" strokeWidth="6" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M112 146 Q126 138 138 145" stroke="var(--hair)" strokeWidth="4" fill="none" strokeLinecap="round" />
            <path d="M162 145 Q174 138 188 146" stroke="var(--hair)" strokeWidth="4" fill="none" strokeLinecap="round" />
          </>
        )}
        {/* eyes */}
        {blink ? (
          <>
            <path d="M114 166 Q125 170 136 166" stroke="var(--pupil)" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M164 166 Q175 170 186 166" stroke="var(--pupil)" strokeWidth="3" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <ellipse cx="125" cy="165" rx="10" ry="7" fill="#fff" />
            <ellipse cx="175" cy="165" rx="10" ry="7" fill="#fff" />
            <circle cx="126" cy="165" r="5" fill="var(--pupil)" />
            <circle cx="176" cy="165" r="5" fill="var(--pupil)" />
            <circle cx="128" cy="163" r="1.6" fill="#fff" />
            <circle cx="178" cy="163" r="1.6" fill="#fff" />
          </>
        )}
        {/* nose, cheeks */}
        <path d="M150 172 Q146 192 141 196 Q150 200 158 196" stroke="var(--skin-line)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <circle cx="112" cy="196" r="10" fill="var(--blush)" opacity={look === "he" ? 0.2 : 0.45} />
        <circle cx="188" cy="196" r="10" fill="var(--blush)" opacity={look === "he" ? 0.2 : 0.45} />
        {/* mouth */}
        <path d={MOUTHS[mouth]} fill={look === "she" ? "var(--lips)" : "var(--lips-soft)"} stroke="var(--lips-line)" strokeWidth="1.5" />
        {mouth === "open" && <path d="M138 214 Q150 222 162 214" stroke="#fff" strokeWidth="3" fill="none" opacity="0.8" />}
      </svg>
      <div className="avatar__badge" aria-label="This is an AI">
        {badge}
      </div>
    </div>
  );
}
