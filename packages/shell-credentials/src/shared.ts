/**
 * The card's renderer-free pieces: how a name list becomes draft text and back,
 * and the shared settings form's frame copy.
 *
 * They live outside `src/client/` because the browser bundle is a closure
 * factory that Node cannot import and `lib/client/` is removed after tsc, so
 * this module is both where the card imports them from and where a unit test
 * can reach them.
 *
 * @module dsh-shell-credentials/shared
 */

/** One editable configuration field: a section key of the entry's config. */
export type Field = 'include' | 'exclude'

/**
 * Read one line-per-name list. Blank lines and surrounding whitespace are
 * ignored, and a repeated name keeps its first position: the Host stores what
 * the field says, so a stray blank line must not become an empty variable name.
 * @param text - the textarea's text.
 * @returns the names in declaration order.
 */
export function parseNames(text: string): string[] {
  const names: string[] = []
  for (const line of text.split('\n')) {
    const name = line.trim()
    if (name !== '' && !names.includes(name)) names.push(name)
  }
  return names
}

/**
 * Render a stored list as textarea text: one name per line, empty as empty.
 * @param names - the stored or resolved list.
 * @returns the text to show.
 */
export function formatNames(names: readonly string[] | undefined): string {
  return names === undefined || names.length === 0 ? '' : `${names.join('\n')}\n`
}

/** How one section field converts between its stored value and its draft text. */
interface ListFieldSpec {
  /** Field name inside the namespace section. */
  field: Field
  /** Render the stored list as one name per line. */
  format: (value: unknown) => string
  /** The write this draft stages; `clear` when the box is empty. */
  parse: (text: string) => { kind: 'set'; value: string[] } | { kind: 'clear' }
}

/**
 * A line-per-name list field for the shared settings form model. The list is
 * the stored value, but the draft is text: an empty box clears the override
 * through `unset` rather than pinning an empty array over the schema default,
 * which is what the model's `clear` write already means.
 *
 * Lives outside `src/client/` because it carries no rendering dependency, so
 * it ships in the host build where a test can run it.
 * @param field - field name inside the namespace section.
 * @returns the field's conversion spec.
 */
export function settingsListField(field: Field): ListFieldSpec {
  return {
    field,
    format: value => Array.isArray(value) ? formatNames(value as string[]) : '',
    parse: (text) => {
      const names = parseNames(text)
      return names.length === 0 ? { kind: 'clear' } : { kind: 'set', value: names }
    },
  }
}

/**
 * The shared settings form's frame copy, read from a card's own dictionary the
 * way a builtin card reads its own. The key union is a parameter so the card's
 * locale stays the single source of its copy.
 * @param t - the card's bound dictionary lookup.
 * @returns the frame labels the form renders.
 */
export function formLabels(t: (key: 'save' | 'saving' | 'saveFailed' | 'readOnly' | 'unavailable') => string) {
  return {
    save: t('save'),
    saving: t('saving'),
    saveFailed: t('saveFailed'),
    readOnly: t('readOnly'),
    unavailable: t('unavailable'),
  }
}
