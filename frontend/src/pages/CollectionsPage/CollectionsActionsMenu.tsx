import { useState } from "react";
import { useTranslation } from "react-i18next";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import AddIcon from "@mui/icons-material/Add";

type Props = {
  onAddCollection: () => void;
};

/** The Collections page's header "..." menu -- just "Add a collection" today, but a menu (not a
 *  bare button) matches how every other route's header action is presented (ModelActionsMenu,
 *  CollectionActionsMenu). */
export default function CollectionsActionsMenu({ onAddCollection }: Props) {
  const { t } = useTranslation(["models", "common"]);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const closeMenu = () => setAnchorEl(null);

  return (
    <>
      <IconButton size="small" onClick={e => setAnchorEl(e.currentTarget)} aria-label={t("common:more") ?? undefined}>
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={closeMenu}>
        <MenuItem onClick={() => { closeMenu(); onAddCollection(); }}>
          <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t("models:collections.newCollection")}</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
