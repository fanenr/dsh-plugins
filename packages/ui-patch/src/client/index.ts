/**
 * ui-patch — the browser half.
 *
 * Two independent UI corrections that share one bundle because they share one
 * deployment story: both are small, both are "dsh does X, I want Y", and both
 * ship together in one profile entry.
 *
 * ## Conversation width
 *
 * One owned stylesheet carries the whole visual effect:
 *
 * - It hides the built-in transcript width drag handles and neutralizes their
 *   `localStorage` preference, so the width axis answers to this plugin alone.
 * - Its trailing rule redefines the conversation root's
 *   `--dsh-chat-content-width` from the column width dsh already publishes on
 *   that element, so the percentage tracks live window and sidebar resizes
 *   with no ResizeObserver of our own.
 *
 * A Settings row writes the preference; the form subscription rewrites the
 * tag's text in place.
 *
 * ## Menu movement
 *
 * Control-P and Control-N move the selection in whichever dsh menu is open, by
 * replaying the arrow press dsh already handles. Nothing reimplements
 * navigation and nothing is patched: the keys are reserved as fixed shortcut
 * actions, the framework's own door for keys that belong to a local control
 * rather than to an application command.
 *
 * Three framework facts make that door work, and each is load-bearing:
 *
 * 1. `registerFixed` validates physical codes with `normalizeBinding` only —
 *    it does NOT run `bindingIssue`. So `Control+P`/`Control+N` can be
 *    reserved on the Web runtime, where the *editable* catalog refuses those
 *    same combinations as `unsupported-browser`. Chromium really does deliver
 *    Control-P (its print dialog is preventable), which is the case this
 *    feature exists for.
 * 2. A fixed reservation is exclusive in both directions: it cannot be bound
 *    over, and claiming a combination another command already holds disables
 *    *that* row. `ui-sidebar-files` holds `primary+KeyP`, which is Control-P
 *    wherever `primary` expands to Control, so the reservation is decided
 *    against the live catalog rather than assumed.
 * 3. `installKeyboard` delivers every unconsumed keydown to
 *    `observeFixedInput` after local controls had their turn, including keys
 *    the command dispatcher does not know — which is why these fire while the
 *    composer keeps focus.
 *
 * @module dsh-ui-patch/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the config-forms Context merge (ctx.configForms) and the
// ConfigForm face.
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ShortcutBinding, ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import { NS } from '../shared.ts'
import { PERCENT_FIELD, type WidthSettings } from '../width.ts'
import { CLAIMED_CHORDS, matchClaimedChord, replayKeyInit } from '../keys.ts'
import type { ClaimedChord } from '../keys.ts'
import { WidthRow, type WidthRowInjected } from './WidthRow.tsx'
import { en, zh } from './locales.ts'
import { adoptStyles, styleText } from './styles.ts'

/**
 * Nothing is re-exported for consumers: this bundle is loaded as a client
 * module and the framework calls {@link apply}, so the module surface is
 * deliberately just the plugin entry points below.
 */

/** Client bundle id, stamped onto owned style tags for HMR bookkeeping. */
const PLUGIN_ID = 'dsh-ui-patch'

/** Services this client half requires. */
export const inject = ['slots', 'locale', 'configForms']

/** Command ids this plugin owns, so it never reads its own rows as a conflict. */
const OWN_IDS = new Set<string>(CLAIMED_CHORDS.map(chord => chord.id))

/**
 * The permission panel's root attribute. Escape there rejects the request, so
 * it is never a dismissal target — the framework's own Escape-stop excludes
 * the same attribute for the same reason.
 */
const APPROVAL_SELECTOR = '[data-approval-key]'

/** The physical combination one chord claims. */
function bindingOf(chord: ClaimedChord): ShortcutBinding {
  return { code: chord.code, modifiers: ['control'] }
}

/**
 * Hand a claimed chord to the focused surface, as the keystroke it stands for.
 *
 * The replay is aimed at whatever holds focus rather than at the surface, so
 * the surface's own layering decides the outcome exactly as it does for a real
 * key press: Escape with a menu open inside a dialog closes the menu first,
 * and a second press closes the dialog.
 *
 * This is also why the replay is safe to send at all. A real Escape is
 * harmless to the conversation's Esc-Esc stop sequence only because the
 * surface handling it calls `preventDefault()` before the event bubbles to the
 * window listener, whose first guard is `defaultPrevented`. The replay rides
 * the identical path — dispatched on the focused element, bubbling through the
 * surface's own handler and only then reaching the window — so it inherits
 * that protection instead of needing a copy of it. The gate below is the other
 * half: nothing is dispatched unless a surface is actually open.
 * @param document - document owning the focused control and the open surface.
 * @param chord - the claimed chord being fired.
 * @returns whether the gesture was taken; false leaves the key to the page.
 */
function replayIntoFocus(document: Document, chord: ClaimedChord): boolean {
  // The keyboard owner is whatever holds focus: a menuitem under the shared
  // Menu primitive, the model picker's trigger or cell, the composer textarea
  // (the trigger menu keeps its highlight there and reads arrows through the
  // Lexical keymap), the command card's search input, or a dialog's control.
  const target = document.activeElement
  if (!(target instanceof HTMLElement) || !target.isConnected) return false
  // Menus and dialogs unmount when closed, so a live match means one is open.
  // Gating on the surface BEFORE dispatching is what keeps these chords from
  // leaking into the page: no panel open means the keystroke is not ours.
  if (target.closest(chord.surfaces) === null && document.querySelector(chord.surfaces) === null) return false
  // Escape means "reject this request" in the permission panel, not "dismiss
  // something" — a chord that silently answered no to a tool approval would be
  // a footgun. The panel is not in any dismissible selector, so this can only
  // be reached by focus sitting there while a dialog is open; `data-approval-key`
  // is the same exclusion the framework's own Escape-stop uses.
  if (chord.replay === 'Escape' && target.closest(APPROVAL_SELECTOR) !== null) return false
  target.dispatchEvent(new KeyboardEvent('keydown', replayKeyInit(chord.replay)))
  return true
}

/**
 * Install the width stylesheet and its Settings row.
 * @param ctx - client root context carrying the form and slot services.
 */
function applyWidth(ctx: ClientContext): void {
  const form: ConfigForm<WidthSettings> = ctx.configForms.get<WidthSettings>(NS)
  ctx.effect(() => {
    const tag = adoptStyles(PLUGIN_ID)
    if (tag === undefined) return () => {}
    const publish = (): void => { tag.textContent = styleText(form.getSnapshot().value?.[PERCENT_FIELD]) }
    const unsubscribe = form.subscribe(publish)
    publish()
    return () => { unsubscribe(); tag.remove() }
  }, 'dsh-ui-patch: stylesheet and width rule')

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'ui-patch',
    order: 16,
    locale: NS,
    inject: (): WidthRowInjected => ({ form }),
  }, WidthRow))
}

/**
 * Reserve the claimed chords, replay their keystrokes, and publish the
 * reference rows.
 * @param ctx - client root context, used to acquire the shortcut service.
 * @param t - translate seat bound to this plugin's namespace.
 */
function applyChords(ctx: ClientContext, t: TranslateNS<typeof NS>): void {
  ctx.inject(['shortcuts'], (scope) => {
    const held = new Map<ClaimedChord, () => void>()
    /**
     * Keep a reservation exactly while its combination is free.
     *
     * This is a live reconciliation rather than a one-time check because
     * command owners register through their own `inject(['shortcuts'])`
     * callbacks, whose order relative to this plugin is not guaranteed. Asking
     * the catalog answers the same question whichever way that order falls,
     * and re-asking whenever a command comes or goes keeps it true.
     *
     * The predicate ignores this plugin's own rows — `describeBinding` counts
     * fixed reservations too, so after a successful claim the row is its own
     * conflict — which is what keeps the reconciliation from oscillating: the
     * answer changes only when another owner comes or goes. The `syncing`
     * guard is still required, because `registerFixed` publishes the catalog
     * synchronously and re-enters this function before `held` records the row.
     */
    let syncing = false
    const syncReservations = (): void => {
      if (syncing) return
      syncing = true
      try {
        for (const chord of CLAIMED_CHORDS) {
          const binding = bindingOf(chord)
          const free = scope.shortcuts.describeBinding(binding).conflicts.every(id => OWN_IDS.has(id))
          const registration = held.get(chord)
          if (!free) {
            if (registration !== undefined) { registration(); held.delete(chord) }
            continue
          }
          if (registration !== undefined) continue
          held.set(chord, scope.shortcuts.registerFixed({
            id: chord.id as ShortcutCommandId,
            label: () => t(chord.message),
            keys: scope.shortcuts.describeBinding(binding).keys,
            bindings: [binding],
            group: 'menus',
          }))
        }
      } finally { syncing = false }
    }
    // One listener for every chord, owned by the same effect as the rows, so
    // the disposer releases the reservations and the replay together.
    scope.effect(() => {
      const off = scope.shortcuts.catalog.subscribe(syncReservations)
      syncReservations()
      return () => { off(); syncReservations() }
    }, 'dsh-ui-patch: chord reservations')
    scope.effect(() => scope.shortcuts.observeFixedInput((input) => {
      if (input.type !== 'keydown') return
      const chord = matchClaimedChord(input.gesture)
      if (chord === null) return
      // A chord another command holds was never reserved, so it stays that
      // command's key and this plugin keeps its hands off it.
      if (!held.has(chord)) return
      if (!replayIntoFocus(document, chord)) return
      // Claim it: the reference now says dsh owns this key, so the browser must
      // not also act on it.
      input.consume()
    }), 'dsh-ui-patch: chord replay')
  })
}

/**
 * Install both corrections.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-ui-patch: dictionaries')
  applyWidth(ctx)
  applyChords(ctx, t)
}
