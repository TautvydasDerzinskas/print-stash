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
import Tooltip from "@mui/material/Tooltip";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckIcon from "@mui/icons-material/Check";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import type { Category, CategoryMetaInput } from "../../api/categories";
import { useConfirm } from "../../components/ConfirmProvider";
import CategoryMetaDialog from "./CategoryMetaDialog";

type Props = {
  categories: Category[];
  onClose: () => void;
  onCreate: (name: string, parentId: string | null) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReorder: (categoryIds: string[]) => Promise<void>;
  onUpdateMeta: (id: string, meta: CategoryMetaInput) => Promise<void>;
};

function hasMeta(category: Category): boolean {
  return Boolean(
    category.meta_title ||
      category.meta_description ||
      category.makerworld_cat_ids ||
      category.thingiverse_cat_ids ||
      category.printables_cat_ids,
  );
}

/** One editable row shared by both category levels: plain text + move-up/move-down/details/edit/
 *  delete icons, or (while editing) a text field + save/cancel. */
function CategoryRow({
  name,
  indent,
  bold,
  busy,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  metaTitle,
  metaDescription,
  hasDetails,
  onOpenMeta,
  onRename,
  onDelete,
}: {
  name: string;
  indent: number;
  bold?: boolean;
  busy: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  metaTitle: string | null;
  metaDescription: string | null;
  hasDetails: boolean;
  onOpenMeta: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => void;
}) {
  const { t } = useTranslation(["models", "common"]);
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
          <IconButton size="small" onClick={onMoveUp} disabled={busy || !canMoveUp} aria-label={t("common:moveUp") ?? undefined}>
            <ArrowUpwardIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={onMoveDown} disabled={busy || !canMoveDown} aria-label={t("common:moveDown") ?? undefined}>
            <ArrowDownwardIcon fontSize="small" />
          </IconButton>
          <Tooltip
            title={
              hasDetails ? (
                <Stack spacing={0.25} sx={{ py: 0.25 }}>
                  {metaTitle && <Typography variant="caption" fontWeight={700} sx={{ display: "block" }}>{metaTitle}</Typography>}
                  {metaDescription && <Typography variant="caption" sx={{ display: "block" }}>{metaDescription}</Typography>}
                </Stack>
              ) : (
                t("models:categories.manager.addDetailsTooltip") ?? ""
              )
            }
          >
            <span>
              <IconButton
                size="small"
                onClick={onOpenMeta}
                disabled={busy}
                aria-label={
                  (hasDetails
                    ? t("models:categories.manager.editDetailsTooltip")
                    : t("models:categories.manager.addDetailsTooltip")) ?? undefined
                }
              >
                <InfoOutlinedIcon
                  fontSize="small"
                  sx={{
                    opacity: hasDetails ? 1 : 0.35,
                    color: hasDetails ? "primary.main" : "action.active",
                  }}
                />
              </IconButton>
            </span>
          </Tooltip>
          <IconButton size="small" onClick={startEdit} disabled={busy} aria-label={t("common:rename") ?? undefined}>
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={onDelete} disabled={busy} aria-label={t("common:delete") ?? undefined}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Stack>
      }
    >
      <Typography variant="body2" fontWeight={bold ? 600 : 400} noWrap sx={{ pr: 19 }}>
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

export default function CategoryManagerModal({ categories, onClose, onCreate, onRename, onDelete, onReorder, onUpdateMeta }: Props) {
  const { t } = useTranslation(["models", "common"]);
  const confirmDialog = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [metaCategory, setMetaCategory] = useState<Category | null>(null);

  const { roots, childrenByParent } = useMemo(() => {
    const childrenMap: Record<string, Category[]> = {};
    const rootList: Category[] = [];
    categories.forEach(f => {
      if (f.parent_id) {
        if (!childrenMap[f.parent_id]) childrenMap[f.parent_id] = [];
        childrenMap[f.parent_id].push(f);
      } else {
        rootList.push(f);
      }
    });
    const byPosition = (a: Category, b: Category) => a.position - b.position || a.name.localeCompare(b.name);
    Object.keys(childrenMap).forEach(key => {
      childrenMap[key] = childrenMap[key].toSorted(byPosition);
    });
    return {
      roots: rootList.toSorted(byPosition),
      childrenByParent: childrenMap,
    };
  }, [categories]);

  const untitledLabel = t("models:categories.untitled");

  const handleDeleteCategory = async (category: Category) => {
    const hasChildren = (childrenByParent[category.id] || []).length > 0;
    const message = hasChildren
      ? t("models:categories.manager.confirmDeleteCategoryWithSub", { name: category.name || untitledLabel })
      : t("models:categories.manager.confirmDeleteCategory", { name: category.name || untitledLabel });
    if (!(await confirmDialog({ message, destructive: true }))) return;
    setBusyId(category.id);
    try {
      await onDelete(category.id);
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteSubcategory = async (category: Category) => {
    const message = t("models:categories.manager.confirmDeleteSubcategory", { name: category.name || untitledLabel });
    if (!(await confirmDialog({ message, destructive: true }))) return;
    setBusyId(category.id);
    try {
      await onDelete(category.id);
    } finally {
      setBusyId(null);
    }
  };

  const swapAndReorder = async (siblingIds: string[], index: number, direction: -1 | 1, busyKey: string) => {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= siblingIds.length) return;
    const reordered = siblingIds.slice();
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
    setBusyId(busyKey);
    try {
      await onReorder(reordered);
    } finally {
      setBusyId(null);
    }
  };

  const moveRoot = (index: number, direction: -1 | 1) =>
    swapAndReorder(roots.map(r => r.id), index, direction, roots[index].id);

  const moveChild = (parentId: string, index: number, direction: -1 | 1) => {
    const children = childrenByParent[parentId] || [];
    return swapAndReorder(children.map(c => c.id), index, direction, children[index].id);
  };

  return (
    <>
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {t("models:categories.manager.title")}
        <IconButton size="small" onClick={onClose} aria-label={t("common:close") ?? undefined}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <List disablePadding>
          {roots.map((root, rootIndex) => {
            const children = childrenByParent[root.id] || [];
            return (
              <Box key={root.id} sx={{ mb: 1.5 }}>
                <CategoryRow
                  name={root.name || untitledLabel}
                  indent={0}
                  bold
                  busy={busyId === root.id}
                  canMoveUp={rootIndex > 0}
                  canMoveDown={rootIndex < roots.length - 1}
                  onMoveUp={() => moveRoot(rootIndex, -1)}
                  onMoveDown={() => moveRoot(rootIndex, 1)}
                  metaTitle={root.meta_title}
                  metaDescription={root.meta_description}
                  hasDetails={hasMeta(root)}
                  onOpenMeta={() => setMetaCategory(root)}
                  onRename={name => onRename(root.id, name)}
                  onDelete={() => handleDeleteCategory(root)}
                />
                <List disablePadding>
                  {children.map((child, childIndex) => (
                    <CategoryRow
                      key={child.id}
                      name={child.name || untitledLabel}
                      indent={3}
                      busy={busyId === child.id}
                      canMoveUp={childIndex > 0}
                      canMoveDown={childIndex < children.length - 1}
                      onMoveUp={() => moveChild(root.id, childIndex, -1)}
                      onMoveDown={() => moveChild(root.id, childIndex, 1)}
                      metaTitle={child.meta_title}
                      metaDescription={child.meta_description}
                      hasDetails={hasMeta(child)}
                      onOpenMeta={() => setMetaCategory(child)}
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
    {metaCategory && (
      <CategoryMetaDialog
        category={metaCategory}
        onClose={() => setMetaCategory(null)}
        onSave={meta => onUpdateMeta(metaCategory.id, meta)}
      />
    )}
    </>
  );
}
