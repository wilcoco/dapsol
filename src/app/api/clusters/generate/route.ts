import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { runFullClustering } from "@/lib/knowledge/clustering";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await runFullClustering();
  return NextResponse.json(result);
}
