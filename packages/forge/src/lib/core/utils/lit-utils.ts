import { LitElement, ReactiveController, ReactiveControllerHost, noChange, supportsAdoptingStyleSheets } from 'lit';
import { AsyncDirective } from 'lit/async-directive.js';
import { directive, ElementPart } from 'lit/directive.js';

/**
 * Composes the text content of all provided nodes into a single string.
 * @param nodes The nodes to compose the text content of.
 */
export function composeSlottedTextContent(nodes: Node[]): string {
  return nodes
    .map(node => node.textContent)
    .join(' ')
    .trim();
}

export interface SlotTextControllerOptions {
  /** The name of the slot to observe. Use an empty string for the default slot. */
  slotName: string;
  /** Optional callback invoked when the composed text content changes. */
  onChange?: (text: string) => void;
}

/**
 * A reactive controller that observes slot content and provides its composed text content, updating automatically
 * when the slotted content changes (including dynamic text mutations, not just slot reassignment).
 * @example
 * ```ts
 * class MyComponent extends LitElement {
 *   #labelController = new SlotTextController(this, { slotName: 'label' });
 *
 *   render() {
 *     return html`
 *       <slot name="label" @slotchange=${this.#labelController.handleSlotChange}></slot>
 *       <span>Text: ${this.#labelController.text}</span>
 *     `;
 *   }
 * }
 * ```
 */
export class SlotTextController implements ReactiveController {
  readonly #host: ReactiveControllerHost;
  readonly #options: SlotTextControllerOptions;
  #observer?: MutationObserver;
  #nodes: Node[] = [];
  #text = '';

  constructor(host: ReactiveControllerHost, options: SlotTextControllerOptions) {
    this.#host = host;
    this.#options = options;
    host.addController(this);
  }

  /** The current composed text content of the slotted elements. */
  public get text(): string {
    return this.#text;
  }

  /** Handles the slotchange event. Bind this to the observed slot's `@slotchange`. */
  public readonly handleSlotChange = (event: Event): void => {
    const slot = event.target as HTMLSlotElement;
    this.#nodes = slot.assignedNodes({ flatten: true });
    this.#updateText();
    this.#setupObserver();
  };

  public hostDisconnected(): void {
    this.#observer?.disconnect();
  }

  #updateText(): void {
    const newText = composeSlottedTextContent(this.#nodes);
    if (newText !== this.#text) {
      this.#text = newText;
      this.#options.onChange?.(this.#text);
      this.#host.requestUpdate();
    }
  }

  #setupObserver(): void {
    this.#observer?.disconnect();
    this.#observer = new MutationObserver(() => this.#updateText());
    this.#nodes.forEach(node => {
      this.#observer?.observe(node, {
        characterData: true,
        childList: true,
        subtree: true
      });
    });
  }
}

/**
 * Readopts styles for the given element in the context of its new window.
 * @param element The element to readopt styles for.
 */
export function readoptLitElementStyles(element: LitElement): void {
  const shadowRoot = element.shadowRoot;
  const styles = (element.constructor as typeof LitElement).styles;
  const defaultView = element.ownerDocument.defaultView;

  if (!supportsAdoptingStyleSheets || !shadowRoot || !styles || !defaultView) {
    return;
  }

  if (Array.isArray(styles) && styles.length) {
    const sheets = styles.map(s => {
      const sheet = new defaultView.CSSStyleSheet();
      sheet.replaceSync(s.toString());
      return sheet;
    });
    shadowRoot.adoptedStyleSheets = sheets;
  } else {
    const sheet = new defaultView.CSSStyleSheet();
    sheet.replaceSync(styles.toString());
    shadowRoot.adoptedStyleSheets = [sheet];
  }
}

/**
 * Converts empty string values to null for reflected attributes, signaling to Lit that the attribute should be removed.
 * @param value The value to check.
 * @returns The original value if it's not an empty string, otherwise null.
 */
export function removeEmptyAttribute<T extends string>(value: T): T | null {
  return value || null;
}

/**
 * Converts a value to null if it matches the provided default value, signaling to Lit that the attribute should be removed.
 * @param value The value to check.
 * @param defaultValue The default value to compare against.
 * @returns The original value if it doesn't match the default value, otherwise null.
 */
export function removeDefaultAttribute<T extends string>(value: T, defaultValue: T): T | null {
  return !value || value === defaultValue ? null : value;
}

/**
 * Creates a reference object that can be used to track the hidden state of an element when using the `hideWhenEmpty` directive.
 * @returns A reference object with a `hidden` property that indicates whether the element is hidden.
 */
export const createHideRef = (): HideRef => new HideRef();

class HideRef {
  public readonly hidden: boolean;
}

interface HideRefInternal {
  hidden: boolean;
}

class HideWhenEmptyDirective extends AsyncDirective {
  #ref?: HideRef;
  #isInitialized = false;
  #element?: HTMLElement;
  #part?: ElementPart;
  // A hidden assigned element shows nothing, so hiding or showing one can change whether the element is empty
  #hiddenObserver = new MutationObserver(() => this.#refresh());

  public update(part: ElementPart, [ref]: Parameters<this['render']>): void {
    const refChanged = ref !== this.#ref;
    if (refChanged) {
      this.#ref = ref;
    }

    if (this.#isInitialized) {
      return;
    }
    const element = part.element as HTMLElement;
    this.#element = element;
    this.#part = part;
    element.addEventListener('slotchange', () => this.#refresh());

    this.#toggleHidden(element);
    this.#observeAssignedElements(element);
    queueMicrotask(() => this.#requestUpdate(part));
    this.#isInitialized = true;
  }

  public render(_ref?: HideRef): typeof noChange {
    return noChange;
  }

  public override disconnected(): void {
    this.#hiddenObserver.disconnect();
  }

  public override reconnected(): void {
    if (this.#element) {
      this.#observeAssignedElements(this.#element);
    }
  }

  #refresh(): void {
    if (!this.#element || !this.#part) {
      return;
    }
    this.#toggleHidden(this.#element);
    this.#observeAssignedElements(this.#element);
    this.#requestUpdate(this.#part);
  }

  #observeAssignedElements(element: HTMLElement): void {
    this.#hiddenObserver.disconnect();
    element.querySelectorAll('slot').forEach(slot => {
      slot.assignedElements().forEach(assigned => this.#hiddenObserver.observe(assigned, { attributes: true, attributeFilter: ['hidden'] }));
    });
  }

  // An assigned element that is hidden shows nothing, so it doesn't count as content
  #hasAssignedNodes(element: HTMLElement): boolean {
    const slots = element.querySelectorAll('slot');
    return Array.from(slots).some(slot => slot.assignedNodes().some(node => !(node instanceof HTMLElement && node.hidden)));
  }

  #toggleHidden(element: HTMLElement): void {
    const hasAssignedNodes = this.#hasAssignedNodes(element);
    if (!hasAssignedNodes) {
      element.style.display = 'none';
    } else {
      element.style.removeProperty('display');
    }

    if (this.#ref) {
      (this.#ref as HideRefInternal).hidden = !hasAssignedNodes;
    }
  }

  #requestUpdate(part: ElementPart): void {
    try {
      (part.options?.host as unknown as LitElement).requestUpdate();
    } catch {
      console.warn('Unable to request update on host element. Ensure that the directive is being used within a LitElement context.');
    }
  }
}

/**
 * Sets the display of an element to 'none' when it has no assigned nodes in its slots, or only assigned elements that are hidden, and restores the display when visible content is assigned. A reference object may be used to track the hidden state.
 * @example
 * ```ts
 * const hideRef = createHideRef();
 * // In the template:
 * html`<div ${hideWhenEmpty(hideRef)}><slot></slot></div>`
 *
 * // The hideRef.hidden property will be true when there are no assigned nodes, and false when there are assigned nodes.
 * ```
 */
export const hideWhenEmpty = directive(HideWhenEmptyDirective);
