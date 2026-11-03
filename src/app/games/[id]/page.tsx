"use client";

import { useParams } from "next/navigation";
import { GameDetail } from "@/components/GameDetail";

export default function GamePage() {
  const params = useParams<{ id: string }>();
  return <GameDetail id={params.id} />;
}
