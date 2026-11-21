import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
  keymap,
} from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";

import { fetcher } from "./fetcher";

// StateEffect: A way to send "messages" to update state.
// We define one effect type for setting the suggestion text.
const setSuggestionEffect = StateEffect.define<string | null>();

// StateEffect for setting the waiting status per editor view
const setWaitingEffect = StateEffect.define<boolean>();

// StateField: Holds our suggestion state in the editor.
// - create(): Returns the initial value when the editor loads
// - update(): Called on every transaction (keystroke, etc.) to potentially update the value
const suggestionState = StateField.define<string | null>({
  create() {
    return null;
  },
  update(value, transaction) {
    // Check each effect in this transaction
    // If we find our setSuggestionEffect, return its new value
    // Otherwise, keep the current value unchanged
    for (const effect of transaction.effects)
      if (effect.is(setSuggestionEffect)) return effect.value;

    return value;
  },
});

const isWaitingState = StateField.define<boolean>({
  create() {
    return false;
  },
  update(value, transaction) {
    for (const effect of transaction.effects)
      if (effect.is(setWaitingEffect)) return effect.value;

    return value;
  },
});

// WidgetType: Creates custom DOM elements to display in the editor.
// toDOM() is called by CodeMirror to create the actual HTML element.
class SuggestionWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  toDOM() {
    const span = document.createElement("span");
    span.textContent = this.text;
    span.style.opacity = "0.4"; // Ghost text appearance
    span.style.pointerEvents = "none"; // Don't interfere with clicks
    return span;
  }
}

const DEBOUNCE_DELAY = 300;

const generatePayload = (view: EditorView, fileName: string) => {
  const code = view.state.doc.toString();
  if (!code || code.trim().length === 0) return null;

  const cursorPosition = view.state.selection.main.head;
  const currentLine = view.state.doc.lineAt(cursorPosition);
  const cursorInLine = cursorPosition - currentLine.from;

  const previousLines: string[] = [];
  const previousLinesToFetch = Math.min(5, currentLine.number - 1);
  for (let i = previousLinesToFetch; i >= 1; i--) {
    previousLines.push(view.state.doc.line(currentLine.number - i).text);
  }

  const nextLines: string[] = [];
  const totalLines = view.state.doc.lines;
  const linesToFetch = Math.min(5, totalLines - currentLine.number);
  for (let i = 1; i <= linesToFetch; i++) {
    nextLines.push(view.state.doc.line(currentLine.number + i).text);
  }

  return {
    fileName,
    code,
    currentLine: currentLine.text,
    previousLines: previousLines.join("\n"),
    textBeforeCursor: currentLine.text.slice(0, cursorInLine),
    textAfterCursor: currentLine.text.slice(cursorInLine),
    nextLines: nextLines.join("\n"),
    lineNumber: currentLine.number,
  };
};

const createDebouncePlugin = (fileName: string) => {
  return ViewPlugin.fromClass(
    class {
      private debounceTimer: number | null = null;
      private currentAbortController: AbortController | null = null;
      private requestId = 0;
      private destroyed = false;
      public isWaiting = false;

      constructor(view: EditorView) {
        this.triggerSuggestion(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet)
          this.triggerSuggestion(update.view);
      }

      triggerSuggestion(view: EditorView) {
        if (this.destroyed) return;

        if (this.debounceTimer !== null) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = null;
        }

        if (this.currentAbortController !== null) {
          this.currentAbortController.abort();
          this.currentAbortController = null;
        }

        const currentRequestId = ++this.requestId;
        this.isWaiting = true;

        this.debounceTimer = window.setTimeout(async () => {
          if (this.destroyed || this.requestId !== currentRequestId) {
            return;
          }

          const payload = generatePayload(view, fileName);
          if (!payload) {
            this.isWaiting = false;
            if (!this.destroyed && this.requestId === currentRequestId) {
              view.dispatch({
                effects: [
                  setWaitingEffect.of(false),
                  setSuggestionEffect.of(null),
                ],
              });
            }
            return;
          }

          const abortController = new AbortController();
          this.currentAbortController = abortController;

          try {
            const suggestion = await fetcher(
              payload,
              abortController.signal,
            );

            if (
              this.destroyed ||
              this.requestId !== currentRequestId ||
              abortController.signal.aborted
            ) {
              return;
            }

            this.isWaiting = false;

            // Ensure document hasn't changed under us if payload code doesn't match
            if (view.state.doc.toString() !== payload.code) {
              view.dispatch({
                effects: setWaitingEffect.of(false),
              });
              return;
            }

            view.dispatch({
              effects: [
                setWaitingEffect.of(false),
                setSuggestionEffect.of(suggestion),
              ],
            });
          } catch {
            this.isWaiting = false;
            if (!this.destroyed && this.requestId === currentRequestId) {
              view.dispatch({
                effects: setWaitingEffect.of(false),
              });
            }
          } finally {
            if (this.currentAbortController === abortController) {
              this.currentAbortController = null;
            }
          }
        }, DEBOUNCE_DELAY);
      }

      destroy() {
        this.destroyed = true;
        this.requestId++;
        this.isWaiting = false;

        if (this.debounceTimer !== null) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = null;
        }

        if (this.currentAbortController !== null) {
          this.currentAbortController.abort();
          this.currentAbortController = null;
        }
      }
    },
  );
};

type DebouncePluginType = ReturnType<typeof createDebouncePlugin>;

const renderPlugin = (debouncePlugin: DebouncePluginType) => ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }

    update(update: ViewUpdate) {
      // Rebuild decorations if doc changed, cursor moved, or suggestion/waiting state changed
      const stateChanged = update.transactions.some((transaction) => {
        return transaction.effects.some((effect) => {
          return effect.is(setSuggestionEffect) || effect.is(setWaitingEffect);
        });
      });

      const shouldRebuild =
        update.docChanged || update.selectionSet || stateChanged;

      if (shouldRebuild) this.decorations = this.build(update.view);
    }

    build(view: EditorView) {
      const plugin = view.plugin(debouncePlugin);
      if (plugin?.isWaiting) return Decoration.none;
      if (view.state.field(isWaitingState, false)) return Decoration.none;

      // Get current suggestion from state
      const suggestion = view.state.field(suggestionState, false);
      if (!suggestion) return Decoration.none;

      // Create a widget decoration at the cursor position
      const cursor = view.state.selection.main.head;
      return Decoration.set([
        Decoration.widget({
          widget: new SuggestionWidget(suggestion),
          side: 1, // Render after cursor (side: 1), not before (side: -1)
        }).range(cursor),
      ]);
    }
  },
  { decorations: (plugin) => plugin.decorations }, // Tell CodeMirror to use our decorations
);

const acceptSuggestionKeymap = keymap.of([
  {
    key: "Tab",
    run: (view) => {
      const suggestion = view.state.field(suggestionState);
      if (!suggestion) {
        return false; // No suggestion? Let Tab do its normal thing (indent)
      }

      const cursor = view.state.selection.main.head;
      view.dispatch({
        changes: { from: cursor, insert: suggestion }, // Insert the suggestion text
        selection: { anchor: cursor + suggestion.length }, // Move cursor to end
        effects: setSuggestionEffect.of(null), // Clear the suggestion
      });
      return true; // We handled Tab, don't indent
    },
  },
]);

export const suggestion = (fileName: string) => {
  const debouncePlugin = createDebouncePlugin(fileName);
  return [
    suggestionState, // Our state storage
    isWaitingState, // View-isolated waiting state
    debouncePlugin, // Triggers suggestions on typing
    renderPlugin(debouncePlugin), // Renders the ghost text
    acceptSuggestionKeymap, // Tab to accept
  ];
};
