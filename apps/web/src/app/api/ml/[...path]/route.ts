import { NextRequest, NextResponse } from "next/server";

const ML_SERVICE_URL = (process.env.ML_SERVICE_URL || process.env.NEXT_PUBLIC_ML_SERVICE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ path: string[] }> }
) {
  const { path } = await props.params;
  const targetPath = path ? path.join("/") : "";
  const query = request.nextUrl.search;
  const targetUrl = `${ML_SERVICE_URL}/${targetPath}${query}`;

  try {
    const res = await fetch(targetUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "ML_SERVICE_UNAVAILABLE",
        message: `Could not reach TruTicket ML Service at ${ML_SERVICE_URL}: ${error.message}`,
        status: "offline",
      },
      { status: 503 }
    );
  }
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ path: string[] }> }
) {
  const { path } = await props.params;
  const targetPath = path ? path.join("/") : "";
  const query = request.nextUrl.search;
  const targetUrl = `${ML_SERVICE_URL}/${targetPath}${query}`;

  try {
    const body = await request.json().catch(() => ({}));
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "ML_SERVICE_UNAVAILABLE",
        message: `Could not reach TruTicket ML Service at ${ML_SERVICE_URL}: ${error.message}`,
      },
      { status: 503 }
    );
  }
}
