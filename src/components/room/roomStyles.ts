/**
 * Colour utilities stay in the markup on purpose: the project's light-theme
 * overrides match on the Tailwind class names, so anything baked into CSS with
 * `@apply` would stay dark. These constants keep the room consistent without
 * hiding the classes the theme needs to see.
 */
export const roomCabinet = 'room-cabinet border-stone-800 bg-stone-950/80';
export const roomCabinetAmber = 'room-cabinet border-amber-500/35 bg-stone-950/80';
export const roomMarquee = 'room-marquee border-stone-800';
export const roomMarqueeAmber = 'room-marquee border-amber-500/25';
export const roomCard = 'room-card border border-stone-800 bg-stone-900';
export const roomMeter = 'room-meter bg-stone-800';

export const roomChoiceIdle = 'room-choice border-stone-800 bg-stone-900 hover:border-stone-700';
export const roomChoiceSelected = 'room-choice border-amber-500/60 bg-amber-500/10';

export const roomStepIdle = 'room-step border-stone-800 text-stone-400 hover:border-stone-700 hover:text-stone-200';
export const roomStepDone = 'room-step border-stone-700 text-stone-300';
export const roomStepActive = 'room-step border-amber-500 bg-amber-500 font-semibold text-stone-950';
