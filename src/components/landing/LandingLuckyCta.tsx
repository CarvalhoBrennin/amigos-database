import { useTranslation } from "react-i18next";

import { motion } from "framer-motion";

import { Coins, Dices } from "lucide-react";

import { LandingSection } from "@/components/landing/LandingLayout";

import { landingSectionReveal } from "@/components/landing/landingAnimations";

import { useAnimations } from "@/components/animation-context";

interface LandingLuckyCtaProps {
  onLuckyClick: () => void;
}

export function LandingLuckyCta({ onLuckyClick }: LandingLuckyCtaProps) {
  const { t } = useTranslation();

  const { animationsEnabled } = useAnimations();

  return (
    <LandingSection className="landing-content-section pb-14">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-40px" }}
        variants={landingSectionReveal}
        className="landing-lucky-cabinet"
      >
        <div className="landing-lucky-copy">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.3em] text-amber-300/80">
            <Coins className="h-4 w-4" aria-hidden="true" />
            {t("landing.luckyEyebrow")}
          </div>

          <h2 className="landing-display text-3xl font-bold text-white sm:text-4xl">
            {t("landing.luckyHeadline")}
          </h2>

          <p className="mt-3 max-w-xl text-stone-300">
            {t("landing.luckySub")}
          </p>
        </div>

        <motion.button
          type="button"
          onClick={onLuckyClick}
          className="landing-cta-lucky inline-flex items-center justify-center gap-3 px-8 py-4 text-lg font-bold text-stone-950"
          whileHover={animationsEnabled ? { scale: 1.04 } : undefined}
          whileTap={animationsEnabled ? { scale: 0.98 } : undefined}
        >
          <motion.span
            animate={
              animationsEnabled ? { rotate: [0, 12, -12, 0] } : undefined
            }
            transition={
              animationsEnabled
                ? { duration: 2, repeat: Infinity, repeatDelay: 2.5 }
                : undefined
            }
          >
            <Dices className="h-6 w-6" aria-hidden="true" />
          </motion.span>

          {t("landing.luckyButton")}
        </motion.button>
      </motion.div>
    </LandingSection>
  );
}
