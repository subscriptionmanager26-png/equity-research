import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";
import {
  exchangeSlackOAuthCode,
  verifySlackOAuthState,
} from "@/lib/slack-oauth";

function redirect(path: string) {
  const { publicUrl } = getConfig();
  const base = publicUrl || "";
  return NextResponse.redirect(`${base}${path}`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return redirect(`/?slack=error&message=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return redirect("/?slack=error&message=missing_code");
  }
  if (!(await verifySlackOAuthState(state))) {
    return redirect("/?slack=error&message=invalid_state");
  }

  try {
    const result = await exchangeSlackOAuthCode(code);
    const team = encodeURIComponent(result.teamName ?? result.teamId);
    return redirect(`/?slack=installed&team=${team}`);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "oauth_exchange_failed";
    return redirect(`/?slack=error&message=${encodeURIComponent(message)}`);
  }
}
