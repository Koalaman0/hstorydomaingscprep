import { onRequestPost as loginPost } from "./api/login.js";
import { onRequestPost as logoutPost } from "./api/logout.js";
import { onRequestGet as sessionGet } from "./api/session.js";
import { onRequestPost as contentPost } from "./api/content.js";
import { onRequestPost as uploadPost } from "./api/upload.js";

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const c = { request, env, waitUntil: ctx.waitUntil.bind(ctx) };

        if (url.pathname === "/api/login" && request.method === "POST") return loginPost(c);
        if (url.pathname === "/api/logout" && request.method === "POST") return logoutPost(c);
        if (url.pathname === "/api/session" && request.method === "GET") return sessionGet(c);
        if (url.pathname === "/api/content" && request.method === "POST") return contentPost(c);
        if (url.pathname === "/api/upload" && request.method === "POST") return uploadPost(c);

        return env.ASSETS.fetch(request);
    },
};