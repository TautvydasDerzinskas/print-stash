import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Collapse from "@mui/material/Collapse";
import CircularProgress from "@mui/material/CircularProgress";
import SettingsIcon from "@mui/icons-material/Settings";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import type { Folder } from "../../api/folders";
import CategoryManagerModal from "./CategoryManagerModal";

type Props = {
  folders: Folder[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (name: string, parentId: string | null) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

/** The Models page's own category browser: a pinned "All" row, then a strictly two-level tree --
 *  top-level categories hold only subcategories (clicking one just expands/collapses it),
 *  subcategories hold only models (clicking one selects it, filtering the grid). Creating,
 *  renaming, and deleting categories all happen in the cog-triggered CategoryManagerModal, not
 *  inline here. */
export default function CategoriesPanel({ folders, loading, selectedId, onSelect, onCreate, onRename, onDelete }: Props) {
  const { t } = useTranslation(["models", "common"]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [managerOpen, setManagerOpen] = useState(false);

  const untitledLabel = t("models:categories.untitled");

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

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <Paper
        variant="outlined"
        sx={{
          width: 260,
          flexShrink: 0,
          borderRadius: "12px",
          p: 1.5,
          alignSelf: "flex-start",
          bgcolor: "background.paper",
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 0.5, pb: 1 }}>
          <Typography variant="subtitle1" fontWeight={700}>{t("models:categories.title")}</Typography>
          <Tooltip title={t("models:categories.manageTooltip") ?? ""}>
            <IconButton size="small" onClick={() => setManagerOpen(true)} aria-label={t("models:categories.manageTooltip") ?? undefined}>
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        <List disablePadding>
          <ListItemButton
            selected={selectedId === null}
            onClick={() => onSelect(null)}
            sx={{ borderRadius: 1.5, mb: 0.25 }}
          >
            <ListItemText primary={t("models:categories.all")} primaryTypographyProps={{ variant: "body2", fontWeight: 600 }} />
          </ListItemButton>

          {loading && (
            <Stack alignItems="center" sx={{ py: 2 }}>
              <CircularProgress size={18} />
            </Stack>
          )}

          {!loading && roots.map(root => {
            const children = childrenByParent[root.id] || [];
            const isOpen = expanded.has(root.id);
            return (
              <Stack key={root.id}>
                <ListItemButton onClick={() => toggleExpand(root.id)} sx={{ borderRadius: 1.5, mb: 0.25 }}>
                  <IconButton
                    size="small"
                    component="span"
                    onClick={e => { e.stopPropagation(); toggleExpand(root.id); }}
                    sx={{ mr: 0.5, p: 0.25 }}
                  >
                    <ChevronRightIcon
                      fontSize="small"
                      sx={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
                    />
                  </IconButton>
                  <ListItemText
                    primary={root.name || untitledLabel}
                    primaryTypographyProps={{ noWrap: true, variant: "body2", fontWeight: 600 }}
                  />
                </ListItemButton>
                <Collapse in={isOpen} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding>
                    {children.map(child => (
                      <ListItemButton
                        key={child.id}
                        selected={selectedId === child.id}
                        onClick={() => onSelect(child.id)}
                        sx={{ pl: 4, borderRadius: 1.5, mb: 0.25 }}
                      >
                        <ListItemText
                          primary={child.name || untitledLabel}
                          primaryTypographyProps={{ noWrap: true, variant: "body2" }}
                        />
                      </ListItemButton>
                    ))}
                    {!children.length && (
                      <Typography variant="caption" color="text.secondary" sx={{ pl: 4, display: "block", py: 0.5 }}>
                        {t("models:categories.noSubcategories")}
                      </Typography>
                    )}
                  </List>
                </Collapse>
              </Stack>
            );
          })}

          {!loading && !roots.length && (
            <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 1 }}>
              {t("models:categories.empty")}
            </Typography>
          )}
        </List>
      </Paper>

      {managerOpen && (
        <CategoryManagerModal
          folders={folders}
          onClose={() => setManagerOpen(false)}
          onCreate={onCreate}
          onRename={onRename}
          onDelete={onDelete}
        />
      )}
    </>
  );
}
