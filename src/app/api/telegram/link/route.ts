import { jsonError, requireAppUser } from "@/server/auth";
import { rateLimit, rateLimitProfiles, secureJson } from "@/server/security";
import {
  createTelegramLinkForUser,
  unlinkTelegramForUser,
} from "@/server/telegram";

export async function POST(request: Request) {
  try {
    await rateLimit(request, { key: "telegram:link", ...rateLimitProfiles.write });
    const user = await requireAppUser(request);
    const payload = await createTelegramLinkForUser(user);

    return secureJson(payload);
  } catch (error) {
    return jsonError(error, 401);
  }
}

export async function DELETE(request: Request) {
  try {
    await rateLimit(request, { key: "telegram:unlink", ...rateLimitProfiles.write });
    const user = await requireAppUser(request);
    const telegram = await unlinkTelegramForUser(user.id);

    return secureJson({ telegram });
  } catch (error) {
    return jsonError(error, 401);
  }
}
