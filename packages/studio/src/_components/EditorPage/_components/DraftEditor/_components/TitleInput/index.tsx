import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { renameDraft } from "@/shared/draft-store";
import "./styles.css";

export type TitleInputProps = {
  draftId: string;
  initialTitle: string;
  /** The draft was renamed in the store. */
  onRenamed: () => void;
};

/**
 * The editable draft title in the topbar h1. Blur or Enter commits a
 * non-empty new title; Escape, or an empty title, restores the saved one.
 */
export function TitleInput({ draftId, initialTitle, onRenamed }: TitleInputProps) {
  const [titleInput, setTitleInput] = useState(initialTitle);
  const titleValueRef = useRef(initialTitle);
  const savedTitleRef = useRef(initialTitle);

  const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
    titleValueRef.current = event.currentTarget.value;
    setTitleInput(event.currentTarget.value);
  };

  const commitTitle = () => {
    const trimmed = titleValueRef.current.trim();
    if (!trimmed || trimmed === savedTitleRef.current) {
      titleValueRef.current = savedTitleRef.current;
      setTitleInput(savedTitleRef.current);
      return;
    }
    renameDraft(draftId, trimmed);
    savedTitleRef.current = trimmed;
    titleValueRef.current = trimmed;
    setTitleInput(trimmed);
    onRenamed();
  };

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      titleValueRef.current = savedTitleRef.current;
      setTitleInput(savedTitleRef.current);
      event.currentTarget.blur();
    }
  };

  return (
    <input
      className="title-input"
      value={titleInput}
      aria-label="Draft title"
      spellCheck={false}
      onChange={handleTitleChange}
      onBlur={commitTitle}
      onKeyDown={handleTitleKeyDown}
    />
  );
}
