"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { HubIcon, AuthorityIcon } from "@/components/ui/score-icons";
import { SystemGuide } from "@/components/layout/system-guide";
import { NotificationBell } from "@/components/layout/notification-bell";

export function Header() {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4 gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <span className="text-2xl">👣</span>
          <span className="hidden sm:inline">Dapsol</span>
        </Link>

        <div className="flex-1" />

        {/* System guide */}
        <SystemGuide />

        {/* Notifications */}
        {session?.user && <NotificationBell />}

        {/* User area */}
        {session?.user ? (
          <div className="flex items-center gap-3">
            {/* Hub score (발굴 안목) */}
            {session.user.hubScore != null && (
              <Badge
                variant="outline"
                className="font-mono text-xs border-amber-300 text-amber-700 dark:text-amber-400 dark:border-amber-700"
                title="Hub 점수 — 좋은 길을 먼저 발굴하여 보상을 받을수록 상승. 같은 발자국으로 더 큰 지분 확보"
              >
                <HubIcon size={14} className="mr-0.5" /> {(session.user.hubScore as number).toFixed(2)}
              </Badge>
            )}

            {/* Authority score (창작 권위) */}
            {(session.user.authorityScore ?? 0) > 0 && (
              <Badge
                variant="outline"
                className="font-mono text-xs border-blue-300 text-blue-700 dark:text-blue-400 dark:border-blue-700"
                title="Authority 점수 — 내 길에 다른 사람들이 걸어갈수록 상승. 높을수록 품질 풀 보상 유리"
              >
                <AuthorityIcon size={14} className="mr-0.5" /> {session.user.authorityScore!.toFixed(2)}
              </Badge>
            )}

            {/* 발자국 표시 */}
            <Badge variant="secondary" className="font-mono text-sm" title="보유 발자국">
              👣 {session.user.balance ?? "..."}
            </Badge>

            {/* User dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={session.user.image ?? ""} alt={session.user.name ?? ""} />
                    <AvatarFallback>
                      {session.user.name?.charAt(0) ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end">
                <div className="flex items-center gap-2 p-2">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{session.user.name}</p>
                    <p className="text-xs text-muted-foreground">{session.user.email}</p>
                    <p className="text-xs text-muted-foreground space-x-2">
                      {session.user.hubScore != null && (
                        <span className="text-amber-600 dark:text-amber-400 inline-flex items-center gap-0.5">
                          <HubIcon size={12} /> {(session.user.hubScore as number).toFixed(2)}
                        </span>
                      )}
                      {(session.user.authorityScore ?? 0) > 0 && (
                        <span className="text-blue-600 dark:text-blue-400 inline-flex items-center gap-0.5">
                          <AuthorityIcon size={12} /> {session.user.authorityScore!.toFixed(2)}
                        </span>
                      )}
                      <span>👣 {session.user.balance ?? 0}</span>
                    </p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={`/profile/${session.user.id}`}>내 프로필</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/leaderboard">리더보드</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                  로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <Button asChild size="sm">
            <Link href="/login">로그인</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
