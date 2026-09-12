import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { type Category } from "../../api/categories";
import { translateCategoryDisplay } from "../../utils/translateCategoryDisplay";

type Props = {
  category: Category;
};

/** The rounded title+description banner shown above the grid when the selected category has
 *  admin-set meta text (Category.metaTitle/metaDescription, edited via CategoryMetaDialog) --
 *  mirrors MakerWorld's category banner, a light rounded box with the category's display title
 *  and blurb sitting above its model grid. Models page only: a plain Collection has no
 *  analogous meta text today. Renders nothing without a title -- the description alone isn't
 *  worth a banner. Shows the built-in starter category tree's translated text when the current
 *  language has one and the admin hasn't overwritten it -- see translateCategoryDisplay. */
export default function CategoryBanner({ category }: Props) {
  const { i18n } = useTranslation();
  const display = translateCategoryDisplay(category, i18n);
  if (!display.metaTitle) return null;
  return (
    <Box
      sx={{
        borderRadius: 2,
        px: 2.5,
        py: 2,
        background: (theme) =>
          theme.palette.mode === "dark"
            ? "linear-gradient(45deg, #5061ff 0%, #31ceff 100%)"
            : alpha(theme.palette.primary.main, 0.08),
      }}
    >
      <Typography variant="h6" sx={{ color: (theme) => (theme.palette.mode === "dark" ? "#fff" : undefined) }}>
        {display.metaTitle}
      </Typography>
      {display.metaDescription && (
        <Typography
          variant="body2"
          sx={{ mt: 0.5, color: (theme) => (theme.palette.mode === "dark" ? "#fff" : "text.secondary") }}
        >
          {display.metaDescription}
        </Typography>
      )}
    </Box>
  );
}
