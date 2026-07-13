// ============================================================
// Proxy lokal → Superset (metode cookie)
// Berjalan di server Next.js pengguna sendiri (localhost) sehingga:
//   - fetch server-side TIDAK terkena CORS,
//   - Cookie sesi hanya mengalir browser → localhost → Superset internal,
//   - tanpa layanan pihak ketiga, 100% gratis.
// Keamanan: hanya path /api/v1/* pada baseUrl yang dikonfigurasi yang
// diteruskan; tidak ada penyimpanan cookie di server (stateless).
// ============================================================

export const runtime = "nodejs";

interface ProxyPayload {
  baseUrl?: string;
  path?: string;
  method?: string;
  cookie?: string;
  csrf?: string;
  body?: unknown;
}

export async function POST(req: Request): Promise<Response> {
  let p: ProxyPayload;
  try {
    p = (await req.json()) as ProxyPayload;
  } catch {
    return Response.json({ error: "Payload bukan JSON" }, { status: 400 });
  }

  const baseUrl = (p.baseUrl || "").replace(/\/+$/, "");
  const path = p.path || "";
  if (!/^https?:\/\//.test(baseUrl))
    return Response.json({ error: "baseUrl harus http(s)" }, { status: 400 });
  if (!path.startsWith("/api/v1/"))
    return Response.json({ error: "Hanya path /api/v1/* yang diizinkan" }, { status: 400 });
  if (!p.cookie)
    return Response.json({ error: "Cookie sesi belum diisi" }, { status: 400 });

  const method = (p.method || "GET").toUpperCase();
  const headers: Record<string, string> = {
    Cookie: p.cookie,
    Accept: "application/json",
    Referer: baseUrl + "/",
    "X-Requested-With": "XMLHttpRequest",
  };
  if (p.csrf) headers["X-CSRFToken"] = p.csrf;
  if (p.body !== undefined) headers["Content-Type"] = "application/json";

  try {
    const res = await fetch(baseUrl + path, {
      method,
      headers,
      redirect: "manual", // 302 → login = sesi kedaluwarsa; jangan diikuti
      body: p.body !== undefined ? JSON.stringify(p.body) : undefined,
      cache: "no-store",
    });
    const body = await res.text();
    return Response.json({
      status: res.status,
      ok: res.ok,
      redirected: res.status >= 300 && res.status < 400,
      body,
      contentType: res.headers.get("content-type") || "",
    });
  } catch (e) {
    return Response.json(
      {
        status: 0,
        ok: false,
        redirected: false,
        body: "",
        contentType: "",
        error:
          "Tidak bisa menjangkau Superset — cek URL/VPN/jaringan internal. " +
          (e instanceof Error ? e.message : ""),
      },
      { status: 502 }
    );
  }
}
