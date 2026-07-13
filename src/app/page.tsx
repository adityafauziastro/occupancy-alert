"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Link href="/dashboard" className="text-sm font-semibold text-fit-blue underline">
        Membuka dashboard…
      </Link>
    </div>
  );
}
