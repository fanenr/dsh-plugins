/**
 * ui-patch — the one identity both halves and both features share.
 *
 * The namespace is also the settings namespace: the Host entry's live `Config`
 * is stored under this key in the profile's patch document, and the browser
 * half reads it back as the `percent` field's form.
 *
 * @module dsh-ui-patch/shared
 */

/** Dictionary namespace, settings namespace, and Host entry id, all one string. */
export const NS = 'ui-patch'
