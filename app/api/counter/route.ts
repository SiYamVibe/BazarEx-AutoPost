import { NextResponse } from "next/server";
import { getCounter, setCounter } from "@/lib/counter";

export async function GET() {
  try {
    const exchangeNo = await getCounter();
    return NextResponse.json({ exchangeNo });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to read counter" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const val = Number(body.exchangeNo);
    if (isNaN(val) || val < 0) {
      return NextResponse.json({ error: "Invalid exchange number" }, { status: 400 });
    }
    const updated = await setCounter(val);
    return NextResponse.json({ exchangeNo: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update counter" }, { status: 500 });
  }
}
