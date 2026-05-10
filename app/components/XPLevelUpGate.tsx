"use client";

import { useXP } from "@/app/context/XPContext";
import LevelUpModal from "./LevelUpModal";

export default function XPLevelUpGate() {
  const { levelUp, dismissLevelUp } = useXP();
  if (!levelUp) return null;
  return (
    <LevelUpModal
      newLevel={levelUp.newLevel}
      prevLevel={levelUp.prevLevel}
      onDismiss={dismissLevelUp}
    />
  );
}
