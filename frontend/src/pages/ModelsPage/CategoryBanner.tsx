import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { type Folder } from "../../api/folders";

type Props = {
  folder: Folder;
};

/** The rounded title+description banner shown above the grid when the selected category has
 *  admin-set meta text (Folder.metaTitle/metaDescription, edited via CategoryMetaDialog) --
 *  mirrors MakerWorld's category banner, a light rounded box with the category's display title
 *  and blurb sitting above its model grid. Models page only: a plain Collection has no
 *  analogous meta text today. Renders nothing without a title -- the description alone isn't
 *  worth a banner. */
export default function CategoryBanner({ folder }: Props) {
  if (!folder.meta_title) return null;
  return (
    <Box
      sx={{
        borderRadius: 2,
        px: 2.5,
        py: 2,
        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
      }}
    >
      <Typography variant="h6">{folder.meta_title}</Typography>
      {folder.meta_description && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {folder.meta_description}
        </Typography>
      )}
    </Box>
  );
}
