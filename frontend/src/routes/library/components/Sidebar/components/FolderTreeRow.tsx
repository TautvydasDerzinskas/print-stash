import React from "react";
import Box from "@mui/material/Box";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import Collapse from "@mui/material/Collapse";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import type { Folder } from "../../../../../services/api";

/** Shared, tree-wide config a row needs to render itself and recurse into its children --
 *  passed down explicitly rather than read from closures, so each row stays a plain
 *  function of its props. */
export type FolderTreeContext = {
  childrenMap: Record<string, Folder[]>;
  visibleFolderIds: Set<string> | null;
  expanded: Set<string>;
  dropTargetId: string | null;
  selectedId: string | null | undefined;
  query: string;
  untitledLabel: string;
  collapseLabel: string;
  expandLabel: string;
  actionsForLabel: (name: string) => string;
  folderPath: (folder: Folder) => string;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onDragOverTarget: (id: string) => (e: React.DragEvent<HTMLElement>) => void;
  onDropFiles: (id: string) => (e: React.DragEvent<HTMLElement>) => void;
  onOpenMenu: (folderId: string, anchorEl: HTMLElement) => void;
};

type Props = {
  folder: Folder;
  depth: number;
  ctx: FolderTreeContext;
};

/** One row of the recursive folder tree, plus (via a nested Collapse + List) its own
 *  children rendered as more FolderTreeRow instances. */
export default function FolderTreeRow({ folder, depth, ctx }: Props) {
  const { visibleFolderIds, childrenMap, expanded, dropTargetId, selectedId, query, untitledLabel } = ctx;
  if (visibleFolderIds && !visibleFolderIds.has(folder.id)) return null;
  const children = (childrenMap[folder.id] || []).filter(
    child => !visibleFolderIds || visibleFolderIds.has(child.id)
  );
  const isSelected = selectedId === folder.id;
  const isOpen = !!query.trim() || expanded.has(folder.id);
  const isDropTarget = dropTargetId === folder.id;

  return (
    <React.Fragment>
      <ListItemButton
        selected={isSelected}
        onClick={() => ctx.onSelect(folder.id)}
        onDragOver={ctx.onDragOverTarget(folder.id)}
        onDrop={ctx.onDropFiles(folder.id)}
        title={ctx.folderPath(folder)}
        aria-current={isSelected ? "page" : undefined}
        sx={{
          pl: 1 + depth * 2,
          borderRadius: 1,
          mb: 0.25,
          ...(isDropTarget && {
            outline: "2px dashed",
            outlineColor: "primary.main",
            outlineOffset: -2,
          }),
        }}
      >
        {children.length ? (
          <IconButton
            size="small"
            component="span"
            onClick={e => { e.stopPropagation(); ctx.onToggleExpand(folder.id); }}
            aria-label={isOpen ? ctx.collapseLabel : ctx.expandLabel}
            aria-expanded={isOpen}
            sx={{ mr: 0.5, p: 0.25 }}
          >
            <ChevronRightIcon
              fontSize="small"
              sx={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
            />
          </IconButton>
        ) : (
          <Box sx={{ width: 28, flexShrink: 0 }} aria-hidden="true" />
        )}
        <ListItemIcon sx={{ minWidth: 30 }}>
          {isOpen && children.length ? (
            <FolderOpenIcon fontSize="small" />
          ) : (
            <FolderIcon fontSize="small" />
          )}
        </ListItemIcon>
        <ListItemText
          primary={folder.name || untitledLabel}
          primaryTypographyProps={{ noWrap: true, variant: "body2" }}
        />
        <IconButton
          size="small"
          component="span"
          onClick={e => { e.stopPropagation(); ctx.onOpenMenu(folder.id, e.currentTarget); }}
          aria-label={ctx.actionsForLabel(folder.name || untitledLabel)}
        >
          <MoreHorizIcon fontSize="small" />
        </IconButton>
      </ListItemButton>
      {children.length > 0 && (
        <Collapse in={isOpen} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {children.map(child => (
              <FolderTreeRow key={child.id} folder={child} depth={depth + 1} ctx={ctx} />
            ))}
          </List>
        </Collapse>
      )}
    </React.Fragment>
  );
}
