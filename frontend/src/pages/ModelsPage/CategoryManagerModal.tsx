import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckIcon from "@mui/icons-material/Check";
import type { Folder } from "../../api/folders";
import { useConfirm } from "../../components/ConfirmProvider";

type Props = {
  folders: Folder[];
  onClose: () => void;
  onCreate: (name: string, parentId: string | null) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

/** One editable row shared by both category levels: plain text + edit/delete icons, or (while
 *  editing) a text field + save/cancel. */
function CategoryRow({
  name,
  indent,
  bold,
  busy,
  onRename,
  onDelete,
}: {
  name: string;
  indent: number;
  bold?: boolean;
  busy: boolean;
  onRename: (name: string) => Promise<void>;
  onDelete: () => void;
}) {
  const { t } = useTranslation(["common"]);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setValue(name);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setValue(name);
  };

  const commit = async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onRename(trimmed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <ListItem disableGutters sx={{ pl: indent, py: 0.5 }}>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ width: "100%" }}>
          <TextField
            size="small"
            fullWidth
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") cancelEdit();
            }}
            // Deliberate: focus the field the moment edit mode is entered.
            // oxlint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <IconButton size="small" onClick={commit} disabled={saving || !value.trim()}>
            {saving ? <CircularProgress size={16} /> : <CheckIcon fontSize="small" />}
          </IconButton>
          <IconButton size="small" onClick={cancelEdit} disabled={saving}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </ListItem>
    );
  }

  return (
    <ListItem
      disableGutters
      sx={{ pl: indent, py: 0.5 }}
      secondaryAction={
        <Stack direction="row" spacing={0.25}>
          <IconButton size="small" onClick={startEdit} disabled={busy} aria-label={t("common:rename") ?? undefined}>
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={onDelete} disabled={busy} aria-label={t("common:delete") ?? undefined}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Stack>
      }
    >
      <Typography variant="body2" fontWeight={bold ? 600 : 400} noWrap sx={{ pr: 8 }}>
        {name}
      </Typography>
    </ListItem>
  );
}

/** Inline "add" row: a text field that appears in place of an "+ Add ..." button, shared by both
 *  the top-level "add category" affordance and each category's "add subcategory" affordance. */
function AddRow({ indent, placeholder, busy, onAdd }: {
  indent: number;
  placeholder: string;
  busy: boolean;
  onAdd: (name: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    await onAdd(trimmed);
    setValue("");
    setAdding(false);
  };

  if (!adding) {
    return (
      <Button
        size="small"
        startIcon={<AddIcon fontSize="small" />}
        onClick={() => { setAdding(true); setTimeout(() => inputRef.current?.focus(), 0); }}
        sx={{ ml: `${indent * 8}px` }}
      >
        {placeholder}
      </Button>
    );
  }

  return (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ pl: `${indent * 8}px`, py: 0.5 }}>
      <TextField
        inputRef={inputRef}
        size="small"
        fullWidth
        placeholder={placeholder}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") { setAdding(false); setValue(""); }
        }}
      />
      <IconButton size="small" onClick={submit} disabled={busy || !value.trim()}>
        {busy ? <CircularProgress size={16} /> : <CheckIcon fontSize="small" />}
      </IconButton>
      <IconButton size="small" onClick={() => { setAdding(false); setValue(""); }} disabled={busy}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}

export default function CategoryManagerModal({ folders, onClose, onCreate, onRename, onDelete }: Props) {
  const { t } = useTranslation(["models", "common"]);
  const confirmDialog = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { roots, childrenByParent } = useMemo(() => {
    const childrenMap: Record<string, Folder[]> = {};
    const rootList: Folder[] = [];
    folders.forEach(f => {
      if (f.parent_id) {
        if (!childrenMap[f.parent_id]) childrenMap[f.parent_id] = [];
        childrenMap[f.parent_id].push(f);
      } else {
        rootList.push(f);
      }
    });
    Object.keys(childrenMap).forEach(key => {
      childrenMap[key] = childrenMap[key].toSorted((a, b) => a.name.localeCompare(b.name));
    });
    return {
      roots: rootList.toSorted((a, b) => a.name.localeCompare(b.name)),
      childrenByParent: childrenMap,
    };
  }, [folders]);

  const untitledLabel = t("models:categories.untitled");

  const handleDeleteCategory = async (folder: Folder) => {
    const hasChildren = (childrenByParent[folder.id] || []).length > 0;
    const message = hasChildren
      ? t("models:categories.manager.confirmDeleteCategoryWithSub", { name: folder.name || untitledLabel })
      : t("models:categories.manager.confirmDeleteCategory", { name: folder.name || untitledLabel });
    if (!(await confirmDialog({ message, destructive: true }))) return;
    setBusyId(folder.id);
    try {
      await onDelete(folder.id);
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteSubcategory = async (folder: Folder) => {
    const message = t("models:categories.manager.confirmDeleteSubcategory", { name: folder.name || untitledLabel });
    if (!(await confirmDialog({ message, destructive: true }))) return;
    setBusyId(folder.id);
    try {
      await onDelete(folder.id);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {t("models:categories.manager.title")}
        <IconButton size="small" onClick={onClose} aria-label={t("common:close") ?? undefined}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <List disablePadding>
          {roots.map(root => {
            const children = childrenByParent[root.id] || [];
            return (
              <Box key={root.id} sx={{ mb: 1.5 }}>
                <CategoryRow
                  name={root.name || untitledLabel}
                  indent={0}
                  bold
                  busy={busyId === root.id}
                  onRename={name => onRename(root.id, name)}
                  onDelete={() => handleDeleteCategory(root)}
                />
                <List disablePadding>
                  {children.map(child => (
                    <CategoryRow
                      key={child.id}
                      name={child.name || untitledLabel}
                      indent={3}
                      busy={busyId === child.id}
                      onRename={name => onRename(child.id, name)}
                      onDelete={() => handleDeleteSubcategory(child)}
                    />
                  ))}
                </List>
                <Box sx={{ pl: 0.5 }}>
                  <AddRow
                    indent={3}
                    placeholder={t("models:categories.manager.addSubcategory")}
                    busy={busyId === `new-sub-${root.id}`}
                    onAdd={async name => {
                      setBusyId(`new-sub-${root.id}`);
                      try {
                        await onCreate(name, root.id);
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  />
                </Box>
              </Box>
            );
          })}

          {!roots.length && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
              {t("models:categories.manager.noCategories")}
            </Typography>
          )}
        </List>

        <Divider sx={{ my: 1.5 }} />

        <AddRow
          indent={0}
          placeholder={t("models:categories.manager.addCategory")}
          busy={busyId === "new-root"}
          onAdd={async name => {
            setBusyId("new-root");
            try {
              await onCreate(name, null);
            } finally {
              setBusyId(null);
            }
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common:close")}</Button>
      </DialogActions>
    </Dialog>
  );
}
