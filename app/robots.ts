import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/login",
        "/signup",
        "/forgot-password",
        "/reset-password",
        "/auth",
        "/you",
        "/inbox",
        "/onboarding",
        "/me",
        "/admin",
        "/g/",
        "/games/new",
        "/api/",
      ],
    },
  };
}
