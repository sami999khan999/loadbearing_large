import { useMessages } from "../i18n/index.js";

export interface TypingNoticeProps {
  // From `useConversationStream`, which owns the expiry: this renders and nothing else.
  readonly typing: readonly string[];
  readonly nameFor?: (userId: string) => string;
}

export function TypingNotice({ typing, nameFor }: TypingNoticeProps) {
  const { t } = useMessages("messaging");

  if (typing.length === 0) return null;
  if (typing.length === 1) {
    const first = typing[0] ?? "";
    return <p>{t("messaging.typing.one", { name: nameFor?.(first) ?? first })}</p>;
  }

  return <p>{t("messaging.typing.many")}</p>;
}
