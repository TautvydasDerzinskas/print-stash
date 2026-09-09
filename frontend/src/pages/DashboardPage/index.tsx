import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import CollectionsIcon from "@mui/icons-material/Collections";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import PersonIcon from "@mui/icons-material/Person";
import FolderIcon from "@mui/icons-material/Folder";
import VisibilityIcon from "@mui/icons-material/Visibility";
import PrintIcon from "@mui/icons-material/Print";
import { UnauthorizedError } from "../../api/client";
import { dashboardApi, type DashboardSummary } from "../../api/dashboard";
import CountCard from "./CountCard";
import ModelListCard from "./ModelListCard";
import AuthorListCard from "./AuthorListCard";
import ProviderListCard from "./ProviderListCard";
import RecentlyAddedCard from "./RecentlyAddedCard";

type Props = {
  onUnauthorized?: () => void;
};

export default function DashboardPage({ onUnauthorized }: Props) {
  const { t } = useTranslation("app");
  const navigate = useNavigate();
  const [summary, setSummary] = React.useState<DashboardSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await dashboardApi.getSummary();
        if (active) setSummary(data);
      } catch (err) {
        if (!active) return;
        if (err instanceof UnauthorizedError) onUnauthorized?.();
        else setError(t("dashboard.loadError"));
      }
    })();
    return () => { active = false; };
  }, [onUnauthorized, t]);

  if (error) {
    return <Alert severity="error" sx={{ m: 3 }}>{error}</Alert>;
  }

  if (!summary) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ py: 10 }}>
        <CircularProgress />
      </Stack>
    );
  }

  return (
    <Box sx={{ p: { xs: 0, md: 1 } }}>
      <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 2, alignItems: "flex-start" }}>
        {/* Column 1: stat counts */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, width: { xs: "100%", md: 0 }, flex: { md: 1 } }}>
          <CountCard
            icon={<CollectionsIcon sx={{ fontSize: 32 }} />}
            count={summary.collection_count}
            label={t("dashboard.collectionCount.label")}
            onClick={() => navigate("/models/collections")}
          />
          <CountCard
            icon={<ViewInArIcon sx={{ fontSize: 32 }} />}
            count={summary.model_count}
            label={t("dashboard.modelCount.label")}
            onClick={() => navigate("/models")}
          />
          <CountCard
            icon={<PersonIcon sx={{ fontSize: 32 }} />}
            count={summary.author_count}
            label={t("dashboard.authorCount.label")}
          />
          <CountCard
            icon={<FolderIcon sx={{ fontSize: 32 }} />}
            count={summary.category_count}
            label={t("dashboard.categoryCount.label")}
            onClick={() => navigate("/models")}
          />
        </Box>

        {/* Column 2: top viewed / top printed */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, width: { xs: "100%", md: 0 }, flex: { md: 1.4 } }}>
          <ModelListCard
            icon={<VisibilityIcon />}
            title={t("dashboard.topViewed.title")}
            models={summary.top_viewed}
            valueOf={(m) => m.view_count}
            valueLabel={(count) => t("dashboard.viewCount", { count })}
            emptyText={t("dashboard.topViewed.empty")}
            seeMoreLabel={t("dashboard.seeMore")}
            fetchMore={dashboardApi.getTopViewed}
          />
          <ModelListCard
            icon={<PrintIcon />}
            title={t("dashboard.topPrinted.title")}
            models={summary.top_printed}
            valueOf={(m) => m.print_count}
            valueLabel={(count) => t("dashboard.printCount", { count })}
            emptyText={t("dashboard.topPrinted.empty")}
            seeMoreLabel={t("dashboard.seeMore")}
            fetchMore={dashboardApi.getTopPrinted}
          />
          <RecentlyAddedCard models={summary.recently_added} />
        </Box>

        {/* Column 3: top authors / top providers */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, width: { xs: "100%", md: 0 }, flex: { md: 1.4 } }}>
          <AuthorListCard authors={summary.top_authors} />
          <ProviderListCard providers={summary.top_providers} />
        </Box>
      </Box>
    </Box>
  );
}
