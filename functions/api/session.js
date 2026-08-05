import { isAuthedRequest } from "../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const admin = await isAuthedRequest(request, env);
  return new Response(JSON.stringify({ admin }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
