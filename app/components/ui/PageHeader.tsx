"use client";

import PageHeader from "@/app/components/PageHeader";
import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  backHref?: string;
  rightSlot?: ReactNode;
  noBorder?: boolean;
};

export default function UiPageHeader({
  title,
  subtitle,
  backHref,
  rightSlot,
  noBorder = false,
}: Props) {
  return (
    <PageHeader
      title={title}
      subtitle={subtitle}
      backHref={backHref}
      right={rightSlot}
      noBorder={noBorder}
      align={backHref ? "left" : "center"}
    />
  );
}
