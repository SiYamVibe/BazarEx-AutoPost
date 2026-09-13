import { NextResponse } from "next/server";
import { classifyTwoScreenshots } from "@/lib/receipt-classifier";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file0 = formData.get("file0") as File | null;
    const file1 = formData.get("file1") as File | null;

    if (!file0 || !file1) {
      return NextResponse.json(
        { error: "Two screenshot files are required for autonomous classification." },
        { status: 400 }
      );
    }

    const buf0 = Buffer.from(await file0.arrayBuffer());
    const buf1 = Buffer.from(await file1.arrayBuffer());

    const result = await classifyTwoScreenshots(buf0, buf1);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error("Classification error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to classify screenshots" },
      { status: 500 }
    );
  }
}
