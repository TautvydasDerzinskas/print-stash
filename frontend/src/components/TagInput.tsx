import React from "react";
import Box from "@mui/material/Box";
import InputBase from "@mui/material/InputBase";
import TagBadge from "./TagBadge";

type TagInputProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
};

function normalized(t: string) {
  return t.trim().replace(/\s+/g, " ");
}

export default function TagInput({ value, onChange, placeholder }: TagInputProps) {
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const addTag = (raw: string) => {
    const tag = normalized(raw);
    if (!tag) return;
    if (value.some(v => v.toLowerCase() === tag.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, tag]);
    setDraft("");
  };

  const removeTag = (idx: number) => {
    const next = [...value.slice(0, idx), ...value.slice(idx + 1)];
    onChange(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length) {
      e.preventDefault();
      removeTag(value.length - 1);
    }
  };

  const handleBlur = () => {
    if (draft.trim()) addTag(draft);
  };

  return (
    <Box
      onClick={() => inputRef.current?.focus()}
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 1,
        px: 1.5,
        py: 1,
        borderRadius: 1,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        fontSize: 14,
        cursor: "text",
      }}
    >
      {value.map((tag, idx) => (
        <TagBadge key={tag} tag={tag} onRemove={() => removeTag(idx)} />
      ))}
      <InputBase
        inputRef={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={value.length === 0 ? placeholder : ""}
        sx={{ flex: 1, minWidth: 120, fontSize: 14 }}
      />
    </Box>
  );
}
