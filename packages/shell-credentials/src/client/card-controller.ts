/**
 * The card's staged form over the composed entry.
 *
 * Mirrors a builtin settings card: a controller owns the shared
 * `SettingsFormModel` and projects what the card renders, the slot entry
 * injects that face, and the component only draws it. Staging, the dirty and
 * invalid gates, the unset-on-clear rule, and keeping drafts after a refused
 * save are the model's, not this file's.
 */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  SettingsFormModel,
  type SettingsFieldState,
  type SettingsFormActions,
  type SettingsFormScope,
  type SettingsFormShell,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { settingsListField } from '../shared.ts'

/** The bundle entry's configuration section, as this card edits it. */
export interface ShellCredentialsSettings {
  /** Names to forward; empty selects by dsh's credential shape. */
  include?: string[]
  /** Names never forwarded. */
  exclude?: string[]
}

/** What the card renders. */
export interface ShellCredentialsCardState extends SettingsFormShell {
  /** Names to forward. */
  include: SettingsFieldState
  /** Names never forwarded. */
  exclude: SettingsFieldState
}

/** The registration-side face the slot entry injects. */
export interface ShellCredentialsCardFace extends SettingsFormActions {
  hooks: {
    /** Snapshot bound by the renderer as the card's selector. */
    card: SnapshotStore<ShellCredentialsCardState>
  }
}

/** Bridges the entry's settings form onto the card's staged form. */
export class ShellCredentialsCardController {
  private readonly form: SettingsFormModel<ShellCredentialsSettings>
  private readonly store: SnapshotStore<ShellCredentialsCardState>

  /** @param scope - the shared configuration form of the composed entry. */
  constructor(scope: SettingsFormScope<ShellCredentialsSettings>) {
    this.form = new SettingsFormModel(scope, [settingsListField('include'), settingsListField('exclude')])
    this.store = this.form.bind(() => this.projection())
  }

  private projection(): ShellCredentialsCardState {
    return {
      ...this.form.shell(),
      include: this.form.field('include'),
      exclude: this.form.field('exclude'),
    }
  }

  /**
   * Build the face the slot registration injects.
   * @returns the card's snapshot and the form's actions.
   */
  inject(): ShellCredentialsCardFace {
    return { hooks: { card: this.store }, ...this.form.actions() }
  }

  /** Release the form's subscription. */
  dispose(): void { this.form.dispose() }
}
