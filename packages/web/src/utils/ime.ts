export interface EnterSubmitEventLike {
  key: string;
  shiftKey: boolean;
  keyCode?: number;
  which?: number;
  nativeEvent?: {
    isComposing?: boolean;
  } | null;
}

export function isImeComposing(event: EnterSubmitEventLike, composing = false): boolean {
  return composing || event.nativeEvent?.isComposing === true || event.keyCode === 229 || event.which === 229;
}

export function shouldSubmitOnEnter(event: EnterSubmitEventLike, composing = false): boolean {
  return event.key === "Enter" && !event.shiftKey && !isImeComposing(event, composing);
}
