import { NextResponse } from "next/server";

import { jsonError, requireAppUser } from "@/server/auth";
import { listNotificationsForUser } from "@/server/notifications";

export async function GET(request: Request) {
  try {
    const user = await requireAppUser(request);

    return NextResponse.json({
      notifications: await listNotificationsForUser(user.id),
    });
  } catch (error) {
    return jsonError(error, 401);
  }
}
