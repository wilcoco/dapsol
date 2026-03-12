"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface InvestorComment {
  id: string;
  amount: number;
  isNegative: boolean;
  comment: string;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

interface InvestorCommentsProps {
  qaSetId: string;
}

export function InvestorComments({ qaSetId }: InvestorCommentsProps) {
  const [comments, setComments] = useState<InvestorComment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/qa-sets/${qaSetId}/comments`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setComments(data);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [qaSetId]);

  if (loading || comments.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <span>💬</span> 투자자 코멘트 ({comments.length})
      </div>
      <div className="space-y-1.5">
        {comments.map((c) => (
          <Card key={c.id} className="bg-muted/30">
            <CardContent className="p-2.5 flex items-start gap-2">
              {c.user.image ? (
                <img
                  src={c.user.image}
                  alt=""
                  className="w-5 h-5 rounded-full shrink-0 mt-0.5"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-muted shrink-0 mt-0.5 flex items-center justify-center text-[10px]">
                  ?
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-medium truncate">
                    {c.user.name ?? "익명"}
                  </span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                      c.isNegative
                        ? "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400"
                        : "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {c.isNegative ? "-" : "+"}{c.amount}
                  </span>
                </div>
                <p className="text-sm text-foreground/90 mt-0.5">{c.comment}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
