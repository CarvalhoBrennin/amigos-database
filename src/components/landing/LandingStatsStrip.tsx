import { useTranslation } from "react-i18next";

import { motion } from "framer-motion";

import { games } from "@/data/games";

import { browserGames } from "@/data/browserGames";

import { SUPPORTED_LANGUAGES } from "@/i18n";

import { LandingSection } from "@/components/landing/LandingLayout";

import { landingSectionReveal } from "@/components/landing/landingAnimations";

export function LandingStatsStrip() {
  const { t } = useTranslation();

  const stats = [
    {
      id: "games",
      value: String(games.length),
      label: t("landing.statGames"),
      tone: "text-amber-400",
    },

    {
      id: "browser",
      value: String(browserGames.length),
      label: t("landing.statBrowser"),
      tone: "text-cyan-400",
    },

    {
      id: "languages",

      value: String(SUPPORTED_LANGUAGES.length),

      label: t("landing.statLanguages"),

      tone: "text-emerald-400",
    },
  ];

  return (
    <LandingSection className="landing-content-section pb-16">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-40px" }}
        variants={landingSectionReveal}
        className="landing-scoreboard grid grid-cols-1 gap-0 sm:grid-cols-3"
      >
        {stats.map((stat, index) => (
          <div
            key={stat.id}
            className={`px-4 py-5 text-center ${index > 0 ? "sm:border-l sm:border-amber-500/20" : ""}`}
          >
            <div className={`font-mono text-4xl font-bold ${stat.tone}`}>
              {stat.value}
            </div>

            <div className="mt-1 text-xs uppercase tracking-wider text-stone-400">
              {stat.label}
            </div>
          </div>
        ))}
      </motion.div>
    </LandingSection>
  );
}
